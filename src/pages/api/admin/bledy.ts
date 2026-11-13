import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';

export const prerender = false;

// Dziennik błędów (lib/alerts.ts): ostatnie wpisy + liczba nieprzejrzanych
export const GET: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  try {
    const rows = await db(env).select<any>('error_log?select=id,area,message,critical,count,first_seen,last_seen,notified_at,resolved_at&order=last_seen.desc&limit=50');
    return json(200, {
      rows, open: rows.filter((r) => !r.resolved_at).length,
      alertTo: String(env.ALERT_EMAIL || env.MAIL_NOTIFY || env.CONTACT_TO || '').split(',')[0]?.trim() || null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { error: /error_log/.test(msg) ? 'Brak tabeli dziennika. Uruchom skrypt supabase/028_alerty_bledow.sql.' : 'Nie udało się wczytać dziennika.' });
  }
};

// { action: 'resolve', id } | { action: 'resolve_all' } - „przejrzane” (nowe wystąpienie wraca na listę)
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  const now = new Date().toISOString();
  if (b.action === 'resolve_all') { await db(env).update('error_log?resolved_at=is.null', { resolved_at: now }, 'id'); return json(200, { ok: true }); }
  if (b.action === 'resolve' && /^[0-9a-f-]{36}$/i.test(b.id || '')) { await db(env).update(`error_log?id=eq.${b.id}`, { resolved_at: now }, 'id'); return json(200, { ok: true }); }
  return json(400, { error: 'Nieznana akcja.' });
};
