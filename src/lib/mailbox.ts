// Korespondencja: poczta kontakt@can-c.pl odbierana przez Resend (webhook) i formularz /kontakt → wątki w bazie.
// Odpowiedzi z panelu (krok B) dostają własny Message-ID, więc odpowiedź klienta trafia do tego samego wątku.
import type { Env } from './env';
import type { db as dbFn } from './supabase';
import { sendMail } from './mail';

type Sb = ReturnType<typeof dbFn>;

// ---------- Adresy ----------
export type Addr = { email: string; name: string | null };
// „Jan Kowalski <jan@x.pl>” / „jan@x.pl” / „"Kowalski, Jan" <jan@x.pl>”
export function parseAddr(raw: unknown): Addr | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (m ? m[2] : s).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const name = m ? m[1].trim().replace(/\\"/g, '"') : '';
  return { email, name: name || null };
}
export const parseList = (raw: unknown): Addr[] =>
  (Array.isArray(raw) ? raw : String(raw ?? '').split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)).map(parseAddr).filter(Boolean) as Addr[];

// Adresy skrzynki sklepu: MAIL_INBOX (np. „kontakt@can-c.pl”, do testów adres *.resend.app), po przecinku
export const inboxAddresses = (env: Env) =>
  String(env.MAIL_INBOX || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
export const isOurAddress = (env: Env, email: string) => inboxAddresses(env).includes(email.toLowerCase());

// ---------- Temat i treść ----------
// „Re: Odp: FW: Temat” → „Temat” (łączenie wątków bez nagłówków References)
export const baseSubject = (s: string) =>
  s.replace(/^\s*((re|odp|fwd?|pd|aw|sv|tr|wg)\s*(\[\d+\])?\s*:\s*)+/i, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Krótki podgląd: bez cytowanej historii („> …”, „W dniu … napisał:”, „On … wrote:”)
export function snippetOf(text: string | null | undefined, html?: string | null) {
  let t = text || (html ? html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'") : '');
  const cut = t.search(/^\s*(>|W dniu .+napisał|On .+wrote:|-----\s*(Original|Oryginalna) )/im);
  if (cut > 0) t = t.slice(0, cut);
  return t.replace(/\s+/g, ' ').trim().slice(0, 200);
}

// Numer zamówienia w temacie lub treści („zamówienie nr 1234”, „#1234”)
export function findOrderNumber(...texts: (string | null | undefined)[]) {
  for (const t of texts) {
    const m = String(t || '').match(/(?:zam[óo]wieni\w*|order|nr\.?|#)\s*(?:nr\.?\s*)?#?\s*(\d{3,8})\b/i);
    if (m) return Number(m[1]);
  }
  return null;
}

// Nadawcy powiadomień automatycznych (bank, płatności, kurierzy, platformy) → kategoria „Systemowe”
const SYSTEM_FROM = /^(no-?reply|noreply|nie-?odpowiadaj|notifications?|powiadomienia|mailer-daemon|postmaster|bounce|alerts?|info@.*(przelewy24|furgonetka|inpost|dpd)|.*@(przelewy24\.pl|furgonetka\.pl|inpost\.pl|dpd\.com\.pl|google\.com|facebookmail\.com|resend\.(dev|com)|supabase\.(io|com)|cloudflare\.com|allegro\.pl))/i;
export function isSystemMail(from: string, headers: Record<string, string> = {}) {
  const h = (k: string) => String(headers[k] ?? headers[k.toLowerCase()] ?? '').toLowerCase();
  if (SYSTEM_FROM.test(from)) return true;
  if (h('auto-submitted') && h('auto-submitted') !== 'no') return true;
  if (/^(bulk|list|junk)$/.test(h('precedence'))) return true;
  if (h('list-unsubscribe') || h('list-id')) return true;
  return false;
}

// Nagłówek References / In-Reply-To → lista identyfikatorów „<…>”
export const msgIds = (raw: unknown) => (String(raw ?? '').match(/<[^<>\s]+>/g) ?? []).slice(-50);

// ---------- Wątki ----------
type NewMessage = {
  direction: 'in' | 'out';
  source: 'resend' | 'form' | 'panel' | 'import';
  message_id?: string | null;
  in_reply_to?: string | null;
  refs?: string[];
  resend_id?: string | null;
  from: Addr;
  to?: string[];
  cc?: string[];
  subject: string;
  text?: string | null;
  html?: string | null;
  attachments?: unknown[];
  auth?: unknown;
  sent_by?: string | null;
  sent_at?: string;
};

// Wątek dla wiadomości: najpierw po nagłówkach (Message-ID z References / In-Reply-To),
// potem po kontakcie i temacie (bez „Re:”) z ostatnich 60 dni, inaczej nowy
export async function threadFor(sb: Sb, o: { refs: string[]; contact: Addr; subject: string; category: 'customer' | 'system' | 'other'; orderNumber: number | null }) {
  if (o.refs.length) {
    const list = o.refs.map((r) => `"${r.replace(/"/g, '')}"`).join(',');
    const [hit] = await sb.select<{ thread_id: string }>(`mail_messages?select=thread_id&message_id=in.(${encodeURIComponent(list)})&order=sent_at.desc&limit=1`);
    if (hit) return hit.thread_id;
  }
  const subj = baseSubject(o.subject);
  if (subj) {
    const since = new Date(Date.now() - 60 * 864e5).toISOString();
    const rows = await sb.select<{ id: string; subject: string }>(
      `mail_threads?select=id,subject&contact_email=eq.${encodeURIComponent(o.contact.email)}&last_message_at=gte.${encodeURIComponent(since)}&order=last_message_at.desc&limit=20`,
    );
    const same = rows.find((r) => baseSubject(r.subject) === subj);
    if (same) return same.id;
  }
  const [c] = await sb.select<{ id: string }>(`customers?select=id&email=eq.${encodeURIComponent(o.contact.email)}`).catch(() => []);
  const [t] = await sb.insert<{ id: string }>('mail_threads', {
    subject: o.subject.replace(/^\s*((re|odp|fwd?|pd|aw)\s*:\s*)+/i, '').trim().slice(0, 300) || '(bez tematu)',
    contact_email: o.contact.email, contact_name: o.contact.name, customer_id: c?.id ?? null,
    category: o.category, order_number: o.orderNumber,
  }, 'id');
  return t.id;
}

// Zapis wiadomości i aktualizacja wątku (licznik, nieprzeczytane, podgląd; nowa wiadomość od klienta otwiera wątek)
export async function addMessage(sb: Sb, threadId: string, m: NewMessage) {
  const snippet = snippetOf(m.text, m.html);
  const [row] = await sb.insert<{ id: string }>('mail_messages', {
    thread_id: threadId, direction: m.direction, source: m.source,
    message_id: m.message_id || null, in_reply_to: m.in_reply_to || null, refs: m.refs ?? [], resend_id: m.resend_id || null,
    from_email: m.from.email, from_name: m.from.name, to_emails: m.to ?? [], cc_emails: m.cc ?? [],
    subject: m.subject.slice(0, 300), text_body: m.text ?? null, html_body: m.html ?? null, snippet,
    attachments: m.attachments ?? [], auth: m.auth ?? null, sent_by: m.sent_by ?? null,
    sent_at: m.sent_at || new Date().toISOString(),
  }, 'id');
  const [t] = await sb.select<{ unread: number; message_count: number; status: string; order_number: number | null }>(`mail_threads?select=unread,message_count,status,order_number&id=eq.${threadId}`);
  const patch: Record<string, unknown> = {
    message_count: (t?.message_count ?? 0) + 1, last_message_at: m.sent_at || new Date().toISOString(),
    last_direction: m.direction, snippet, updated_at: new Date().toISOString(),
  };
  if (m.direction === 'in') {
    patch.unread = (t?.unread ?? 0) + 1;
    if (t?.status === 'closed') patch.status = 'open';
  }
  if (t && !t.order_number) { const n = findOrderNumber(m.subject, m.text); if (n) patch.order_number = n; }
  await sb.update(`mail_threads?id=eq.${threadId}`, patch, 'id');
  return row.id;
}

// ---------- Załączniki (prywatny bucket „mail”) ----------
const storageBase = (env: Env) => (env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const authHeaders = (env: Env) => {
  const key = env.SUPABASE_SECRET_KEY || '';
  return { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };
};
const safeName = (n: string) => (n || 'plik').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-120) || 'plik';

export async function putAttachment(env: Env, path: string, body: ArrayBuffer | ReadableStream, type: string) {
  const res = await fetch(`${storageBase(env)}/storage/v1/object/mail/${path}`, {
    method: 'POST',
    headers: { ...authHeaders(env), 'Content-Type': type || 'application/octet-stream', 'x-upsert': 'true' },
    body,
    // @ts-ignore – wymagane przy wysyłaniu strumienia
    duplex: 'half',
  });
  if (!res.ok) throw new Error(`Storage ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

// Link czasowy do pobrania załącznika (panel, krok B)
export async function signedAttachmentUrl(env: Env, path: string, seconds = 300) {
  const res = await fetch(`${storageBase(env)}/storage/v1/object/sign/mail/${path}`, {
    method: 'POST', headers: { ...authHeaders(env), 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: seconds }),
  });
  if (!res.ok) throw new Error(`Storage sign ${res.status}`);
  const d = (await res.json()) as { signedURL?: string; signedUrl?: string };
  const u = d.signedURL || d.signedUrl || '';
  return u.startsWith('http') ? u : `${storageBase(env)}/storage/v1${u}`;
}

// Kopia załączników odebranej wiadomości z Resend do własnego magazynu (link z Resend działa tylko godzinę)
export async function copyResendAttachments(env: Env, sb: Sb, o: { messageId: string; threadId: string; resendId: string }) {
  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(o.resendId)}/attachments`, {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Resend załączniki ${res.status}`);
  const list = ((await res.json()) as { data?: any[] }).data ?? [];
  const saved: any[] = [];
  for (const [i, a] of list.entries()) {
    const item = { name: a.filename || `zalacznik-${i + 1}`, type: a.content_type || 'application/octet-stream', size: a.size ?? null, resend_id: a.id, inline: a.content_disposition === 'inline', cid: a.content_id || null } as Record<string, unknown>;
    try {
      if ((a.size ?? 0) > 25 * 1024 * 1024) throw new Error('za duży');
      const file = await fetch(a.download_url);
      if (!file.ok || !file.body) throw new Error(`HTTP ${file.status}`);
      const path = `${o.threadId}/${o.messageId}/${i + 1}-${safeName(item.name as string)}`;
      await putAttachment(env, path, file.body, item.type as string);
      item.path = path;
    } catch (e) {
      item.error = e instanceof Error ? e.message : String(e);
      console.error(`Załącznik ${item.name}: ${item.error}`);
    }
    saved.push(item);
  }
  await sb.update(`mail_messages?id=eq.${o.messageId}`, { attachments: saved }, 'id');
}

// ---------- Powiadomienie o nowej wiadomości (opcjonalne: MAIL_NOTIFY = prywatny adres) ----------
export async function notifyNewMail(env: Env, origin: string, o: { from: Addr; subject: string; snippet: string; threadId: string }) {
  const to = String(env.MAIL_NOTIFY || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!to.length) return;
  try {
    await sendMail(env, {
      to,
      subject: `Nowa wiadomość: ${o.subject || '(bez tematu)'} – ${o.from.name || o.from.email}`,
      text: [`Od: ${o.from.name ? `${o.from.name} <${o.from.email}>` : o.from.email}`, `Temat: ${o.subject}`, '', o.snippet, '', `Odpowiedz w panelu: ${origin}/admin/#korespondencja/${o.threadId}`].join('\n'),
    });
  } catch (e) {
    console.error('Powiadomienie o poczcie: ' + (e instanceof Error ? e.message : String(e)));
  }
}

// ---------- Podpis webhooka Resend (Svix: svix-id, svix-timestamp, svix-signature) ----------
export async function verifyResendWebhook(secret: string, headers: Headers, body: string) {
  const id = headers.get('svix-id') || headers.get('webhook-id');
  const ts = headers.get('svix-timestamp') || headers.get('webhook-timestamp');
  const sigs = headers.get('svix-signature') || headers.get('webhook-signature');
  if (!id || !ts || !sigs || !secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 5 * 60) return false; // ochrona przed powtórzeniem
  const raw = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
  const expected = btoa(String.fromCharCode(...mac));
  return sigs.split(' ').some((s) => s.split(',')[1] === expected);
}
