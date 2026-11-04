import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../../../lib/env';
import { db } from '../../../../../lib/supabase';
import { authorized } from '../../../../../lib/furgonetka';
import { sendMail } from '../../../../../lib/mail';
import { trackingUrl, carrierLabel } from '../../../../../lib/tracking';
import { orderShippedHtml } from '../../../../../lib/email-templates';
import { getSite } from '../../../../../lib/site-settings';

export const prerender = false;

// POST /api/furgonetka/orders/{numer}/tracking_number  { tracking: { number, courierService } }
// Furgonetka odsyła numer przesyłki po jej utworzeniu.
export const POST: APIRoute = async ({ request, params, locals }) => {
  const env = await getEnv(locals);
  if (!authorized(request, env)) return json(401, { error: 'Unauthorized' });

  const number = Number(params.id);
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Bad request' }); }
  const tracking = String(b?.tracking?.number || '').replace(/\s/g, '').slice(0, 60);
  const carrier = String(b?.tracking?.courierService || '').slice(0, 40);
  if (!Number.isInteger(number) || !tracking) return json(400, { error: 'Bad request' });

  try {
    const sb = db(env);
    const [order] = await sb.select<any>(`orders?select=id,number,email,status,tracking_number&number=eq.${number}`);
    if (!order) return json(404, { error: 'Not found' });

    await sb.insert('order_events', { order_id: order.id, type: 'furgonetka_tracking', data: { tracking, carrier } }, 'id');
    if (order.tracking_number === tracking) return json(200, {}); // powtórzone powiadomienie

    const patch: Record<string, unknown> = { tracking_number: tracking, carrier: carrier || null };
    const becomesShipped = ['paid', 'on_hold'].includes(order.status);
    if (becomesShipped) Object.assign(patch, { status: 'shipped', shipped_at: new Date().toISOString() });
    await sb.update(`orders?id=eq.${order.id}`, patch, 'id');
    if (becomesShipped) {
      await sb.insert('order_events', { order_id: order.id, type: 'status_change', data: { from: order.status, to: 'shipped', by: 'Furgonetka', carrier, tracking } }, 'id');
    }

    try {
      await sendMail(env, {
        to: order.email,
        subject: `Zamówienie nr ${order.number} zostało wysłane – Can-C`,
        replyTo: env.CONTACT_TO?.split(',')[0]?.trim(),
        html: orderShippedHtml({ site: await getSite(env), origin: new URL(request.url).origin, number: order.number, carrier: carrierLabel(carrier), tracking, trackingUrl: trackingUrl(carrier, tracking) }),
        text: [
          'Dzień dobry,', '',
          `Twoje zamówienie nr ${order.number} zostało nadane (${carrierLabel(carrier)}).`,
          `Numer przesyłki: ${tracking}`,
          `Śledzenie: ${trackingUrl(carrier, tracking)}`, '',
          'Dziękujemy za zakupy!', 'Zespół Can-C',
        ].join('\n'),
      });
      await sb.insert('order_events', { order_id: order.id, type: 'mail_shipped', data: {} }, 'id');
    } catch (e) {
      console.error('Mail o wysyłce (Furgonetka): ' + (e instanceof Error ? e.message : String(e)));
    }
    return json(200, {});
  } catch (e) {
    console.error('Furgonetka tracking: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Server error' });
  }
};
