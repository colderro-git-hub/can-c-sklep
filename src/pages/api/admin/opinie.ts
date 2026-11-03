import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';
import { clearCatalogCache } from '../../../lib/catalog';

export const prerender = false;

export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  const status = ['pending', 'approved', 'rejected'].includes(url.searchParams.get('status') || '') ? url.searchParams.get('status') : null;
  const product = (url.searchParams.get('product') || '').replace(/[^a-z0-9-]/g, '');
  try {
    const sb = db(env);
    const rows = await sb.select(`reviews?select=*,products(name)${status ? `&status=eq.${status}` : ''}${product ? `&product_id=eq.${product}` : ''}&order=created_at.desc&limit=300`);
    const pending = (await sb.selectCount('reviews?select=id&status=eq.pending&limit=1')).total;
    return json(200, { rows, pending });
  } catch (e) {
    console.error('Admin opinie: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd pobierania opinii.' });
  }
};

// { action: 'approve'|'reject'|'reply'|'delete', id, reply } | { action: 'create', product_id, author_name, rating, title, body, created_at, verified_purchase }
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  const sb = db(env);
  try {
    if (b.action === 'create') {
      const rating = Number(b.rating);
      const body = String(b.body || '').trim().slice(0, 3000);
      const name = String(b.author_name || '').trim().slice(0, 60);
      if (!/^[a-z0-9-]{2,60}$/.test(b.product_id || '') || !Number.isInteger(rating) || rating < 1 || rating > 5 || body.length < 10 || name.length < 2) return json(422, { error: 'Uzupełnij produkt, autora, ocenę 1–5 i treść (min. 10 znaków).' });
      const created = b.created_at ? new Date(b.created_at) : new Date();
      await sb.insert('reviews', { product_id: b.product_id, author_name: name, rating, title: String(b.title || '').trim().slice(0, 120) || null, body, status: 'approved', verified_purchase: b.verified_purchase === true, source: 'import', created_at: isNaN(+created) ? new Date().toISOString() : created.toISOString(), moderated_at: new Date().toISOString(), moderated_by: admin }, 'id');
      clearCatalogCache();
      return json(200, { ok: true });
    }
    if (!/^[0-9a-f-]{36}$/i.test(b.id || '')) return json(400, { error: 'Nieprawidłowa opinia.' });

    // Edycja opinii: zachowujemy oryginalną treść przy pierwszej zmianie
    if (b.action === 'update') {
      const [cur] = await sb.select<any>(`reviews?select=id,body,original_body&id=eq.${b.id}`);
      if (!cur) return json(404, { error: 'Nie znaleziono opinii.' });
      const rating = Number(b.rating);
      const body = String(b.body || '').replace(/\r/g, '').trim().slice(0, 3000);
      const name = String(b.author_name || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 60);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5 || body.length < 10 || name.length < 2) return json(422, { error: 'Uzupełnij autora, ocenę 1–5 i treść (min. 10 znaków).' });
      const created = b.created_at ? new Date(b.created_at) : null;
      const upd: Record<string, unknown> = {
        author_name: name, rating, body,
        title: String(b.title || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 120) || null,
        verified_purchase: b.verified_purchase === true,
        edited_at: new Date().toISOString(), edited_by: admin,
        ...(created && !isNaN(+created) ? { created_at: created.toISOString() } : {}),
        ...(body !== cur.body && !cur.original_body ? { original_body: cur.body } : {}),
      };
      if (/^[a-z0-9-]{2,60}$/.test(b.product_id || '')) upd.product_id = b.product_id;
      await sb.update(`reviews?id=eq.${b.id}`, upd, 'id');
      clearCatalogCache();
      return json(200, { ok: true });
    }
    const patch: Record<string, unknown> =
      b.action === 'approve' ? { status: 'approved', moderated_at: new Date().toISOString(), moderated_by: admin }
      : b.action === 'reject' ? { status: 'rejected', moderated_at: new Date().toISOString(), moderated_by: admin }
      : b.action === 'reply' ? { reply: String(b.reply || '').trim().slice(0, 1500) || null }
      : {};
    if (b.action === 'delete') {
      const base = (env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
      const key = env.SUPABASE_SECRET_KEY || '';
      const r = await fetch(`${base}/rest/v1/reviews?id=eq.${b.id}`, { method: 'DELETE', headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) } });
      if (!r.ok) throw new Error(`delete ${r.status}`);
    } else {
      if (!Object.keys(patch).length) return json(400, { error: 'Nieznana akcja.' });
      await sb.update(`reviews?id=eq.${b.id}`, patch, 'id');
    }
    clearCatalogCache();
    return json(200, { ok: true });
  } catch (e) {
    console.error('Admin opinia: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd zapisu.' });
  }
};
