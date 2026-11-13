import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { p24Config, isValidNotification, type P24Notification } from '../../../lib/p24';
import { finalizePayment } from '../../../lib/payments';

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
    console.warn('P24: nieprawidłowy podpis powiadomienia dla sesji ' + n?.sessionId + ' (sprawdź sekret P24_CRC i P24_MERCHANT_ID)');
    return json(400, { error: 'bad sign' });
  }
  if (!/^[0-9a-f-]{36}$/i.test(n.sessionId)) return json(400, { error: 'bad session' });

  const [order] = await sb.select<any>(`orders?select=id,number,email,status,total,currency,shipping_method,shipping_point,shipping_address,wants_invoice&id=eq.${n.sessionId}`);
  if (!order) { console.warn('P24: powiadomienie dla nieznanej sesji ' + n.sessionId); return json(404, { error: 'order not found' }); }

  await sb.insert('order_events', { order_id: order.id, type: 'p24_notification', data: { ...n, sign: undefined } }, 'id');

  // Już opłacone (P24 może wysłać powiadomienie ponownie) - nic więcej nie robimy
  if (order.status !== 'pending_payment') return json(200, { ok: true });

  if (n.amount !== order.total || n.currency !== order.currency) {
    console.error('P24: kwota niezgodna z zamówieniem', order.number, n.amount, order.total);
    await sb.update(`orders?id=eq.${order.id}`, { status: 'on_hold' }, 'id');
    await sb.insert('order_events', { order_id: order.id, type: 'amount_mismatch', data: { paid: n.amount, expected: order.total } }, 'id');
    return json(200, { ok: true });
  }

  const result = await finalizePayment(env, sb, p24, order, { orderId: n.orderId, methodId: n.methodId, origin: new URL(request.url).origin });
  if (result === 'verify_failed') return json(502, { error: 'verify failed' }); // P24 ponowi powiadomienie
  return json(200, { ok: true });
};
