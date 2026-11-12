// Wspólne zakończenie płatności: potwierdzenie w P24, status „opłacone”, stany, kod rabatowy, e-maile.
// Używane przez powiadomienie z P24 i przez ręczne sprawdzenie płatności w panelu admina.
import type { Env } from './env';
import type { db } from './supabase';
import { verifyTransaction, type p24Config } from './p24';
import { sendMail, zl } from './mail';
import { getSite } from './site-settings';
import { orderConfirmationHtml } from './email-templates';
import { sendGa4Purchase, shouldSendServerPurchase } from './ga4-mp';

export async function finalizePayment(
  env: Env,
  sb: ReturnType<typeof db>,
  p24: ReturnType<typeof p24Config> | null,
  order: any,
  opts: { orderId: number | null; methodId?: number; origin: string; skipVerify?: boolean; by?: string; from?: string[] },
): Promise<'paid' | 'already' | 'verify_failed'> {
  if (!opts.skipVerify && p24) {
    const ok = await verifyTransaction(p24, { sessionId: order.id, orderId: opts.orderId!, amount: order.total });
    if (!ok) {
      await sb.insert('order_events', { order_id: order.id, type: 'p24_verify_failed', data: {} }, 'id');
      return 'verify_failed';
    }
  }

  // Zmiana statusu tylko z „oczekuje” – chroni przed podwójnym przetworzeniem
  const updated = await sb.update(
    `orders?id=eq.${order.id}&status=in.(${(opts.from || ['pending_payment']).join(',')})`,
    { status: 'paid', paid_at: new Date().toISOString(), ...(opts.orderId ? { p24_order_id: opts.orderId } : {}) },
    'id',
  );
  if (!updated.length) return 'already';
  await sb.insert('order_events', { order_id: order.id, type: 'p24_verified', data: { orderId: opts.orderId, methodId: opts.methodId ?? null, ...(opts.by ? { by: opts.by } : {}) } }, 'id');
  try { await sb.rpc('redeem_discount', { p_order: order.id }); } catch (e) {
    console.error('Kod rabatowy: ' + (e instanceof Error ? e.message : String(e)));
  }
  try { await sb.rpc('apply_order_stock', { p_order: order.id }); } catch (e) {
    console.error('Stany magazynowe: ' + (e instanceof Error ? e.message : String(e)));
  }

  // ---------- E-maile (błąd wysyłki nie cofa płatności; każdy mail wysyłany niezależnie) ----------
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
  let lines = '', delivery = '';
  let itemRows: { name: string; qty: number; total: number }[] = [];
  try {
    const items = await sb.select<any>(`order_items?select=name,qty,total&order_id=eq.${order.id}`);
    itemRows = items;
    lines = items.map((i) => `• ${i.name} × ${i.qty} – ${zl(i.total)}`).join('\n');
    delivery = order.shipping_method === 'inpost_locker'
      ? `Paczkomat InPost ${order.shipping_point}`
      : `Kurier DPD: ${order.shipping_address?.street}, ${order.shipping_address?.postcode} ${order.shipping_address?.city}`;
  } catch (e) { console.error('Dane do e-maila: ' + errMsg(e)); }
  const origin = opts.origin;
  const site = await getSite(env);

  try {
    await sendMail(env, {
      to: order.email,
      subject: `Potwierdzenie zamówienia nr ${order.number} – Can-C`,
      html: orderConfirmationHtml({ site, origin, number: order.number, total: order.total, items: itemRows, delivery, invoice: Boolean(order.wants_invoice), pointName: order.shipping_address?.point_name }),
      replyTo: env.CONTACT_TO?.split(',')[0]?.trim(),
      text: [
        'Dziękujemy za zamówienie!', '',
        `Numer zamówienia: ${order.number}`,
        `Płatność: przyjęta (${zl(order.total)})`, '',
        lines, '',
        `Dostawa: ${delivery} (bezpłatna)`,
        order.wants_invoice ? 'Faktura: zostanie wysłana osobno.' : '', '',
        `Wysyłamy ${site.shippingTime}. Gdy paczka zostanie nadana, wyślemy numer przesyłki.`,
        site.noticeActive ? `Uwaga: ${site.noticeText}` : '',
        `Historia zamówień: ${origin}/konto/`, '',
        'Zespół Can-C',
      ].join('\n'),
    });
    await sb.insert('order_events', { order_id: order.id, type: 'mail_confirmation', data: {} }, 'id');
  } catch (e) {
    console.error('E-mail do klienta (potwierdzenie) nie wysłany: ' + errMsg(e));
    await sb.insert('order_events', { order_id: order.id, type: 'mail_failed', data: { to: 'klient', error: errMsg(e).slice(0, 300) } }, 'id').catch(() => {});
  }

  // GA4 purchase z serwera (przelew tradycyjny, zamówienia z panelu, płatności potwierdzone ręcznie)
  try {
    const [o] = await sb.select<any>(`orders?select=source,payment_provider,attribution,discount_code,shipping_cost,total&id=eq.${order.id}`);
    if (o && shouldSendServerPurchase(env, o, Boolean(opts.by))) {
      const items = await sb.select<any>(`order_items?select=product_id,name,qty,unit_price,discount&order_id=eq.${order.id}`);
      const r = await sendGa4Purchase(env, { id: order.id, total: o.total, shipping_cost: o.shipping_cost, discount_code: o.discount_code, attribution: o.attribution, items });
      await sb.insert('order_events', { order_id: order.id, type: 'ga4_purchase', data: r.ok ? { value: o.total } : { value: o.total, error: r.error } }, 'id');
    }
  } catch (e) { console.error('GA4 purchase: ' + errMsg(e)); }

  if (env.CONTACT_TO) {
    try {
      await sendMail(env, {
        to: env.CONTACT_TO.split(',').map((s) => s.trim()),
        subject: `[can-c.pl] Nowe opłacone zamówienie nr ${order.number} – ${zl(order.total)}`,
        text: `${lines}\n\nDostawa: ${delivery}\nKlient: ${order.email}\nFaktura: ${order.wants_invoice ? 'tak' : 'nie'}\n\nPanel: ${origin}/admin/`,
      });
    } catch (e) {
      console.error('E-mail do sklepu (nowe zamówienie) nie wysłany: ' + errMsg(e));
    }
  }

  return 'paid';
}
