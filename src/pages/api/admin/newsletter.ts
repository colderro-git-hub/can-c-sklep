import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';
import { getSite } from '../../../lib/site-settings';
import { sendMail, sendBatch } from '../../../lib/mail';
import { unsubscribeUrl } from '../../../lib/automations';
import { AUDIENCES, audiencePath, cleanBlocks, prepareCampaign, type Campaign } from '../../../lib/newsletter';
import { EMAIL_RE } from '../../../lib/validate';

export const prerender = false;

const UUID = /^[0-9a-f-]{36}$/i;
const BATCH = 50; // maili na jedno wywołanie (Resend przyjmuje do 100)

// Lista kampanii + liczby subskrybentów; ?id= – jedna kampania; ?audience= – liczba odbiorców
export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  try {
    const sb = db(env);
    const id = url.searchParams.get('id');
    if (id) {
      if (!UUID.test(id)) return json(400, { error: 'Nieprawidłowa kampania.' });
      const [c] = await sb.select<any>(`newsletter_campaigns?select=*&id=eq.${id}`);
      if (!c) return json(404, { error: 'Nie znaleziono kampanii.' });
      const failed = c.failed_count ? await sb.select<any>(`newsletter_sends?select=email,error&campaign_id=eq.${id}&status=eq.failed&limit=50`) : [];
      return json(200, { campaign: c, failed });
    }
    const audience = url.searchParams.get('audience');
    if (audience) {
      if (!AUDIENCES[audience]) return json(400, { error: 'Nieznana grupa odbiorców.' });
      return json(200, { count: (await sb.selectCount(`${audiencePath(audience)}&limit=1`)).total });
    }
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
    const [campaigns, consented, fromNewsletter, joined30, products] = await Promise.all([
      sb.select<any>('newsletter_campaigns?select=id,name,subject,audience,status,recipients,sent_count,failed_count,created_at,sent_at,started_at&order=created_at.desc&limit=100'),
      sb.selectCount('customers?select=id&marketing_consent=is.true&limit=1'),
      sb.selectCount('customers?select=id&marketing_consent=is.true&consent_source=eq.newsletter&limit=1'),
      sb.selectCount(`consent_log?select=id&action=eq.confirmed&created_at=gte.${encodeURIComponent(since30)}&limit=1`).catch(() => ({ total: 0 })),
      sb.select<{ id: string; name: string; active: boolean }>('products?select=id,name,active&order=sort_order.asc'),
    ]);
    return json(200, {
      campaigns, products, audiences: AUDIENCES,
      stats: { consented: consented.total, fromNewsletter: fromNewsletter.total, joined30: joined30.total },
      // Bez zweryfikowanej domeny Resend dostarcza maile tylko na adres właściciela konta
      fromWarning: /resend\.dev/i.test(env.CONTACT_FROM || '') ? 'Nadawca to onboarding@resend.dev – do czasu weryfikacji domeny can-c.pl w Resend kampanie dojdą tylko na adres właściciela konta Resend.' : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Admin newsletter: ' + msg);
    if (/newsletter_campaigns|consent_log/.test(msg)) return json(500, { error: 'Brak tabel newslettera. Uruchom skrypt supabase/021_newsletter.sql.' });
    return json(500, { error: 'Błąd pobierania kampanii.' });
  }
};

// Pola kampanii z formularza → wiersz albo błąd
function parse(b: any): { row: Record<string, unknown> } | { error: string } {
  const name = String(b.name ?? '').trim().slice(0, 100);
  const subject = String(b.subject ?? '').trim().slice(0, 150);
  const preheader = String(b.preheader ?? '').trim().slice(0, 200);
  const audience = AUDIENCES[b.audience] ? b.audience : 'all';
  const blocks = cleanBlocks(b.blocks);
  if ('error' in blocks) return blocks;
  return { row: { name: name || subject || 'Kampania', subject, preheader, audience, blocks: blocks.blocks } };
}

// Akcje: save · preview · test · start · batch · duplicate · delete
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  const sb = db(env);
  const origin = new URL(request.url).origin;
  const now = new Date().toISOString();

  try {
    // Podgląd HTML (bez zapisu) – dane z edytora
    if (b.action === 'preview') {
      const parsed = parse(b);
      if ('error' in parsed) return json(422, { error: parsed.error });
      const render = await prepareCampaign(env, await getSite(env), origin, parsed.row as unknown as Campaign);
      return json(200, render({ firstName: 'Anna', unsubscribe: `${origin}/wypisano/` }));
    }

    // Wiadomość testowa (nie trafia do statystyk): domyślnie na adres admina
    if (b.action === 'test') {
      const parsed = parse(b);
      if ('error' in parsed) return json(422, { error: parsed.error });
      const c = parsed.row as unknown as Campaign;
      if (!c.subject) return json(422, { error: 'Podaj temat wiadomości.' });
      const to = String(b.to || admin).split(',').map((x) => x.trim().toLowerCase()).filter((x) => EMAIL_RE.test(x)).slice(0, 5);
      if (!to.length) return json(422, { error: 'Podaj adres do wiadomości testowej.' });
      const render = await prepareCampaign(env, await getSite(env), origin, c);
      const m = render({ firstName: 'Anna', unsubscribe: `${origin}/wypisano/` });
      await sendMail(env, { to, subject: `[TEST] ${c.subject}`, html: m.html, text: m.text, replyTo: env.CONTACT_TO?.split(',')[0]?.trim() });
      return json(200, { ok: true, to });
    }

    if (b.action === 'save') {
      const parsed = parse(b);
      if ('error' in parsed) return json(422, { error: parsed.error });
      if (b.id) {
        if (!UUID.test(b.id)) return json(400, { error: 'Nieprawidłowa kampania.' });
        const [row] = await sb.update(`newsletter_campaigns?id=eq.${b.id}&status=eq.draft`, { ...parsed.row, updated_at: now, updated_by: admin }, 'id');
        if (!row) return json(409, { error: 'Wysłanej kampanii nie można edytować. Zduplikuj ją.' });
        return json(200, { id: b.id });
      }
      const [row] = await sb.insert<{ id: string }>('newsletter_campaigns', { ...parsed.row, created_by: admin, updated_by: admin }, 'id');
      return json(200, { id: row.id });
    }

    if (!UUID.test(b.id || '')) return json(400, { error: 'Nieprawidłowa kampania.' });
    const [c] = await sb.select<any>(`newsletter_campaigns?select=*&id=eq.${b.id}`);
    if (!c) return json(404, { error: 'Nie znaleziono kampanii.' });

    if (b.action === 'duplicate') {
      const [row] = await sb.insert<{ id: string }>('newsletter_campaigns', {
        name: `${c.name} (kopia)`.slice(0, 100), subject: c.subject, preheader: c.preheader, blocks: c.blocks, audience: c.audience, created_by: admin, updated_by: admin,
      }, 'id');
      return json(200, { id: row.id });
    }
    if (b.action === 'delete') {
      if (c.status !== 'draft') return json(409, { error: 'Można usunąć tylko szkic.' });
      await sb.remove(`newsletter_campaigns?id=eq.${c.id}&status=eq.draft`);
      return json(200, { ok: true });
    }

    // Start wysyłki: lista odbiorców zamrożona w kolejce (newsletter_sends)
    if (b.action === 'start') {
      if (c.status !== 'draft') return json(409, { error: 'Ta kampania była już wysyłana.' });
      if (!c.subject) return json(422, { error: 'Podaj temat wiadomości.' });
      if (!(c.blocks || []).length) return json(422, { error: 'Kampania jest pusta – dodaj treść.' });
      const people = await sb.select<{ id: string; email: string; first_name: string | null }>(`${audiencePath(c.audience)}&limit=20000`);
      if (!people.length) return json(422, { error: 'Brak odbiorców w wybranej grupie.' });
      const [locked] = await sb.update(`newsletter_campaigns?id=eq.${c.id}&status=eq.draft`, { status: 'sending', started_at: now, recipients: people.length, updated_by: admin }, 'id');
      if (!locked) return json(409, { error: 'Kampania została w międzyczasie zmieniona. Odśwież.' });
      for (let i = 0; i < people.length; i += 500) {
        await sb.upsert('newsletter_sends', people.slice(i, i + 500).map((x) => ({ campaign_id: c.id, customer_id: x.id, email: x.email, first_name: x.first_name })), 'campaign_id,email', 'id');
      }
      console.log(`Admin ${admin} uruchomił kampanię „${c.name}” – ${people.length} odbiorców`);
      return json(200, { ok: true, recipients: people.length });
    }

    // Kolejna paczka: rezerwacja wierszy (queued → sending), wysyłka, wynik; ponowne wywołania wznawiają wysyłkę
    if (b.action === 'batch') {
      if (c.status !== 'sending') return json(200, { done: true, sent: c.sent_count, failed: c.failed_count, recipients: c.recipients });
      const queued = await sb.select<{ id: string }>(`newsletter_sends?select=id&campaign_id=eq.${c.id}&status=eq.queued&order=created_at.asc&limit=${BATCH}`);
      if (!queued.length) {
        // Wiersze „sending” starsze niż 10 min (przerwana wysyłka) wracają do kolejki
        const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const back = await sb.update(`newsletter_sends?campaign_id=eq.${c.id}&status=eq.sending&claimed_at=lt.${encodeURIComponent(stale)}`, { status: 'queued' }, 'id');
        const left = await sb.select(`newsletter_sends?select=id&campaign_id=eq.${c.id}&status=eq.sending&limit=1`);
        if (!back.length && !left.length) {
          const sent = (await sb.selectCount(`newsletter_sends?select=id&campaign_id=eq.${c.id}&status=eq.sent&limit=1`)).total;
          const failed = (await sb.selectCount(`newsletter_sends?select=id&campaign_id=eq.${c.id}&status=eq.failed&limit=1`)).total;
          await sb.update(`newsletter_campaigns?id=eq.${c.id}&status=eq.sending`, { status: 'sent', sent_at: now, sent_count: sent, failed_count: failed }, 'id');
          return json(200, { done: true, sent, failed, recipients: c.recipients });
        }
        return json(200, { done: false, sent: c.sent_count, failed: c.failed_count, recipients: c.recipients });
      }
      const claimed = await sb.update<{ id: string; email: string; first_name: string | null; customer_id: string | null }>(
        `newsletter_sends?id=in.(${queued.map((q) => q.id).join(',')})&status=eq.queued`, { status: 'sending', claimed_at: now }, 'id,email,first_name,customer_id');
      if (!claimed.length) return json(200, { done: false, sent: c.sent_count, failed: c.failed_count, recipients: c.recipients });

      // Kto w międzyczasie się wypisał – pomijamy
      const custIds = claimed.map((x) => x.customer_id).filter(Boolean) as string[];
      const still = new Set(custIds.length ? (await sb.select<{ id: string }>(`customers?select=id&marketing_consent=is.true&id=in.(${custIds.join(',')})`)).map((x) => x.id) : []);
      const toSend = claimed.filter((x) => x.customer_id && still.has(x.customer_id));
      const skipped = claimed.filter((x) => !toSend.includes(x));
      if (skipped.length) await sb.update(`newsletter_sends?id=in.(${skipped.map((x) => x.id).join(',')})`, { status: 'skipped', error: 'brak zgody w chwili wysyłki' }, 'id');

      const render = await prepareCampaign(env, await getSite(env), origin, c as Campaign);
      const mails = await Promise.all(toSend.map(async (x) => {
        const unsub = await unsubscribeUrl(env, origin, x.customer_id!);
        const m = render({ firstName: x.first_name, unsubscribe: unsub });
        return {
          to: x.email, subject: c.subject, html: m.html, text: m.text, replyTo: env.CONTACT_TO?.split(',')[0]?.trim(),
          headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        };
      }));
      let ok = true, error = '';
      try { await sendBatch(env, mails); } catch (e) { ok = false; error = (e instanceof Error ? e.message : String(e)).slice(0, 300); console.error('Newsletter paczka: ' + error); }
      if (toSend.length) {
        await sb.update(`newsletter_sends?id=in.(${toSend.map((x) => x.id).join(',')})`, ok ? { status: 'sent', sent_at: now } : { status: 'failed', error }, 'id');
      }
      const sent = (c.sent_count || 0) + (ok ? toSend.length : 0);
      const failed = (c.failed_count || 0) + (ok ? 0 : toSend.length);
      await sb.update(`newsletter_campaigns?id=eq.${c.id}`, { sent_count: sent, failed_count: failed }, 'id');
      return json(200, { done: false, sent, failed, recipients: c.recipients, ...(ok ? {} : { error }) });
    }

    return json(400, { error: 'Nieznana akcja.' });
  } catch (e) {
    console.error('Admin newsletter zapis: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd zapisu kampanii.' });
  }
};
