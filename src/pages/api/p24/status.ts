import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { p24Config, isValidNotification, verifyTransaction, type P24Notification } from '../../../lib/p24';
import { sendMail, zl } from '../../../lib/mail';

export const prerender = false;

// Powiadomienie od Przelewy24 po płatności (urlStatus).
// Kolejność: podpis → zgodność z zamówieniem → potwierdzenie w P24 → status „opłacone” → e-maile.
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  let n: P24Notification;
  try { n = await request.json(); } catch { return json(400, { error: 'bad body' }); }

  const p24 = p24Config(env);
  const sb = db(env);

  if (!(await isValidNotification(p24, n))) {
    console.warn('P24: nieprawidłowy podpis powiadomienia', n?.sessionId);
    return json(400, { error: 'bad sign' });
  }
  if (!/^[0-9a-f-]{36}$/i.test(n.sessionId)) return json(400, { error: 'bad session' });

  const [order] = await sb.select<any>(`orders?select=id,number,email,status,total,currency,shipping_method,shipping_point,shipping_address,wants_invoice&id=eq.${n.sessionId}`);
  if (!order) return json(404, { error: 'order not found' });

  await sb.insert('order_events', { order_id: order.id, type: 'p24_notification', data: { ...n, sign: undefined } }, 'id');

  // Już opłacone (P24 może wysłać powiadomienie ponownie) – nic więcej nie robimy
  if (order.status !== 'pending_payment') return json(200, { ok: true });

  if (n.amount !== order.total || n.currency !== order.currency) {
    console.error('P24: kwota niezgodna z zamówieniem', order.number, n.amount, order.total);
    await sb.update(`orders?id=eq.${order.id}`, { status: 'on_hold' }, 'id');
    await sb.insert('order_events', { order_id: order.id, type: 'amount_mismatch', data: { paid: n.amount, expected: order.total } }, 'id');
    return json(200, { ok: true });
  }

  const ok = await verifyTransaction(p24, { sessionId: order.id, orderId: n.orderId, amount: n.amount });
  if (!ok) {
    await sb.insert('order_events', { order_id: order.id, type: 'p24_verify_failed', data: {} }, 'id');
    return json(502, { error: 'verify failed' }); // P24 ponowi powiadomienie
  }

  // Zmiana statusu tylko z „oczekuje” – chroni przed podwójnym przetworzeniem
  const updated = await sb.update(
    `orders?id=eq.${order.id}&status=eq.pending_payment`,
    { status: 'paid', paid_at: new Date().toISOString(), p24_order_id: n.orderId },
    'id',
  );
  if (!updated.length) return json(200, { ok: true });
  await sb.insert('order_events', { order_id: order.id, type: 'p24_verified', data: { orderId: n.orderId, methodId: n.methodId } }, 'id');
  try { await sb.rpc('redeem_discount', { p_order: order.id }); } catch (e) {
    console.error('Kod rabatowy: ' + (e instanceof Error ? e.message : String(e)));
  }
  try { await sb.rpc('apply_order_stock', { p_order: order.id }); } catch (e) {
    console.error('Stany magazynowe: ' + (e instanceof Error ? e.message : String(e)));
  }

  // ---------- E-maile (błąd wysyłki nie cofa płatności; każdy mail wysyłany niezależnie) ----------
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
  let lines = '', delivery = '';
  try {
    const items = await sb.select<any>(`order_items?select=name,qty,total&order_id=eq.${order.id}`);
    lines = items.map((i) => `• ${i.name} × ${i.qty} – ${zl(i.total)}`).join('\n');
    delivery = order.shipping_method === 'inpost_locker'
      ? `Paczkomat InPost ${order.shipping_point}`
      : `Kurier DPD: ${order.shipping_address?.street}, ${order.shipping_address?.postcode} ${order.shipping_address?.city}`;
  } catch (e) { console.error('Dane do e-maila: ' + errMsg(e)); }
  const origin = new URL(request.url).origin;

  try {
    await sendMail(env, {
      to: order.email,
      subject: `Potwierdzenie zamówienia nr ${order.number} – Can-C`,
      replyTo: env.CONTACT_TO?.split(',')[0]?.trim(),
      text: [
        'Dziękujemy za zamówienie!', '',
        `Numer zamówienia: ${order.number}`,
        `Płatność: przyjęta (${zl(order.total)})`, '',
        lines, '',
        `Dostawa: ${delivery} (bezpłatna)`,
        order.wants_invoice ? 'Faktura: zostanie wysłana osobno.' : '', '',
        'Gdy paczka zostanie nadana, wyślemy numer przesyłki.',
        `Historia zamówień: ${origin}/konto/`, '',
        'Zespół Can-C',
      ].join('\n'),
    });
    await sb.insert('order_events', { order_id: order.id, type: 'mail_confirmation', data: {} }, 'id');
  } catch (e) {
    console.error('E-mail do klienta (potwierdzenie) nie wysłany: ' + errMsg(e));
    await sb.insert('order_events', { order_id: order.id, type: 'mail_failed', data: { to: 'klient', error: errMsg(e).slice(0, 300) } }, 'id').catch(() => {});
  }

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

  return json(200, { ok: true });
};
