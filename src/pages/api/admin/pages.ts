// API CMS stron: GET lista sekcji danej strony, POST zapis sekcji.
import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { requireAdmin } from '../../../lib/admin-auth';
import { db } from '../../../lib/supabase';
import { clearPageCache, type PageKey } from '../../../lib/page-content';

export const prerender = false;

const PAGES: PageKey[] = ['home', 'faq', 'about', 'how_to_use', 'footer'];
const str = (v: unknown, max = 200) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  const page = url.searchParams.get('page') as PageKey | null;
  if (!page || !PAGES.includes(page)) return json(400, { error: 'Nieprawidłowa strona.' });
  try {
    const rows = await db(env).select(
      `page_content?select=key,page,section,sort_order,data,updated_at,updated_by&page=eq.${page}&order=sort_order.asc`,
    );
    return json(200, { rows });
  } catch (e) {
    console.error('pages GET: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd pobierania treści.' });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }

  // FAQ: nowe pytanie (pusty szkic, ukryty do czasu zapisu) i usuwanie
  if (b.action === 'create_faq') {
    try {
      const sb = db(env);
      const [last] = await sb.select<{ sort_order: number }>('page_content?select=sort_order&page=eq.faq&section=eq.item&order=sort_order.desc&limit=1');
      const key = `faq.p-${Date.now().toString(36)}`;
      await sb.insert('page_content', { key, page: 'faq', section: 'item', sort_order: (last?.sort_order ?? 0) + 10, data: { cat: 'produkt', home: false, q: '', a: '', __hidden: true }, updated_by: admin }, 'key');
      clearPageCache('faq');
      return json(200, { ok: true, key });
    } catch (e) {
      console.error('pages create_faq: ' + (e instanceof Error ? e.message : String(e)));
      return json(500, { error: 'Nie udało się dodać pytania.' });
    }
  }
  if (b.action === 'delete_faq') {
    const k = str(b.key, 100);
    if (!/^faq\.[a-z0-9_-]+$/.test(k)) return json(400, { error: 'Nieprawidłowe pytanie.' });
    try {
      await db(env).remove(`page_content?key=eq.${encodeURIComponent(k)}&page=eq.faq&section=eq.item`);
      clearPageCache('faq');
      console.log(`Admin ${admin} usunął pytanie FAQ ${k}`);
      return json(200, { ok: true });
    } catch (e) {
      console.error('pages delete_faq: ' + (e instanceof Error ? e.message : String(e)));
      return json(500, { error: 'Nie udało się usunąć pytania.' });
    }
  }

  const key = str(b.key, 100);
  if (!key || !/^[a-z_]+\.[a-z0-9_-]+$/.test(key)) return json(400, { error: 'Nieprawidłowy klucz sekcji.' });
  const page = key.split('.')[0] as PageKey;
  if (!PAGES.includes(page)) return json(400, { error: 'Nieprawidłowa strona.' });

  // data to dowolny obiekt JSON - walidujemy tylko że to obiekt
  if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) return json(400, { error: 'data musi być obiektem JSON.' });

  // Ochrona przed gigantami (maks. 100 kB na sekcję)
  if (JSON.stringify(b.data).length > 100_000) return json(413, { error: 'Sekcja jest za duża (maks. 100 kB).' });

  // Sprawdź czy klucz istnieje (musi - nie tworzymy nowych kluczy z panelu)
  const sb = db(env);
  const [existing] = await sb.select<{ key: string; sort_order: number; section: string }>(
    `page_content?select=key,sort_order,section&key=eq.${encodeURIComponent(key)}`,
  );
  if (!existing) return json(404, { error: 'Nieznana sekcja. Nowe sekcje dodaje deweloper przez SQL.' });

  try {
    await sb.update(
      `page_content?key=eq.${encodeURIComponent(key)}`,
      { data: b.data, updated_at: new Date().toISOString(), updated_by: admin, ...(Number.isInteger(b.sort_order) && b.sort_order >= 0 && b.sort_order <= 9999 && page === 'faq' ? { sort_order: b.sort_order } : {}) },
      'key',
    );
    clearPageCache(page);
    console.log(`Admin ${admin} zaktualizował treść ${key}`);
    return json(200, { ok: true, key });
  } catch (e) {
    console.error('pages POST: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd zapisu treści.' });
  }
};
