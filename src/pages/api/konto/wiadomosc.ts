import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireCustomer } from '../../../lib/user-auth';
import { sendMail } from '../../../lib/mail';

export const prerender = false;

const TOPICS: Record<string, string> = { pytanie: 'Pytanie', zwrot: 'Zwrot', reklamacja: 'Reklamacja', dostawa: 'Dostawa', faktura: 'Faktura', inne: 'Inne' };

// Wiadomość klienta w sprawie konkretnego zamówienia
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const c = await requireCustomer(request, env);
  if (!c) return json(401, { error: 'Zaloguj się ponownie.' });

  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  const number = Number(b.number);
  const topic = TOPICS[b.topic] ? b.topic : 'pytanie';
  const message = String(b.message || '').replace(/\r/g, '').trim().slice(0, 3000);
  if (!Number.isInteger(number)) return json(400, { error: 'Nieprawidłowe zamówienie.' });
  if (message.length < 5) return json(422, { error: 'Wiadomość jest za krótka.' });

  try {
    const sb = db(env);
    // Zamówienie musi należeć do zalogowanego klienta
    const [order] = await sb.select<any>(`orders?select=id,number,email&number=eq.${number}&customer_id=eq.${c.id}`);
    if (!order) return json(404, { error: 'Nie znaleziono zamówienia.' });

    // Limit: 5 wiadomości na godzinę na zamówienie
    const hourAgo = new Date(Date.now() - 3600e3).toISOString();
    const recent = await sb.select(`order_events?select=id&order_id=eq.${order.id}&type=eq.customer_message&created_at=gte.${encodeURIComponent(hourAgo)}`);
    if (recent.length >= 5) return json(429, { error: 'Wysłano już kilka wiadomości. Odpowiemy wkrótce.' });

    await sb.insert('order_events', { order_id: order.id, type: 'customer_message', data: { topic: TOPICS[topic], message, by: c.email } }, 'id');

    if (env.CONTACT_TO) {
      await sendMail(env, {
        to: env.CONTACT_TO.split(',').map((s) => s.trim()),
        replyTo: c.email,
        subject: `[can-c.pl] ${TOPICS[topic]} - zamówienie nr ${order.number}`,
        text: `Klient: ${c.email}\nZamówienie: ${order.number}\nTemat: ${TOPICS[topic]}\n\n${message}\n\nPanel: ${new URL(request.url).origin}/admin/`,
      });
    }
    return json(200, { ok: true });
  } catch (e) {
    console.error('Wiadomość klienta: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Nie udało się wysłać wiadomości. Napisz przez formularz kontaktowy.' });
  }
};
