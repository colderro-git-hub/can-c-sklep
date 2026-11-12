import type { APIRoute } from 'astro';
import { getEnv, json, type Env } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';
import { sendMail } from '../../../lib/mail';
import { trackingUrl, carrierLabel } from '../../../lib/tracking';
import { orderShippedHtml, orderRefundedHtml, orderPackingHtml } from '../../../lib/email-templates';
import { clearCatalogCache } from '../../../lib/catalog';
import { BANK_PROVIDER } from '../../../lib/bank-transfer';
import { sendGa4Refund, ga4MpConfigured } from '../../../lib/ga4-mp';
import { later } from '../../../lib/background';
import { getSite } from '../../../lib/site-settings';
import { p24Config, getTransaction } from '../../../lib/p24';
import { finalizePayment } from '../../../lib/payments';
import { str, EMAIL_RE, POSTCODE_RE, LOCKER_RE, cleanPhone, validPhone, validNip } from '../../../lib/validate';

export const prerender = false;

const UUID = /^[0-9a-f-]{36}$/i;
// Szczegóły zamówienia: ?id=uuid
export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  const id = url.searchParams.get('id') || '';
  if (!UUID.test(id)) return json(400, { error: 'Nieprawidłowy identyfikator.' });
  try {
    const sb = db(env);
    const [order] = await sb.select(`orders?select=*,order_items(name,qty,unit_price,discount,total,product_id),customers(id,first_name,last_name,phone,marketing_consent,admin_note)&id=eq.${id}`);
    if (!order) return json(404, { error: 'Nie znaleziono.' });
    const events = await sb.select(`order_events?select=type,data,created_at&order_id=eq.${id}&order=created_at.asc`);
    // Promocje naliczone w zamówieniu (tabela z migracji 019 – bez niej pusta lista)
    const promotions = await sb.select(`order_promotions?select=promotion_id,name,amount&order_id=eq.${id}&order=created_at.asc`).catch(() => []);
    return json(200, { order: { ...order, promotions }, events });
  } catch (e) {
    console.error('Admin order: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd pobierania zamówienia.' });
  }
};

// Akcje: { id, action: 'ship'|'pack'|'complete'|'hold'|'unhold'|'cancel'|'refund'|'note', carrier?, tracking?, note?, notify?, message? }
// refund: { amount (grosze, domyślnie całość), restock, notify, message (do klienta) }
// bulk:   { action: 'bulk', ids: [...], to: 'pack'|'complete'|'hold'|'unhold'|'cancel', notify?, message? }
const ALLOWED: Record<string, { from: string[]; to?: string }> = {
  ship: { from: ['paid', 'packing', 'on_hold'], to: 'shipped' },
  pack: { from: ['paid', 'on_hold'], to: 'packing' },          // kompletowanie + mail do klienta
  complete: { from: ['paid', 'packing', 'shipped'], to: 'completed' },
  finalize_bank: { from: ['pending_payment'], to: 'paid' },  // przelew bankowy: admin potwierdza wpłatę
  hold: { from: ['paid', 'packing'], to: 'on_hold' },
  unhold: { from: ['on_hold'], to: 'paid' },
  cancel: { from: ['pending_payment', 'paid', 'packing', 'on_hold'], to: 'cancelled' },
  // Zwrot: tylko zamówienia opłacone (także anulowane po opłaceniu); pieniądze oddaje admin w P24 / banku
  refund: { from: ['paid', 'packing', 'on_hold', 'shipped', 'completed', 'cancelled'], to: 'refunded' },
  note: { from: [] },
  check_payment: { from: ['pending_payment', 'cancelled'] },
  update: { from: ['pending_payment', 'paid', 'packing', 'on_hold', 'shipped', 'completed', 'cancelled'] },
};
const BULK = ['pack', 'complete', 'hold', 'unhold', 'cancel'];
const ORDER_COLS = 'id,number,email,status,total,currency,shipping_method,shipping_point,shipping_address,wants_invoice,source,customers(first_name)';

type Ctx = { env: Env; sb: ReturnType<typeof db>; admin: string; origin: string };
type Result = { ok: true; warning?: string } | { ok: false; status: number; error: string };

// Zmiana statusu (pojedyncza i zbiorcza): warunek na poprzedni status, wpis w historii, e-mail do klienta
async function transition(ctx: Ctx, order: any, action: string, o: { notify?: boolean; carrier?: string; tracking?: string; message?: string } = {}): Promise<Result> {
  const { env, sb, admin, origin } = ctx;
  const rule = ALLOWED[action];
  if (!rule?.to) return { ok: false, status: 400, error: 'Nieznana akcja.' };
  // Zamówienia z WooCommerce obsługuje stary sklep aż do dnia startu (wtedy ustawimy ALLOW_WC_ACTIONS=true)
  if (order.source === 'woocommerce' && env.ALLOW_WC_ACTIONS !== 'true') return { ok: false, status: 409, error: 'Zamówienie z WooCommerce – obsłuż je w obecnym sklepie.' };
  if (!rule.from.includes(order.status)) return { ok: false, status: 409, error: `Nie można wykonać tej akcji dla statusu „${order.status}”.` };

  const patch: Record<string, unknown> = { status: rule.to };
  let carrier = '', tracking = '';
  if (action === 'ship') {
    carrier = o.carrier === 'dpd' ? 'dpd' : 'inpost';
    tracking = String(o.tracking || '').replace(/\s/g, '').slice(0, 40);
    if (!/^[A-Za-z0-9-]{6,40}$/.test(tracking)) return { ok: false, status: 422, error: 'Podaj numer przesyłki.' };
    Object.assign(patch, { carrier, tracking_number: tracking, shipped_at: new Date().toISOString() });
  }
  // Warunek na status chroni przed równoczesną zmianą przez dwie osoby
  const updated = await sb.update(`orders?id=eq.${order.id}&status=eq.${order.status}`, patch, 'id');
  if (!updated.length) return { ok: false, status: 409, error: 'Zamówienie zostało w międzyczasie zmienione. Odśwież.' };
  const message = String(o.message ?? '').replace(/\r/g, '').trim().slice(0, 600);
  await sb.insert('order_events', { order_id: order.id, type: 'status_change', data: { from: order.status, to: rule.to, by: admin, ...(tracking ? { carrier, tracking } : {}), ...(message && action === 'pack' ? { note: message } : {}) } }, 'id');

  if (action === 'ship' && o.notify !== false) {
    try {
      await sendMail(env, {
        to: order.email,
        subject: `Zamówienie nr ${order.number} zostało wysłane – Can-C`,
        replyTo: env.CONTACT_TO?.split(',')[0]?.trim(),
        html: orderShippedHtml({ site: await getSite(env), origin, number: order.number, carrier: carrierLabel(carrier), tracking, trackingUrl: trackingUrl(carrier, tracking) }),
        text: [
          'Dzień dobry,', '',
          `Twoje zamówienie nr ${order.number} zostało nadane (${carrier === 'dpd' ? 'kurier DPD' : 'InPost'}).`,
          `Numer przesyłki: ${tracking}`,
          `Śledzenie: ${trackingUrl(carrier, tracking)}`, '',
          'Dziękujemy za zakupy!', 'Zespół Can-C',
        ].join('\n'),
      });
      await sb.insert('order_events', { order_id: order.id, type: 'mail_shipped', data: {} }, 'id');
    } catch (e) {
      console.error('Mail o wysyłce: ' + (e instanceof Error ? e.message : String(e)));
      return { ok: true, warning: 'Status zmieniony, ale nie udało się wysłać e-maila do klienta.' };
    }
  }

  if (action === 'pack' && o.notify !== false) {
    try {
      const items = await sb.select<{ name: string; qty: number; total: number }>(`order_items?select=name,qty,total&order_id=eq.${order.id}`);
      const a = order.shipping_address || {};
      const delivery = order.shipping_method === 'inpost_locker'
        ? `Paczkomat InPost ${order.shipping_point || ''}${a.point_name ? ` (${a.point_name})` : ''}`
        : `Kurier DPD: ${[a.street, `${a.postcode || ''} ${a.city || ''}`.trim()].filter(Boolean).join(', ')}`;
      const firstName = order.customers?.first_name || null;
      await sendMail(env, {
        to: order.email,
        subject: `Kompletujemy zamówienie nr ${order.number} – Can-C`,
        replyTo: env.CONTACT_TO?.split(',')[0]?.trim(),
        html: orderPackingHtml({ site: await getSite(env), origin, number: order.number, firstName, items, delivery, message }),
        text: [
          firstName ? `Dzień dobry ${firstName},` : 'Dzień dobry,', '',
          `zamówienie nr ${order.number} jest właśnie przygotowywane do wysyłki.`,
          'Gdy paczka zostanie nadana, wyślemy numer przesyłki.',
          ...(message ? ['', message] : []), '',
          ...items.map((i) => `• ${i.name} × ${i.qty}`), '',
          `Dostawa: ${delivery}`,
          `Twoje zamówienia: ${origin}/konto/`, '',
          'Zespół Can-C',
        ].join('\n'),
      });
      await sb.insert('order_events', { order_id: order.id, type: 'mail_packing', data: {} }, 'id');
    } catch (e) {
      console.error('Mail o kompletowaniu: ' + (e instanceof Error ? e.message : String(e)));
      await sb.insert('order_events', { order_id: order.id, type: 'mail_failed', data: { error: 'mail o kompletowaniu' } }, 'id').catch(() => {});
      return { ok: true, warning: 'Status zmieniony, ale nie udało się wysłać e-maila do klienta.' };
    }
  }
  if (action === 'cancel' && order.status !== 'pending_payment') {
    return { ok: true, warning: 'Zamówienie było opłacone – zwrot środków wykonaj w panelu Przelewy24 (albo użyj „Zwrot środków”).' };
  }
  return { ok: true };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });

  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }

  // Zbiorcza zmiana statusu zaznaczonych zamówień – każde osobno, z tymi samymi regułami co pojedynczo
  if (b?.action === 'bulk') {
    const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(String))].filter((x) => UUID.test(x as string)).slice(0, 200) as string[];
    if (!ids.length) return json(400, { error: 'Zaznacz zamówienia.' });
    if (!BULK.includes(b.to)) return json(400, { error: 'Tej zmiany nie można wykonać zbiorczo.' });
    try {
      const sb = db(env);
      const ctx: Ctx = { env, sb, admin, origin: new URL(request.url).origin };
      const orders = await sb.select<any>(`orders?select=${ORDER_COLS}&id=in.(${ids.join(',')})&order=number.asc`);
      let done = 0;
      const failed: { number: number; error: string }[] = [];
      const warned: number[] = [];
      for (const order of orders) {
        try {
          const r = await transition(ctx, order, b.to, { notify: b.notify !== false, message: b.message });
          if (r.ok) { done++; if (r.warning && b.to !== 'cancel') warned.push(order.number); }
          else failed.push({ number: order.number, error: r.error });
        } catch (e) {
          console.error(`Zbiorczo ${order.number}: ` + (e instanceof Error ? e.message : String(e)));
          failed.push({ number: order.number, error: 'Błąd zapisu.' });
        }
      }
      console.log(`Admin ${admin}: zbiorczo ${b.to} – ${done}/${orders.length}`);
      return json(200, { ok: true, done, failed, mailFailed: warned });
    } catch (e) {
      console.error('Admin zbiorczo: ' + (e instanceof Error ? e.message : String(e)));
      return json(500, { error: 'Błąd zapisu.' });
    }
  }

  const rule = ALLOWED[b?.action];
  if (!rule || !UUID.test(b?.id || '')) return json(400, { error: 'Nieznana akcja.' });

  try {
    const sb = db(env);
    const [order] = await sb.select<any>(`orders?select=${ORDER_COLS}&id=eq.${b.id}`);
    if (!order) return json(404, { error: 'Nie znaleziono.' });

    // Edycja danych zamówienia (kontakt, dostawa, faktura, uwagi) – kwoty i produkty bez zmian
    if (b.action === 'update') {
      if (order.source === 'woocommerce' && env.ALLOW_WC_ACTIONS !== 'true') return json(409, { error: 'Zamówienie z WooCommerce – edytuj je w obecnym sklepie.' });
      const email = str(b.email, 200).toLowerCase();
      const phone = cleanPhone(b.phone);
      const name = str(b.name, 120);
      const method = b.shipping_method === 'dpd' ? 'dpd' : 'inpost_locker';
      const locker = str(b.shipping_point, 15).toUpperCase();
      const addr = { street: str(b.street, 120), postcode: str(b.postcode, 6), city: str(b.city, 60) };
      const inv = { company: str(b.company, 150), nip: str(b.nip, 13).replace(/\D/g, ''), street: str(b.invStreet, 120), postcode: str(b.invPostcode, 6), city: str(b.invCity, 60) };
      const wantsInvoice = b.wants_invoice === true;
      const errors: string[] = [];
      if (!EMAIL_RE.test(email)) errors.push('Nieprawidłowy e-mail.');
      if (phone && !validPhone(phone)) errors.push('Telefon: 9 cyfr.');
      if (name.length < 3) errors.push('Podaj imię i nazwisko.');
      if (method === 'inpost_locker' && !LOCKER_RE.test(locker)) errors.push('Podaj kod Paczkomatu.');
      if (method === 'dpd' && (!addr.street || !POSTCODE_RE.test(addr.postcode) || !addr.city)) errors.push('Uzupełnij adres dostawy.');
      if (wantsInvoice && (!inv.company || !validNip(inv.nip))) errors.push('Faktura: podaj firmę i poprawny NIP.');
      if (errors.length) return json(422, { error: errors.join(' ') });
      const [full] = await sb.select<any>(`orders?select=shipping_address&id=eq.${order.id}`);
      const pointName = method === 'inpost_locker' && locker === order.shipping_point ? full?.shipping_address?.point_name : undefined;
      const patch = {
        email, shipping_method: method, shipping_point: method === 'inpost_locker' ? locker : null,
        shipping_address: method === 'dpd' ? { name, phone, ...addr, country: 'PL' } : { name, phone, ...(pointName ? { point_name: pointName } : {}) },
        wants_invoice: wantsInvoice, billing: wantsInvoice ? inv : null, customer_note: str(b.customer_note, 500) || null,
      };
      await sb.update(`orders?id=eq.${order.id}`, patch, 'id');
      await sb.insert('order_events', { order_id: order.id, type: 'edited', data: { by: admin } }, 'id');
      return json(200, { ok: true });
    }

    // Ręczne sprawdzenie płatności w P24 (gdy powiadomienie nie dotarło)
    if (b.action === 'check_payment') {
      if (!rule.from.includes(order.status)) return json(409, { error: 'Zamówienie nie czeka na płatność.' });
      const p24 = p24Config(env);
      const t = await getTransaction(p24, order.id);
      await sb.insert('order_events', { order_id: order.id, type: 'p24_check', data: { by: admin, status: t?.status ?? null, amount: t?.amount ?? null } }, 'id');
      if (!t || t.status === 0) return json(200, { ok: true, warning: 'W Przelewy24 nie ma jeszcze wpłaty dla tego zamówienia.' });
      if (t.status === 3) return json(200, { ok: true, warning: 'Płatność w Przelewy24 została zwrócona.' });
      if (t.amount !== order.total) {
        await sb.insert('order_events', { order_id: order.id, type: 'amount_mismatch', data: { paid: t.amount, expected: order.total } }, 'id');
        return json(200, { ok: true, warning: `Kwota w P24 (${(t.amount / 100).toFixed(2)} zł) nie zgadza się z zamówieniem – sprawdź ręcznie.` });
      }
      const r = await finalizePayment(env, sb, p24, order, {
        orderId: t.orderId, methodId: t.paymentMethod, origin: new URL(request.url).origin,
        skipVerify: t.status === 2, by: admin, from: rule.from,
      });
      if (r === 'verify_failed') return json(502, { error: 'Przelewy24 odrzuciły potwierdzenie transakcji.' });
      return json(200, { ok: true, warning: r === 'already' ? 'Zamówienie było już opłacone.' : undefined });
    }

    // Przelew bankowy: admin ręcznie potwierdza wpłatę → paid + mail potwierdzenia
    if (b.action === 'finalize_bank') {
      if (!rule.from.includes(order.status)) return json(409, { error: 'Zamówienie nie czeka na płatność.' });
      const [fullOrder] = await sb.select<any>(`orders?select=*&id=eq.${order.id}`);
      if (!fullOrder || fullOrder.payment_provider !== 'bank_transfer') return json(409, { error: 'To zamówienie nie jest przelewem bankowym.' });
      const r = await finalizePayment(env, sb, null, fullOrder, {
        orderId: null, origin: new URL(request.url).origin, skipVerify: true, by: admin, from: rule.from,
      });
      if (r === 'already') return json(200, { ok: true, warning: 'Zamówienie było już opłacone.' });
      return json(200, { ok: true });
    }

    if (b.action === 'note') {
      const note = String(b.note || '').trim().slice(0, 1000);
      if (!note) return json(422, { error: 'Wpisz treść notatki.' });
      await sb.insert('order_events', { order_id: order.id, type: 'note', data: { note, by: admin } }, 'id');
      return json(200, { ok: true });
    }

    // Zamówienia z WooCommerce obsługuje stary sklep aż do dnia startu (wtedy ustawimy ALLOW_WC_ACTIONS=true)
    if (order.source === 'woocommerce' && env.ALLOW_WC_ACTIONS !== 'true') {
      return json(409, { error: 'To zamówienie pochodzi z WooCommerce – obsłuż je w obecnym sklepie.' });
    }
    if (!rule.from.includes(order.status)) return json(409, { error: `Nie można wykonać tej akcji dla statusu „${order.status}”.` });

    if (b.action === 'refund') {
      const [full] = await sb.select<any>(`orders?select=paid_at,payment_provider,attribution,customers(first_name)&id=eq.${order.id}`);
      if (!full?.paid_at) return json(409, { error: 'Zamówienie nie zostało opłacone – nie ma czego zwracać. Użyj „Anuluj”.' });
      const amount = b.amount === undefined || b.amount === null || b.amount === '' ? order.total : Math.round(Number(b.amount));
      if (!Number.isFinite(amount) || amount <= 0 || amount > order.total) return json(422, { error: `Kwota zwrotu: od 0,01 zł do ${(order.total / 100).toFixed(2).replace('.', ',')} zł.` });
      const message = String(b.message ?? '').replace(/\r/g, '').trim().slice(0, 1000);
      const now = new Date().toISOString();
      const updated = await sb.update(`orders?id=eq.${order.id}&status=eq.${order.status}`, { status: 'refunded', refunded_amount: amount, refunded_at: now }, 'id');
      if (!updated.length) return json(409, { error: 'Zamówienie zostało w międzyczasie zmienione. Odśwież.' });
      await sb.insert('order_events', { order_id: order.id, type: 'status_change', data: { from: order.status, to: 'refunded', by: admin, amount, restock: b.restock === true, ...(message ? { note: message } : {}) } }, 'id');

      const warnings: string[] = [];
      // GA4: zdarzenie refund z serwera (panel nie ładuje GTM); wynik w historii zamówienia
      if (ga4MpConfigured(env) && order.source !== 'woocommerce') {
        await later(locals, sendGa4Refund(env, { id: order.id, amount, attribution: full.attribution }).then((r) =>
          sb.insert('order_events', { order_id: order.id, type: 'ga4_refund', data: r.ok ? { amount } : { amount, error: r.error } }, 'id')));
      }
      if (b.restock === true) {
        try { await sb.rpc('restore_order_stock', { p_order: order.id }); clearCatalogCache(); await sb.insert('order_events', { order_id: order.id, type: 'stock_restored', data: { by: admin } }, 'id'); }
        catch (e) { console.error('Zwrot – stan magazynowy: ' + (e instanceof Error ? e.message : String(e))); warnings.push('Nie udało się przywrócić stanów magazynowych (czy uruchomiono 018_zwroty.sql?).'); }
      }
      if (b.notify !== false) {
        const method = full.payment_provider === BANK_PROVIDER ? 'przelewem na konto, z którego otrzymaliśmy wpłatę'
          : full.payment_provider === 'przelewy24' ? 'tą samą metodą, którą zapłacono (przez Przelewy24)' : 'tą samą metodą, którą zapłacono';
        const firstName = full.customers?.first_name || null;
        const kwota = (amount / 100).toFixed(2).replace('.', ',') + ' zł';
        try {
          await sendMail(env, {
            to: order.email,
            subject: `Zwrot środków – zamówienie nr ${order.number} – Can-C`,
            replyTo: env.CONTACT_TO?.split(',')[0]?.trim(),
            html: orderRefundedHtml({ site: await getSite(env), origin: new URL(request.url).origin, number: order.number, firstName, amount, total: order.total, method, note: message }),
            text: [
              firstName ? `Dzień dobry ${firstName},` : 'Dzień dobry,',
              '',
              `${amount < order.total ? 'zleciliśmy częściowy zwrot' : 'zleciliśmy zwrot'} pieniędzy za zamówienie nr ${order.number}.`,
              `Kwota zwrotu: ${kwota}`,
              ...(message ? ['', message] : []),
              '',
              `Pieniądze wrócą ${method}. Zwykle trwa to do 5 dni roboczych, w zależności od banku.`,
              '',
              'Zespół Can-C',
            ].join('\n'),
          });
          await sb.insert('order_events', { order_id: order.id, type: 'mail_refunded', data: { amount } }, 'id');
        } catch (e) {
          console.error('Mail o zwrocie: ' + (e instanceof Error ? e.message : String(e)));
          await sb.insert('order_events', { order_id: order.id, type: 'mail_failed', data: { error: 'mail o zwrocie' } }, 'id').catch(() => {});
          warnings.push('Nie udało się wysłać e-maila do klienta.');
        }
      }
      if (full.payment_provider !== BANK_PROVIDER) warnings.unshift('Pamiętaj o zleceniu zwrotu w panelu Przelewy24 – zmiana statusu nie przelewa pieniędzy.');
      else warnings.unshift('Pamiętaj o wykonaniu przelewu zwrotnego – zmiana statusu nie przelewa pieniędzy.');
      return json(200, { ok: true, warning: warnings.join(' ') });
    }

    const r = await transition({ env, sb, admin, origin: new URL(request.url).origin }, order, b.action, { notify: b.notify, carrier: b.carrier, tracking: b.tracking, message: b.message });
    return r.ok ? json(200, { ok: true, ...(r.warning ? { warning: r.warning } : {}) }) : json(r.status, { error: r.error });
  } catch (e) {
    console.error('Admin akcja: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd zapisu.' });
  }
};
