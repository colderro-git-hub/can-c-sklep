import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';
import { sendMail } from '../../../lib/mail';

export const prerender = false;

const UUID = /^[0-9a-f-]{36}$/i;
const trackingUrl = (carrier: string, nr: string) =>
  carrier === 'dpd'
    ? `https://tracktrace.dpd.com.pl/parcelDetails?typ=1&p1=${encodeURIComponent(nr)}`
    : `https://inpost.pl/sledzenie-przesylek?number=${encodeURIComponent(nr)}`;

// Szczegóły zamówienia: ?id=uuid
export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  const id = url.searchParams.get('id') || '';
  if (!UUID.test(id)) return json(400, { error: 'Nieprawidłowy identyfikator.' });
  try {
    const sb = db(env);
    const [order] = await sb.select(`orders?select=*,order_items(name,qty,unit_price,discount,total),customers(first_name,last_name,phone,marketing_consent)&id=eq.${id}`);
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
    const [order] = await sb.select<any>(`orders?select=id,number,email,status,shipping_method&id=eq.${b.id}`);
    if (!order) return json(404, { error: 'Nie znaleziono.' });

    if (b.action === 'note') {
      const note = String(b.note || '').trim().slice(0, 1000);
      if (!note) return json(422, { error: 'Wpisz treść notatki.' });
      await sb.insert('order_events', { order_id: order.id, type: 'note', data: { note, by: admin } }, 'id');
      return json(200, { ok: true });
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
