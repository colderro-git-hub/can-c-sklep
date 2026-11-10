// Zakładka SEO w panelu: odczyt i zapis ustawień SEO (settings, klucz 'seo').
// Etap 1: SEO stron (tytuł, opis, obraz OG, „nie indeksuj”) i udostępnianie (domyślny obraz, nazwa, Twitter/X).
import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { requireAdmin } from '../../../lib/admin-auth';
import { db } from '../../../lib/supabase';
import { SEO_PAGES, SEO_LIMITS, clearSeoCache, type SeoSettings } from '../../../lib/seo';

export const prerender = false;

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);

async function readSeo(env: Parameters<typeof db>[0]): Promise<SeoSettings> {
  const [row] = await db(env).select<{ value: Partial<SeoSettings> }>('settings?select=value&key=eq.seo');
  return { pages: row?.value?.pages ?? {}, share: row?.value?.share ?? {} };
}

export const GET: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  try {
    return json(200, { seo: await readSeo(env), pages: SEO_PAGES, limits: SEO_LIMITS });
  } catch (e) {
    console.error('SEO GET: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Nie udało się wczytać ustawień SEO.' });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }

  // Obrazy tylko z własnego magazynu zdjęć (wysyłane przez panel)
  const base = (env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const okImage = (u: string) => !u || u.startsWith(`${base}/storage/v1/object/public/products/`);

  let seo: SeoSettings;
  try { seo = await readSeo(env); } catch { return json(500, { error: 'Nie udało się wczytać ustawień SEO.' }); }

  if (b.action === 'page') {
    const path = String(b.path || '');
    if (!SEO_PAGES.some((p) => p.path === path)) return json(400, { error: 'Nieznana strona.' });
    const page = {
      title: clean(b.title, 90),
      description: clean(b.description, 300),
      ogImage: String(b.ogImage || '').trim(),
      noindex: b.noindex === true,
    };
    if (!okImage(page.ogImage)) return json(422, { error: 'Nieprawidłowy adres obrazu. Wyślij plik przez panel.' });
    // Puste pola = wartości domyślne ze strony; nie trzymamy pustych wpisów
    const entry = Object.fromEntries(Object.entries(page).filter(([, v]) => v !== '' && v !== false));
    if (Object.keys(entry).length) seo.pages[path] = entry; else delete seo.pages[path];
  } else if (b.action === 'share') {
    const share = { ogImage: String(b.ogImage || '').trim(), siteName: clean(b.siteName, 60), twitter: clean(b.twitter, 30).replace(/^@/, '') };
    if (!okImage(share.ogImage)) return json(422, { error: 'Nieprawidłowy adres obrazu. Wyślij plik przez panel.' });
    if (share.twitter && !/^[A-Za-z0-9_]{1,15}$/.test(share.twitter)) return json(422, { error: 'Konto X/Twitter: litery, cyfry i podkreślenie, maks. 15 znaków (bez @).' });
    seo.share = Object.fromEntries(Object.entries(share).filter(([, v]) => v !== ''));
  } else {
    return json(400, { error: 'Nieznana akcja.' });
  }

  try {
    await db(env).upsert('settings', { key: 'seo', value: seo, updated_at: new Date().toISOString(), updated_by: admin }, 'key', 'key');
    clearSeoCache();
    console.log(`Admin ${admin} zmienił SEO (${b.action}${b.path ? ' ' + b.path : ''})`);
    return json(200, { seo });
  } catch (e) {
    console.error('SEO POST: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Nie udało się zapisać ustawień SEO.' });
  }
};
