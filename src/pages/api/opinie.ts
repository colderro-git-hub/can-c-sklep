import type { APIRoute } from 'astro';
import { getEnv, json } from '../../lib/env';
import { db } from '../../lib/supabase';
import { sendMail } from '../../lib/mail';
import { str, EMAIL_RE } from '../../lib/validate';

export const prerender = false;

// Nowa opinia – trafia do moderacji. „Zweryfikowany zakup”, gdy e-mail ma opłacone zamówienie z tym produktem.
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json(403, { error: 'Niedozwolone źródło żądania.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  if (str(b.website, 100)) return json(200, { ok: true });

  const product = str(b.product, 60);
  const name = str(b.name, 60);
  const email = str(b.email, 200).toLowerCase();
  const rating = Number(b.rating);
  const title = str(b.title, 120);
  const body = String(b.body || '').replace(/\r/g, '').trim().slice(0, 3000);
  const errors: string[] = [];
  if (!/^[a-z0-9-]{2,60}$/.test(product)) errors.push('Nieprawidłowy produkt.');
  if (name.length < 2) errors.push('Podaj imię (może być samo imię albo pseudonim).');
  if (email && !EMAIL_RE.test(email)) errors.push('Nieprawidłowy e-mail.');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.push('Wybierz ocenę od 1 do 5 gwiazdek.');
  if (body.length < 10) errors.push('Napisz kilka słów (min. 10 znaków).');
  if (b.consent !== true) errors.push('Zaakceptuj zasady publikacji opinii.');
  if (errors.length) return json(422, { error: errors.join(' ') });

  const env = await getEnv(locals);
  // Turnstile (jeśli skonfigurowany) – ochrona przed spamem
  if (env.TURNSTILE_SECRET) {
    const token = str(b.token, 4096);
    const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: clientAddress ?? '' }) })
      .then((r) => r.json() as Promise<{ success: boolean }>).catch(() => ({ success: false }));
    if (!v.success) return json(403, { error: 'Weryfikacja nie powiodła się. Odśwież stronę i spróbuj ponownie.' });
  }

  try {
    const sb = db(env);
    const [p] = await sb.select<{ id: string; name: string }>(`products?select=id,name&id=eq.${product}&active=is.true`);
    if (!p) return json(404, { error: 'Nie znaleziono produktu.' });

    let customer_id: string | null = null;
    let verified = false;
    if (email) {
      const [c] = await sb.select<{ id: string }>(`customers?select=id&email=eq.${encodeURIComponent(email)}`);
      if (c) {
        customer_id = c.id;
        const bought = await sb.select(`order_items?select=id,orders!inner(customer_id,status)&product_id=eq.${product}&orders.customer_id=eq.${c.id}&orders.status=in.(paid,shipped,completed)&limit=1`);
        verified = bought.length > 0;
        const pending = await sb.select(`reviews?select=id&product_id=eq.${product}&customer_id=eq.${c.id}&status=eq.pending`);
        if (pending.length) return json(429, { error: 'Twoja opinia o tym produkcie czeka już na moderację.' });
      }
    }
    await sb.insert('reviews', { product_id: product, customer_id, author_name: name, email: email || null, rating, title: title || null, body, verified_purchase: verified }, 'id');

    if (env.CONTACT_TO) {
      await sendMail(env, {
        to: env.CONTACT_TO.split(',').map((s) => s.trim()),
        subject: `[can-c.pl] Nowa opinia do moderacji: ${p.name} – ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`,
        text: `${name}${email ? ` <${email}>` : ''}${verified ? ' (zweryfikowany zakup)' : ''}\n\n${title ? title + '\n' : ''}${body}\n\nModeracja: ${new URL(request.url).origin}/admin/`,
      }).catch(() => {});
    }
    return json(200, { ok: true, verified });
  } catch (e) {
    console.error('Opinia: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Nie udało się zapisać opinii.' });
  }
};
