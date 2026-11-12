import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';
import { addMessage, inboxAddresses, parseAddr, putAttachment, receivingKey, signatureHtml, signatureText, signedAttachmentUrl } from '../../../lib/mailbox';
import { getSite } from '../../../lib/site-settings';

export const prerender = false;

const UUID = /^[0-9a-f-]{36}$/i;
const PAGE = 40;
const FOLDERS: Record<string, string> = {
  inbox: 'category=eq.customer&status=eq.open',
  closed: 'category=eq.customer&status=eq.closed',
  system: 'category=eq.system&status=neq.spam',
  other: 'category=eq.other&status=neq.spam',
  spam: 'status=eq.spam',
};
const cid = (s: unknown) => String(s ?? '').replace(/^<|>$/g, '');

// Lista wątków (?folder, q, page) z licznikami nieprzeczytanych · ?id= wątek z wiadomościami · ?att=<msg>&i=<n> załącznik
export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  const sb = db(env);
  try {
    // Załącznik: link czasowy z własnego magazynu, a gdy kopii nie ma – świeży link z Resend
    const att = url.searchParams.get('att');
    if (att) {
      if (!UUID.test(att)) return json(400, { error: 'Nieprawidłowa wiadomość.' });
      const [m] = await sb.select<any>(`mail_messages?select=id,resend_id,attachments&id=eq.${att}`);
      const a = m?.attachments?.[Number(url.searchParams.get('i'))];
      if (!a) return json(404, { error: 'Nie znaleziono załącznika.' });
      if (a.path) return Response.redirect(await signedAttachmentUrl(env, a.path, 300), 302);
      if (m.resend_id && a.resend_id) {
        const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(m.resend_id)}/attachments/${encodeURIComponent(a.resend_id)}`, { headers: { Authorization: `Bearer ${receivingKey(env)}` } });
        const d: any = r.ok ? await r.json() : null;
        if (d?.download_url) return Response.redirect(d.download_url, 302);
      }
      return json(404, { error: 'Załącznik jest niedostępny.' });
    }

    const id = url.searchParams.get('id');
    if (id) {
      if (!UUID.test(id)) return json(400, { error: 'Nieprawidłowy wątek.' });
      const [thread] = await sb.select<any>(`mail_threads?select=*&id=eq.${id}`);
      if (!thread) return json(404, { error: 'Nie znaleziono wątku.' });
      const messages = await sb.select<any>(`mail_messages?select=id,direction,source,from_email,from_name,to_emails,cc_emails,subject,text_body,html_body,attachments,auth,sent_by,sent_at&thread_id=eq.${id}&order=sent_at.asc`);
      // Obrazy w treści (cid:) → linki czasowe do kopii w magazynie
      for (const m of messages) {
        if (!m.html_body || !/cid:/i.test(m.html_body)) continue;
        for (const a of m.attachments || []) {
          if (!a.cid || !a.path) continue;
          try { m.html_body = m.html_body.split(`cid:${cid(a.cid)}`).join(await signedAttachmentUrl(env, a.path, 3600)); } catch { /* zostaje cid: */ }
        }
      }
      const [customer] = thread.customer_id ? await sb.select<any>(`customer_stats?select=id,full_name,email,phone,orders_count,total_spent,city&id=eq.${thread.customer_id}`) : [];
      const orders = await sb.select<any>(`orders?select=id,number,status,total,created_at&email=eq.${encodeURIComponent(thread.contact_email)}&order=created_at.desc&limit=5`);
      // Podgląd podpisu pod polem odpowiedzi
      const signature = signatureHtml(await getSite(env));
      return json(200, { thread, messages, customer: customer ?? null, orders, signature });
    }

    const folder = FOLDERS[url.searchParams.get('folder') || 'inbox'] ? url.searchParams.get('folder') || 'inbox' : 'inbox';
    const q = (url.searchParams.get('q') || '').trim().replace(/[(),*%]/g, ' ').slice(0, 80);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const filter = q
      ? `or=(subject.ilike.*${encodeURIComponent(q)}*,contact_email.ilike.*${encodeURIComponent(q)}*,contact_name.ilike.*${encodeURIComponent(q)}*,snippet.ilike.*${encodeURIComponent(q)}*)`
      : FOLDERS[folder];
    const [list, unread] = await Promise.all([
      sb.selectCount<any>(`mail_threads?select=id,subject,contact_email,contact_name,customer_id,order_number,category,status,unread,message_count,last_message_at,last_direction,snippet&${filter}&order=last_message_at.desc&limit=${PAGE}&offset=${(page - 1) * PAGE}`),
      sb.select<{ category: string; status: string; unread: number }>('mail_threads?select=category,status,unread&unread=gt.0&limit=2000'),
    ]);
    const counts: Record<string, number> = { inbox: 0, closed: 0, system: 0, other: 0, spam: 0 };
    for (const t of unread) {
      const f = t.status === 'spam' ? 'spam' : t.category === 'customer' ? (t.status === 'closed' ? 'closed' : 'inbox') : t.category;
      counts[f] = (counts[f] ?? 0) + 1;
    }
    return json(200, { threads: list.rows, total: list.total, page, pages: Math.max(1, Math.ceil(list.total / PAGE)), counts, inbox: inboxAddresses(env)[0] || null, fromWarning: /resend\.dev/i.test(env.CONTACT_FROM || '') });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Admin poczta: ' + msg);
    if (/mail_threads|mail_messages/.test(msg)) return json(500, { error: 'Brak tabel korespondencji. Uruchom skrypt supabase/022_korespondencja.sql.' });
    return json(500, { error: 'Błąd pobierania korespondencji.' });
  }
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const toHtml = (text: string) => esc(text).split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px;">${p.replace(/\n/g, '<br>')}</p>`).join('');
const fmtDate = (iso: string) => new Date(iso).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Akcje: read · status (open|closed|spam) · category (customer|system) · reply
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  const sb = db(env);
  const ids = (Array.isArray(b.ids) ? b.ids : [b.id]).map(String).filter((x: string) => UUID.test(x)).slice(0, 200);
  if (!ids.length) return json(400, { error: 'Nieprawidłowy wątek.' });
  const inIds = `id=in.(${ids.join(',')})`;
  const now = new Date().toISOString();
  try {
    if (b.action === 'read') { await sb.update(`mail_threads?${inIds}`, { unread: b.unread === true ? 1 : 0 }, 'id'); return json(200, { ok: true }); }
    if (b.action === 'status') {
      if (!['open', 'closed', 'spam'].includes(b.status)) return json(400, { error: 'Nieznany status.' });
      await sb.update(`mail_threads?${inIds}`, { status: b.status, ...(b.status !== 'open' ? { unread: 0 } : {}), updated_at: now }, 'id');
      return json(200, { ok: true });
    }
    if (b.action === 'category') {
      if (!['customer', 'system'].includes(b.category)) return json(400, { error: 'Nieznana kategoria.' });
      await sb.update(`mail_threads?${inIds}`, { category: b.category, ...(b.category === 'customer' ? { status: 'open' } : {}), updated_at: now }, 'id');
      return json(200, { ok: true });
    }

    if (b.action === 'reply') {
      const [t] = await sb.select<any>(`mail_threads?select=*&id=eq.${ids[0]}`);
      if (!t) return json(404, { error: 'Nie znaleziono wątku.' });
      const text = String(b.text ?? '').replace(/\r/g, '').trim().slice(0, 20000);
      if (text.length < 2) return json(422, { error: 'Napisz treść odpowiedzi.' });
      const inbox = inboxAddresses(env)[0];
      if (!env.RESEND_API_KEY || !env.CONTACT_FROM) return json(500, { error: 'Brak konfiguracji wysyłki (Resend).' });

      // Załączniki z panelu: base64, łącznie do 10 MB
      const files = (Array.isArray(b.attachments) ? b.attachments : []).slice(0, 10).map((f: any) => ({ name: String(f.name || 'plik').slice(0, 150), type: String(f.type || 'application/octet-stream'), data: String(f.data || '') }));
      const bytes = files.reduce((s: number, f: any) => s + Math.floor(f.data.length * 0.75), 0);
      if (bytes > 10 * 1024 * 1024) return json(413, { error: 'Załączniki są większe niż 10 MB.' });

      // Ostatnia wiadomość klienta – do cytatu i nagłówków wątku (Gmail, Outlook łączą odpowiedź z rozmową)
      const msgs = await sb.select<any>(`mail_messages?select=message_id,refs,from_email,from_name,text_body,html_body,sent_at,direction&thread_id=eq.${t.id}&order=sent_at.desc&limit=10`);
      const last = msgs.find((m) => m.direction === 'in') ?? msgs[0];
      const refs = [...new Set([...(last?.refs ?? []), ...msgs.map((m) => m.message_id).filter(Boolean).reverse()])].slice(-20) as string[];
      const inReplyTo = last?.message_id || null;
      const subject = /^\s*(re|odp)\s*:/i.test(t.subject) ? t.subject : `Re: ${t.subject}`;
      const domain = (inbox || 'can-c.pl').split('@')[1] || 'can-c.pl';
      const ownId = `<${crypto.randomUUID()}@${domain}>`;

      const quoteText = last?.text_body ? `\n\n${last.from_name || last.from_email} napisał(a) ${fmtDate(last.sent_at)}:\n${String(last.text_body).split('\n').slice(0, 200).map((l: string) => `> ${l}`).join('\n')}` : '';
      const quoteHtml = last ? `<p style="margin:16px 0 6px;color:#545D6E;font-size:13px;">${esc(last.from_name || last.from_email)} napisał(a) ${esc(fmtDate(last.sent_at))}:</p><blockquote style="margin:0;padding:0 0 0 12px;border-left:3px solid #DCE2EC;color:#545D6E;">${last.text_body ? toHtml(String(last.text_body).slice(0, 20000)) : String(last.html_body || '').replace(/<script[\s\S]*?<\/script>/gi, '').slice(0, 200000)}</blockquote>` : '';
      // Prosty mail jak od człowieka + podpis ze stopką (Ustawienia sklepu → Podpis w korespondencji)
      const site = await getSite(env);
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#141C2B;">${toHtml(text)}${signatureHtml(site)}${quoteHtml}</div>`;
      const plain = `${text}\n\n-- \n${signatureText(site)}`;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.CONTACT_FROM, to: [t.contact_email], subject, text: plain + quoteText, html,
          ...(inbox ? { reply_to: inbox } : {}),
          headers: { 'Message-ID': ownId, ...(inReplyTo ? { 'In-Reply-To': inReplyTo } : {}), ...(refs.length ? { References: refs.join(' ') } : {}) },
          ...(files.length ? { attachments: files.map((f: any) => ({ filename: f.name, content: f.data })) } : {}),
        }),
      });
      if (!res.ok) {
        const err = (await res.text()).slice(0, 300);
        console.error('Odpowiedź z panelu: ' + err);
        return json(502, { error: /domain|verify|testing emails/i.test(err) ? 'Resend odrzucił wysyłkę – domena can-c.pl nie jest jeszcze zweryfikowana (bez tego wysyłka działa tylko na adres właściciela konta).' : 'Nie udało się wysłać wiadomości.' });
      }
      const sent: any = await res.json().catch(() => ({}));
      // Message-ID nadany przez Resend (gdyby nadpisał nasz) – do łączenia odpowiedzi klienta
      let messageId = ownId;
      try {
        const g = await fetch(`https://api.resend.com/emails/${sent.id}`, { headers: { Authorization: `Bearer ${receivingKey(env)}` } });
        const d: any = g.ok ? await g.json() : null;
        if (d?.message_id) messageId = String(d.message_id).startsWith('<') ? d.message_id : `<${d.message_id}>`;
      } catch { /* zostaje nasz */ }

      const msgId = await addMessage(sb, t.id, {
        direction: 'out', source: 'panel', message_id: messageId, in_reply_to: inReplyTo, refs,
        from: { email: inbox || parseAddr(env.CONTACT_FROM)?.email || 'sklep', name: 'Can-C' }, to: [t.contact_email], subject, text: plain, html: null, sent_by: admin,
        attachments: files.map((f: any) => ({ name: f.name, type: f.type, size: Math.floor(f.data.length * 0.75) })),
      });
      // Kopie wysłanych załączników w magazynie (podgląd w wątku)
      if (files.length) {
        const saved: any[] = [];
        for (const [i, f] of files.entries()) {
          const path = `${t.id}/${msgId}/${i + 1}-${f.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '_')}`;
          try {
            await putAttachment(env, path, Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0)).buffer, f.type);
            saved.push({ name: f.name, type: f.type, size: Math.floor(f.data.length * 0.75), path });
          } catch { saved.push({ name: f.name, type: f.type, size: Math.floor(f.data.length * 0.75) }); }
        }
        await sb.update(`mail_messages?id=eq.${msgId}`, { attachments: saved }, 'id');
      }
      await sb.update(`mail_threads?id=eq.${t.id}`, { unread: 0, status: b.close === true ? 'closed' : 'open', updated_at: now }, 'id');
      console.log(`Admin ${admin} odpowiedział w wątku ${t.id}`);
      return json(200, { ok: true });
    }
    return json(400, { error: 'Nieznana akcja.' });
  } catch (e) {
    console.error('Admin poczta zapis: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd zapisu.' });
  }
};
