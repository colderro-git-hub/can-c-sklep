import type { APIRoute } from 'astro';
import { getEnv, json } from '../../lib/env';
import { db } from '../../lib/supabase';
import { str, EMAIL_RE } from '../../lib/validate';

export const prerender = false;

// Zapis na powiadomienie „Produkt znów dostępny”: { product, email, token (Turnstile), website (pułapka) }
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json(403, { error: 'Niedozwolone źródło żądania.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  if (str(b.website, 100)) return json(200, { ok: true });
  const product = str(b.product, 60);
  const email = str(b.email, 200).toLowerCase();
  if (!/^[a-z0-9-]{2,60}$/.test(product)) return json(400, { error: 'Nieprawidłowy produkt.' });
  if (!EMAIL_RE.test(email)) return json(422, { error: 'Podaj poprawny e-mail.' });

  const env = await getEnv(locals);
  if (env.TURNSTILE_SECRET) {
    const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: str(b.token, 4096), remoteip: clientAddress ?? '' }) })
      .then((r) => r.json() as Promise<{ success: boolean }>).catch(() => ({ success: false }));
    if (!v.success) return json(403, { error: 'Weryfikacja nie powiodła się. Odśwież stronę i spróbuj ponownie.' });
  }
  try {
    const sb = db(env);
    const [p] = await sb.select<{ id: string }>(`products?select=id&id=eq.${product}&active=is.true`);
    if (!p) return json(404, { error: 'Nie znaleziono produktu.' });
    const exists = await sb.select(`stock_notifications?select=id&product_id=eq.${product}&email=eq.${encodeURIComponent(email)}&notified_at=is.null`);
    if (!exists.length) await sb.insert('stock_notifications', { product_id: product, email }, 'id');
    return json(200, { ok: true });
  } catch (e) {
    console.error('Zapis na powiadomienie: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Nie udało się zapisać. Spróbuj ponownie.' });
  }
};
