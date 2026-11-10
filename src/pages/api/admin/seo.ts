// Zakładka SEO w panelu: odczyt i zapis ustawień SEO (settings, klucz 'seo').
// Etap 1: SEO stron (tytuł, opis, obraz OG, „nie indeksuj”) i udostępnianie (domyślny obraz, nazwa, Twitter/X).
import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { requireAdmin } from '../../../lib/admin-auth';
import { db } from '../../../lib/supabase';
import { SEO_PAGES, SEO_LIMITS, clearSeoCache, orgData, orgJsonLd, breadcrumbJsonLd, type SeoSettings } from '../../../lib/seo';
import { getSite } from '../../../lib/site-settings';

export const prerender = false;

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);

async function readSeo(env: Parameters<typeof db>[0]): Promise<SeoSettings> {
  const [row] = await db(env).select<{ value: Partial<SeoSettings> }>('settings?select=value&key=eq.seo');
  return { pages: row?.value?.pages ?? {}, share: row?.value?.share ?? {}, org: row?.value?.org ?? {} };
}

// Wartości domyślne (z Ustawień sklepu) i podgląd danych strukturalnych dla działu „Dane firmy”
function orgPreview(seo: SeoSettings, site: Record<string, any>) {
  return {
    orgDefaults: orgData({ ...seo, org: {} }, site),
    orgJsonLd: orgJsonLd(seo, site),
    crumbExample: breadcrumbJsonLd([{ name: 'Strona główna', path: '/' }, { name: 'Sklep', path: '/sklep/' }, { name: 'Krople Can-C', path: '/produkt/krople-can-c/' }]),
  };
}

export const GET: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  try {
    const seo = await readSeo(env);
    return json(200, { seo, pages: SEO_PAGES, limits: SEO_LIMITS, ...orgPreview(seo, await getSite(env)) });
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
  } else if (b.action === 'org') {
    const sameAs = String(b.sameAs || '').split(/\s+/).map((u) => u.trim()).filter(Boolean);
    if (sameAs.length > 10) return json(422, { error: 'Maksymalnie 10 profili.' });
    const badUrl = sameAs.find((u) => !/^https:\/\/[^\s/]+\.[^\s]+$/.test(u));
    if (badUrl) return json(422, { error: `Nieprawidłowy adres profilu: ${badUrl}. Podaj pełny adres zaczynający się od https://` });
    const org = {
      name: clean(b.name, 80), legalName: clean(b.legalName, 150), description: clean(b.description, 300),
      logo: String(b.logo || '').trim(), sameAs,
      street: clean(b.street, 120), postcode: clean(b.postcode, 6), city: clean(b.city, 60),
      foundingDate: clean(b.foundingDate, 10), breadcrumbs: b.breadcrumbs !== false,
    };
    if (!okImage(org.logo)) return json(422, { error: 'Nieprawidłowy adres logo. Wyślij plik przez panel.' });
    if (org.postcode && !/^\d{2}-\d{3}$/.test(org.postcode)) return json(422, { error: 'Kod pocztowy w formacie 00-000.' });
    if (org.foundingDate && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(org.foundingDate)) return json(422, { error: 'Data założenia: rok (np. 2012) albo RRRR-MM-DD.' });
    // Zapisujemy tylko pola różne od pustych; okruszki zapisujemy tylko gdy wyłączone
    seo.org = Object.fromEntries(Object.entries(org).filter(([k, v]) => (k === 'breadcrumbs' ? v === false : Array.isArray(v) ? v.length : v !== '')));
  } else {
    return json(400, { error: 'Nieznana akcja.' });
  }

  try {
    await db(env).upsert('settings', { key: 'seo', value: seo, updated_at: new Date().toISOString(), updated_by: admin }, 'key', 'key');
    clearSeoCache();
    console.log(`Admin ${admin} zmienił SEO (${b.action}${b.path ? ' ' + b.path : ''})`);
    return json(200, { seo, ...(b.action === 'org' ? orgPreview(seo, await getSite(env)) : {}) });
  } catch (e) {
    console.error('SEO POST: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Nie udało się zapisać ustawień SEO.' });
  }
};
