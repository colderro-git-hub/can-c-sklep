import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/env';

// Ta trasa działa w Workerze (nie jest generowana jako plik statyczny)
export const prerender = false;

const TOPICS: Record<string, string> = {
  produkt: 'Pytanie o produkt',
  zamowienie: 'Moje zamówienie',
  zwrot: 'Zwrot lub reklamacja',
  wspolpraca: 'Współpraca',
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

const clean = (v: FormDataEntryValue | null, max: number) =>
  String(v ?? '').replace(/\r/g, '').trim().slice(0, max);

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  // Przyjmujemy tylko wysyłkę z naszej strony
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return json(403, { error: 'Niedozwolone źródło żądania.' });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { error: 'Nieprawidłowe dane formularza.' });
  }

  // Pułapka na boty: wypełnione ukryte pole = udajemy sukces i nic nie wysyłamy
  if (clean(form.get('website'), 200)) return json(200, { ok: true });

  const topic = clean(form.get('topic'), 20);
  const name = clean(form.get('name'), 100).replace(/\n/g, ' ');
  const email = clean(form.get('email'), 200);
  const order = clean(form.get('order'), 20).replace(/[^\d\-#A-Za-z]/g, '');
  const message = clean(form.get('message'), 5000);
  const marketing = form.get('marketing') === '1';
  const token = clean(form.get('cf-turnstile-response'), 4096);

  const errors: string[] = [];
  if (!TOPICS[topic]) errors.push('Wybierz temat wiadomości.');
  if (name.length < 2) errors.push('Podaj imię i nazwisko.');
  if (!EMAIL_RE.test(email)) errors.push('Podaj poprawny adres e-mail.');
  if (message.length < 10) errors.push('Wiadomość jest za krótka.');
  if (!token) errors.push('Potwierdź, że nie jesteś robotem.');
  if (errors.length) return json(422, { error: errors.join(' ') });

  const env = await getEnv(locals);
  if (!env.TURNSTILE_SECRET || !env.RESEND_API_KEY || !env.CONTACT_TO || !env.CONTACT_FROM) {
    console.error('Brak konfiguracji formularza kontaktowego (sekrety Workera).');
    return json(500, { error: 'Formularz jest chwilowo niedostępny. Napisz do nas e-mail.' });
  }

  // Weryfikacja Turnstile po stronie serwera
  const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, remoteip: clientAddress ?? '' }),
  }).then((r) => r.json() as Promise<{ success: boolean }>).catch(() => ({ success: false }));
  if (!verify.success) return json(403, { error: 'Weryfikacja nie powiodła się. Odśwież stronę i spróbuj ponownie.' });

  // Treść wysyłana jako zwykły tekst – bez ryzyka wstrzyknięcia HTML
  const text = [
    `Temat: ${TOPICS[topic]}`,
    `Od: ${name} <${email}>`,
    order ? `Numer zamówienia: ${order}` : null,
    `Zgoda marketingowa: ${marketing ? 'tak' : 'nie'}`,
    '',
    message,
  ].filter((l) => l !== null).join('\n');

  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.CONTACT_FROM,
      to: env.CONTACT_TO.split(',').map((s) => s.trim()),
      reply_to: email,
      subject: `[can-c.pl] ${TOPICS[topic]}${order ? ` #${order}` : ''} – ${name}`,
      text,
    }),
  });

  if (!sent.ok) {
    console.error('Resend error', sent.status, await sent.text());
    return json(502, { error: 'Nie udało się wysłać wiadomości. Spróbuj ponownie za chwilę albo napisz e-mail.' });
  }

  return json(200, { ok: true });
};

// Inne metody niż POST
export const ALL: APIRoute = () => json(405, { error: 'Metoda niedozwolona.' });
