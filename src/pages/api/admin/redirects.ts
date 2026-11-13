// SEO → Przekierowania: przekierowania 301/302 i dziennik 404 (tabele z migracji 017).
import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { requireAdmin } from '../../../lib/admin-auth';
import { db } from '../../../lib/supabase';
import { normPath, clearRedirectsCache, type Redirect } from '../../../lib/redirects';
import { SEO_PAGES } from '../../../lib/seo';

export const prerender = false;

type Row = Redirect & { hits: number; last_hit_at: string | null; note: string | null; created_at: string };
const enc = encodeURIComponent;
const MIGRATION_HINT = 'Brak tabel przekierowań. Uruchom w Supabase skrypt supabase/017_seo_redirects.sql.';
const missingTable = (e: unknown) => /redirects|not_found_log|PGRST205|42P01|does not exist/i.test(e instanceof Error ? e.message : String(e));

// Adres źródłowy: przyjmujemy też pełny link (np. https://can-c.pl/stary-adres/ albo ze starej domeny)
function parseFrom(raw: string): string | { error: string } {
  let v = String(raw || '').trim();
  if (!v) return { error: 'Podaj stary adres.' };
  if (/^https?:\/\//i.test(v)) { try { const u = new URL(v); v = u.pathname + u.search; } catch { return { error: `Nieprawidłowy adres: ${raw}` }; } }
  if (!v.startsWith('/')) v = '/' + v;
  v = v.replace(/#.*$/, '');
  if (v.length > 500) return { error: 'Stary adres jest za długi (maks. 500 znaków).' };
  if (normPath(v) === '/') return { error: 'Nie można przekierować strony głównej.' };
  if (/^\/(api|admin|_astro)(\/|$|\?)/i.test(v)) return { error: 'Nie można przekierować adresów technicznych sklepu (/api, /admin).' };
  return v;
}
function parseTo(raw: string): string | { error: string } {
  const v = String(raw || '').trim();
  if (!v) return { error: 'Podaj nowy adres.' };
  if (v.startsWith('/')) return v.length <= 1000 ? v : { error: 'Nowy adres jest za długi.' };
  try { const u = new URL(v); if (u.protocol === 'https:' || u.protocol === 'http:') return u.href; } catch { /* niżej */ }
  return { error: `Nowy adres musi zaczynać się od „/” (strona sklepu) albo https:// - „${raw}”.` };
}
const internalPath = (to: string) => { try { const u = new URL(to, 'https://can-c.pl'); return /^(www\.)?can-c\.pl$/.test(u.hostname) ? u.pathname + u.search : null; } catch { return null; } };

export const GET: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  try {
    const sb = db(env);
    const [redirects, notFound, ignored, products] = await Promise.all([
      sb.select<Row>('redirects?select=id,from_path,to_url,code,hits,last_hit_at,note,created_at&order=created_at.desc&limit=2000'),
      sb.select('not_found_log?select=path,hits,first_seen,last_seen,referrer,user_agent&ignored=eq.false&order=hits.desc,last_seen.desc&limit=300'),
      sb.selectCount('not_found_log?select=path&ignored=eq.true&limit=1'),
      sb.select<{ id: string; name: string }>('products?select=id,name&active=eq.true&order=sort_order.asc'),
    ]);
    // Podpowiedzi celu: strony z treścią i produkty
    const targets = [...SEO_PAGES.map((p) => ({ path: p.path, label: p.label })), ...products.map((p) => ({ path: `/produkt/${p.id}/`, label: p.name }))];
    return json(200, { redirects, notFound, ignoredCount: ignored.total, targets });
  } catch (e) {
    if (missingTable(e)) return json(200, { redirects: [], notFound: [], ignoredCount: 0, targets: [], migration: MIGRATION_HINT });
    console.error('Przekierowania GET: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Nie udało się wczytać przekierowań.' });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  const sb = db(env);

  try {
    const existing = await sb.select<Row>('redirects?select=id,from_path,to_url,code&limit=10000');
    const products = await sb.select<{ id: string }>('products?select=id&active=eq.true');
    const live = new Set([...SEO_PAGES.map((p) => normPath(p.path)), ...products.map((p) => normPath(`/produkt/${p.id}/`)), normPath('/sklep/')]);
    const byFrom = new Map(existing.map((r) => [normPath(r.from_path), r]));

    // Walidacja jednej pary; skraca łańcuch A → B → C do A → C
    const check = (fromRaw: string, toRaw: string, code: number, selfId?: string) => {
      const from = parseFrom(fromRaw); if (typeof from !== 'string') return from;
      let to = parseTo(toRaw); if (typeof to !== 'string') return to;
      if (![301, 302, 307, 308].includes(code)) return { error: 'Nieprawidłowy typ przekierowania.' };
      if (live.has(normPath(from))) return { error: `${from} to działająca strona sklepu - przekierowanie by ją zasłoniło.` };
      let note = '';
      const inner = internalPath(to);
      if (inner !== null) {
        if (normPath(inner) === normPath(from)) return { error: `${from}: adres przekierowuje sam na siebie.` };
        const next = byFrom.get(normPath(inner));
        if (next && next.id !== selfId) {
          if (normPath(internalPath(next.to_url) ?? '') === normPath(from)) return { error: `${from}: pętla przekierowań (${inner} prowadzi z powrotem).` };
          to = next.to_url; note = `Skrócono łańcuch: ${inner} jest już przekierowany na ${next.to_url}.`;
        }
      }
      const dup = byFrom.get(normPath(from));
      if (dup && dup.id !== selfId) return { error: `Przekierowanie z ${from} już istnieje (na ${dup.to_url}).` };
      return { from, to, code, note };
    };

    if (b.action === 'save') {
      const r = check(b.from, b.to, Number(b.code) || 301, b.id || undefined);
      if ('error' in r) return json(422, { error: r.error });
      const row = { from_path: r.from, to_url: r.to, code: r.code, note: String(b.note || '').slice(0, 200) || null, updated_at: new Date().toISOString() };
      if (b.id) await sb.update(`redirects?id=eq.${enc(b.id)}`, row);
      else await sb.insert('redirects', { ...row, created_by: admin });
      // Adres obsłużony - znika z dziennika 404 (z ukośnikiem i bez)
      const p = r.from.replace(/\/+$/, '');
      await sb.remove(`not_found_log?path=in.(${[p, p + '/'].map((x) => `"${x.replace(/"/g, '')}"`).join(',')})`).catch(() => {});
      clearRedirectsCache();
      return json(200, { ok: true, note: r.note });
    }

    if (b.action === 'delete') {
      await sb.remove(`redirects?id=eq.${enc(String(b.id || ''))}`);
      clearRedirectsCache();
      return json(200, { ok: true });
    }

    // Import listy: jedna para w linii - „stary nowy”, „stary,nowy”, „stary;nowy” lub ze strzałką; opcjonalnie kod 301/302
    if (b.action === 'import') {
      const lines = String(b.text || '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      if (lines.length > 2000) return json(422, { error: 'Maksymalnie 2000 linii na raz.' });
      const rows: any[] = []; const errors: string[] = []; const notes: string[] = [];
      for (const [i, l] of lines.entries()) {
        const parts = l.split(/\s*(?:->|→|=>|;|,|\t|\s)\s*/).filter(Boolean);
        if (i === 0 && /^(from|z|stary|source|old)/i.test(parts[0] || '')) continue; // nagłówek
        if (parts.length < 2) { errors.push(`Linia ${i + 1}: brak nowego adresu`); continue; }
        const r = check(parts[0], parts[1], Number(parts[2]) || 301);
        if ('error' in r) { errors.push(`Linia ${i + 1}: ${r.error}`); continue; }
        if (r.note) notes.push(`Linia ${i + 1}: ${r.note}`);
        byFrom.set(normPath(r.from), { id: 'nowy', from_path: r.from, to_url: r.to, code: r.code } as Row);
        rows.push({ from_path: r.from, to_url: r.to, code: r.code, created_by: admin, updated_at: new Date().toISOString() });
      }
      if (rows.length) await sb.upsert('redirects', rows, 'from_path', 'id');
      clearRedirectsCache();
      return json(200, { added: rows.length, errors: errors.slice(0, 30), errorCount: errors.length, notes: notes.slice(0, 30) });
    }

    if (b.action === 'ignore') {
      await sb.update(`not_found_log?path=eq.${enc(String(b.path || ''))}`, { ignored: true }, 'path');
      return json(200, { ok: true });
    }
    if (b.action === 'clear404') {
      await sb.remove('not_found_log?ignored=eq.false');
      return json(200, { ok: true });
    }
    return json(400, { error: 'Nieznana akcja.' });
  } catch (e) {
    if (missingTable(e)) return json(409, { error: MIGRATION_HINT });
    console.error('Przekierowania POST: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Nie udało się zapisać zmian.' });
  }
};
