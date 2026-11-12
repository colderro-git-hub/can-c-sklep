import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { sendMail } from '../../../lib/mail';
import { getSite } from '../../../lib/site-settings';
import { EMAIL_RE, str } from '../../../lib/validate';
import { consentText, confirmUrl, logConsent, newsletterConfirmHtml, normEmail } from '../../../lib/newsletter';

export const prerender = false;

// Zapis na newsletter: { email, consent: true, token (Turnstile), website (pułapka) } → mail z linkiem potwierdzającym
// Odpowiedź jest taka sama dla nowych i zapisanych adresów (nie zdradzamy, kto jest na liście).
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  if (str(b.website, 100)) return json(200, { ok: true }); // bot
  const email = normEmail(b.email);
  if (!EMAIL_RE.test(email)) return json(422, { error: 'Podaj poprawny adres e-mail.' });
  if (b.consent !== true) return json(422, { error: 'Zaznacz zgodę na otrzymywanie newslettera – bez niej nie możemy wysyłać wiadomości.' });

  const env = await getEnv(locals);
  if (env.TURNSTILE_SECRET) {
    const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: str(b.token, 4096), remoteip: clientAddress ?? '' }) })
      .then((r) => r.json() as Promise<{ success: boolean }>).catch(() => ({ success: false }));
    if (!v.success) return json(403, { error: 'Weryfikacja nie powiodła się. Odśwież stronę i spróbuj ponownie.' });
  }

  const ok = json(200, { ok: true, message: 'Sprawdź skrzynkę – wysłaliśmy link potwierdzający zapis.' });
  try {
    const sb = db(env);
    const [c] = await sb.select<{ id: string; marketing_consent: boolean }>(`customers?select=id,marketing_consent&email=eq.${encodeURIComponent(email)}`);
    if (c?.marketing_consent) return ok; // już zapisany
    // Ochrona przed zasypywaniem cudzej skrzynki: jeden mail potwierdzający na 10 minut
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const recent = await sb.select(`consent_log?select=id&email=eq.${encodeURIComponent(email)}&action=eq.requested&created_at=gte.${encodeURIComponent(since)}&limit=1`).catch(() => []);
    if (recent.length) return ok;

    const site = await getSite(env);
    const origin = new URL(request.url).origin;
    const text = consentText(site.company);
    await logConsent(sb, { email, customer_id: c?.id, action: 'requested', source: 'newsletter', consent_text: text, ip: clientAddress, user_agent: request.headers.get('User-Agent') });
    const url = await confirmUrl(env, origin, email);
    await sendMail(env, {
      to: email,
      subject: 'Potwierdź zapis na newsletter Can-C',
      html: newsletterConfirmHtml({ site, origin, url }),
      text: ['Dziękujemy za zapis na newsletter Can-C!', '', 'Potwierdź adres e-mail i zgodę na informacje handlowe:', url, '', 'Link jest ważny 7 dni. Jeśli to nie Ty, zignoruj tę wiadomość.', '', 'Zespół Can-C'].join('\n'),
    });
    return ok;
  } catch (e) {
    console.error('Newsletter zapis: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Nie udało się zapisać. Spróbuj ponownie za chwilę.' });
  }
};
