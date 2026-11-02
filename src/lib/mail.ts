// Wysyłka e-maili przez Resend (zwykły tekst).
import type { Env } from './env';

export async function sendMail(env: Env, m: { to: string | string[]; subject: string; text: string; replyTo?: string }) {
  if (!env.RESEND_API_KEY || !env.CONTACT_FROM) throw new Error('Brak konfiguracji Resend');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.CONTACT_FROM, to: m.to, subject: m.subject, text: m.text, ...(m.replyTo ? { reply_to: m.replyTo } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

export const zl = (grosze: number) =>
  new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(grosze / 100);
