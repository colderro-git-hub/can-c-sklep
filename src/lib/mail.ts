// Wysyłka e-maili przez Resend (zwykły tekst).
import type { Env } from './env';
import { typoHtml } from './typography';

// W mailach HTML ta sama typografia co na stronie; klasy CSS nie działają w programach pocztowych, więc styl w atrybucie
const MAIL_NOWRAP = '<span style="white-space:nowrap">';

export async function sendMail(env: Env, m: { to: string | string[]; subject: string; text: string; html?: string; replyTo?: string; headers?: Record<string, string> }) {
  if (!env.RESEND_API_KEY || !env.CONTACT_FROM) throw new Error('Brak konfiguracji Resend');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.CONTACT_FROM, to: m.to, subject: m.subject, text: m.text, ...(m.html ? { html: typoHtml(m.html, { nowrap: MAIL_NOWRAP }) } : {}), ...(m.replyTo ? { reply_to: m.replyTo } : {}), ...(m.headers ? { headers: m.headers } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

export const zl = (grosze: number) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(grosze / 100);

// Wysyłka paczki maili (Resend /emails/batch, maks. 100 na wywołanie) – newsletter
export async function sendBatch(env: Env, mails: { to: string; subject: string; text: string; html: string; replyTo?: string; headers?: Record<string, string> }[]) {
  if (!env.RESEND_API_KEY || !env.CONTACT_FROM) throw new Error('Brak konfiguracji Resend');
  if (!mails.length) return;
  const res = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(mails.slice(0, 100).map((m) => ({
      from: env.CONTACT_FROM, to: m.to, subject: m.subject, text: m.text, html: typoHtml(m.html, { nowrap: MAIL_NOWRAP }),
      ...(m.replyTo ? { reply_to: m.replyTo } : {}), ...(m.headers ? { headers: m.headers } : {}),
    }))),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
