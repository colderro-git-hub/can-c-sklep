import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { later } from '../../../lib/background';
import {
  addMessage, copyResendAttachments, findOrderNumber, isOurAddress, inboxAddresses, isSystemMail, msgIds,
  notifyNewMail, parseAddr, parseList, receivingKey, snippetOf, threadFor, verifyResendWebhook,
} from '../../../lib/mailbox';

export const prerender = false;

const MAX_HTML = 1_000_000; // treść HTML do 1 MB (obrazy w treści jako cid:, nie base64)

// Webhook Resend „email.received”: pobranie pełnej wiadomości z API, zapis w wątku, kopia załączników
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const body = await request.text();
  if (!env.RESEND_WEBHOOK_SECRET || !receivingKey(env)) {
    console.error('Poczta: brak RESEND_WEBHOOK_SECRET albo RESEND_RECEIVING_KEY');
    return json(500, { error: 'Brak konfiguracji.' });
  }
  if (!(await verifyResendWebhook(env.RESEND_WEBHOOK_SECRET, request.headers, body))) return json(401, { error: 'Nieprawidłowy podpis.' });

  let ev: any;
  try { ev = JSON.parse(body); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  if (ev?.type !== 'email.received') return json(200, { ok: true, ignored: ev?.type });
  const resendId = String(ev.data?.email_id || ev.data?.id || '');
  if (!resendId) return json(400, { error: 'Brak identyfikatora wiadomości.' });

  const sb = db(env);
  try {
    // Ponowne doręczenie tego samego zdarzenia (Resend ponawia przy błędach) – nic nie robimy
    const dup = await sb.select(`mail_messages?select=id&resend_id=eq.${encodeURIComponent(resendId)}&limit=1`);
    if (dup.length) return json(200, { ok: true, duplicate: true });

    const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(resendId)}?html_format=cid`, {
      headers: { Authorization: `Bearer ${receivingKey(env)}` },
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const m: any = await res.json();

    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(m.headers ?? {})) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(' ') : String(v);
    const from = parseAddr(headers['from'] || m.from) ?? { email: 'nieznany@nadawca', name: null };
    const to = parseList(m.to).map((a) => a.email);
    const cc = parseList(m.cc).map((a) => a.email);
    const received = [...to, ...cc, ...(Array.isArray(m.received_for) ? m.received_for.map((x: string) => String(x).toLowerCase()) : [])];
    const subject = String(m.subject || '').slice(0, 300);

    // Kategoria: inne adresy w domenie (gdy skrzynka skonfigurowana) → „other”; automaty → „system”; reszta → klient
    const toUs = !inboxAddresses(env).length || received.some((a) => isOurAddress(env, a));
    const category = !toUs ? 'other' : isSystemMail(from.email, headers) ? 'system' : 'customer';

    const messageId = msgIds(m.message_id || headers['message-id'])[0] ?? null;
    const inReplyTo = msgIds(headers['in-reply-to'])[0] ?? null;
    const refs = [...new Set([...msgIds(headers['references']), ...(inReplyTo ? [inReplyTo] : [])])];
    const html = typeof m.html === 'string' ? m.html.slice(0, MAX_HTML) : null;
    const text = typeof m.text === 'string' ? m.text.slice(0, 200_000) : null;

    const threadId = await threadFor(sb, { refs, contact: from, subject, category, orderNumber: findOrderNumber(subject, text) });
    const attachmentsMeta = (Array.isArray(m.attachments) ? m.attachments : []).map((a: any) => ({
      name: a.filename || 'załącznik', type: a.content_type || 'application/octet-stream', size: a.size ?? null,
      resend_id: a.id, inline: a.content_disposition === 'inline', cid: a.content_id || null,
    }));
    let messageRowId: string;
    try {
      messageRowId = await addMessage(sb, threadId, {
        direction: 'in', source: 'resend', message_id: messageId, in_reply_to: inReplyTo, refs, resend_id: resendId,
        from, to, cc, subject, text, html, attachments: attachmentsMeta, auth: m.authentication ?? null,
        sent_at: m.created_at || new Date().toISOString(),
      });
    } catch (e) {
      // Wyścig dwóch doręczeń tego samego zdarzenia – unikalny resend_id / Message-ID
      if (/duplicate key|23505/.test(e instanceof Error ? e.message : String(e))) return json(200, { ok: true, duplicate: true });
      throw e;
    }

    // Podejrzana wiadomość (DMARC fail – podszycie pod cudzą domenę) → od razu do spamu
    if (m.authentication?.dmarc === 'fail') await sb.update(`mail_threads?id=eq.${threadId}&message_count=eq.1`, { status: 'spam' }, 'id');

    if (attachmentsMeta.length) {
      await later(locals, copyResendAttachments(env, sb, { messageId: messageRowId, threadId, resendId })
        .catch((e) => console.error('Poczta załączniki: ' + (e instanceof Error ? e.message : String(e)))));
    }
    if (category === 'customer' && m.authentication?.dmarc !== 'fail') {
      await later(locals, notifyNewMail(env, new URL(request.url).origin, { from, subject, snippet: snippetOf(text, html), threadId }));
    }
    return json(200, { ok: true, thread: threadId });
  } catch (e) {
    // 500 → Resend ponowi doręczenie później (wiadomość nie zginie)
    const detail = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    console.error('Poczta webhook: ' + detail);
    // Szczegół błędu widać w Resend → Webhooks → zdarzenie → Response body (odpowiedź dostaje tylko podpisany nadawca)
    return json(500, { error: 'Błąd zapisu wiadomości.', detail });
  }
};
