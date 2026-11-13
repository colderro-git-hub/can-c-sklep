// Alerty o błędach: każde console.error trafia do dziennika (tabela error_log, grupowane po treści),
// a błędy krytyczne (płatności, zamówienia, maile do klientów, Furgonetka, poczta, cron, 5xx) - także na e-mail.
// Limit: ten sam błąd najwyżej raz na 6 godzin, łącznie najwyżej 20 maili na dobę (na izolat Workera).
import type { Env } from './env';
import { db } from './supabase';

type Entry = { area: string; message: string };
const buffer: Entry[] = [];
let installed = false;
let origError: (...a: unknown[]) => void = console.error.bind(console);

// Obszary, o których chcesz wiedzieć od razu
const CRITICAL = /^(P24|Płatność|E-mail do klienta|E-mail do sklepu|Mail przelew|Mail o wysyłce|Mail o kompletowaniu|Mail o zwrocie|Błąd tworzenia zamówienia|Furgonetka|Poczta webhook|Cron|Newsletter paczka|Konfiguracja|Przypomnienia|Prośby o opinię|HTTP 5\d\d)/;

// Przechwycenie console.error (raz na izolat) - istniejący kod loguje „Kontekst: treść”, nic nie trzeba zmieniać
export function installErrorHook() {
  if (installed) return;
  installed = true;
  origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    origError(...args);
    try {
      const text = args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ').slice(0, 1000);
      const i = text.indexOf(': ');
      const area = (i > 0 && i < 60 ? text.slice(0, i) : 'Inne').trim();
      if (buffer.length < 50) buffer.push({ area, message: text });
    } catch { /* logowanie nie może psuć żądania */ }
  };
}

export function queueError(area: string, message: string) {
  if (buffer.length < 50) buffer.push({ area, message: `${area}: ${message}`.slice(0, 1000) });
}

// Grupowanie: bez liczb, UUID, adresów e-mail - te same błędy z różnymi zamówieniami to jeden wpis
const normalize = (s: string) => s.toLowerCase()
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '#id')
  .replace(/[^\s@]+@[^\s@]+/g, '#mail').replace(/\d+/g, '#').slice(0, 300);
async function sha(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

let mailDay = '';
let mailCount = 0;

export async function flushErrors(env: Env, origin: string) {
  if (!buffer.length) return;
  const items = buffer.splice(0, buffer.length);
  const seen = new Set<string>();
  const sb = db(env);
  for (const it of items) {
    try {
      const fp = await sha(`${it.area}|${normalize(it.message)}`);
      if (seen.has(fp)) continue;
      seen.add(fp);
      const critical = CRITICAL.test(it.area) || CRITICAL.test(it.message);
      const now = new Date().toISOString();
      const [row] = await sb.select<{ id: string; count: number; notified_at: string | null }>(`error_log?select=id,count,notified_at&fingerprint=eq.${fp}`);
      let id = row?.id;
      if (row) await sb.update(`error_log?id=eq.${row.id}`, { count: row.count + items.filter((x) => x.area === it.area && normalize(x.message) === normalize(it.message)).length, last_seen: now, message: it.message, resolved_at: null, critical }, 'id');
      else id = (await sb.insert<{ id: string }>('error_log', { fingerprint: fp, area: it.area, message: it.message, critical }, 'id'))[0]?.id;

      // E-mail: tylko krytyczne, ten sam błąd raz na 6 h, maks. 20 dziennie
      const to = String(env.ALERT_EMAIL || env.MAIL_NOTIFY || env.CONTACT_TO || '').split(',').map((x) => x.trim()).filter(Boolean);
      const due = !row?.notified_at || Date.now() - new Date(row.notified_at).getTime() > 6 * 3600e3;
      const day = now.slice(0, 10);
      if (mailDay !== day) { mailDay = day; mailCount = 0; }
      if (critical && due && to.length && id && mailCount < 20 && env.RESEND_API_KEY && env.CONTACT_FROM) {
        mailCount++;
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: env.CONTACT_FROM, to,
            subject: `[can-c.pl] Błąd: ${it.area}`,
            text: [
              `W sklepie wystąpił błąd (${new Date().toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}):`, '',
              it.message, '',
              row ? `To samo zdarzyło się już ${row.count + 1} razy. Kolejny alert o tym błędzie najwcześniej za 6 godzin.` : 'To pierwsze wystąpienie tego błędu.', '',
              `Dziennik błędów: ${origin}/admin/ (Ustawienia sklepu → Błędy systemu)`,
              'Szczegóły w Cloudflare: Workers → can-c → Observability → Logs.',
            ].join('\n'),
          }),
        });
        if (res.ok) await sb.update(`error_log?id=eq.${id}`, { notified_at: now }, 'id');
      }
    } catch (e) {
      // Bez rekurencji: błąd zapisu dziennika tylko w logach Workera
      origError('Alerty: ' + (e instanceof Error ? e.message : String(e)));
    }
  }
}
