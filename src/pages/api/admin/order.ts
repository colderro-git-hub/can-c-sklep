import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';
import { sendMail } from '../../../lib/mail';
import { trackingUrl, carrierLabel } from '../../../lib/tracking';
import { orderShippedHtml } from '../../../lib/email-templates';
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
    return json(200, { order, events });
  } catch (e) {
    console.error('Admin order: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd pobierania zamówienia.' });
  }
};

// Akcje: { id, action: 'ship'|'complete'|'hold'|'unhold'|'cancel'|'note', carrier?, tracking?, note?, notify? }
const ALLOWED: Record<string, { from: string[]; to?: string }> = {
  ship: { from: ['paid', 'on_hold'], to: 'shipped' },
  complete: { from: ['paid', 'shipped'], to: 'completed' },
  hold: { from: ['paid'], to: 'on_hold' },
  unhold: { from: ['on_hold'], to: 'paid' },
  cancel: { from: ['pending_payment', 'paid', 'on_hold'], to: 'cancelled' },
  note: { from: [] },
  check_payment: { from: ['pending_payment', 'cancelled'] },
  update: { from: ['pending_payment', 'paid', 'on_hold', 'shipped', 'completed', 'cancelled'] },
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });

  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  const rule = ALLOWED[b?.action];
  if (!rule || !UUID.test(b?.id || '')) return json(400, { error: 'Nieznana akcja.' });

  try {
    const sb = db(env);
    const [order] = await sb.select<any>(`orders?select=id,number,email,status,total,currency,shipping_method,shipping_point,shipping_address,wants_invoice,source&id=eq.${b.id}`);
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

    const patch: Record<string, unknown> = { status: rule.to };
    let carrier = '', tracking = '';
    if (b.action === 'ship') {
      carrier = b.carrier === 'dpd' ? 'dpd' : 'inpost';
      tracking = String(b.tracking || '').replace(/\s/g, '').slice(0, 40);
      if (!/^[A-Za-z0-9-]{6,40}$/.test(tracking)) return json(422, { error: 'Podaj numer przesyłki.' });
      Object.assign(patch, { carrier, tracking_number: tracking, shipped_at: new Date().toISOString() });
    }

    // Warunek na status chroni przed równoczesną zmianą przez dwie osoby
    const updated = await sb.update(`orders?id=eq.${order.id}&status=eq.${order.status}`, patch, 'id');
    if (!updated.length) return json(409, { error: 'Zamówienie zostało w międzyczasie zmienione. Odśwież.' });
    await sb.insert('order_events', { order_id: order.id, type: 'status_change', data: { from: order.status, to: rule.to, by: admin, ...(tracking ? { carrier, tracking } : {}) } }, 'id');

    if (b.action === 'ship' && b.notify !== false) {
      try {
        await sendMail(env, {
          to: order.email,
          subject: `Zamówienie nr ${order.number} zostało wysłane – Can-C`,
          replyTo: env.CONTACT_TO?.split(',')[0]?.trim(),
          html: orderShippedHtml({ site: await getSite(env), origin: new URL(request.url).origin, number: order.number, carrier: carrierLabel(carrier), tracking, trackingUrl: trackingUrl(carrier, tracking) }),
          text: [
            'Dzień dobry,',
            '',
            `Twoje zamówienie nr ${order.number} zostało nadane (${carrier === 'dpd' ? 'kurier DPD' : 'InPost'}).`,
            `Numer przesyłki: ${tracking}`,
            `Śledzenie: ${trackingUrl(carrier, tracking)}`,
            '',
            'Dziękujemy za zakupy!',
            'Zespół Can-C',
          ].join('\n'),
        });
        await sb.insert('order_events', { order_id: order.id, type: 'mail_shipped', data: {} }, 'id');
      } catch (e) {
        console.error('Mail o wysyłce: ' + (e instanceof Error ? e.message : String(e)));
        return json(200, { ok: true, warning: 'Status zmieniony, ale nie udało się wysłać e-maila do klienta.' });
      }
    }
    if (b.action === 'cancel' && order.status !== 'pending_payment') {
      return json(200, { ok: true, warning: 'Zamówienie było opłacone – zwrot środków wykonaj w panelu Przelewy24.' });
    }
    return json(200, { ok: true });
  } catch (e) {
    console.error('Admin akcja: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd zapisu.' });
  }
};
