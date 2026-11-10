import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';
import { getSite, clearSiteCache, SITE_KEYS, CONTENT_KEYS } from '../../../lib/site-settings';
import { getCustomRobots, clearRobotsCache, defaultRobots, invalidRobotsLines, renderRobots, ROBOTS_MAX } from '../../../lib/robots';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  clearSiteCache(); clearRobotsCache();
  const custom = await getCustomRobots(env);
  return json(200, { site: await getSite(env), robots: { text: custom, default: defaultRobots(), preview: renderRobots(custom, 'https://can-c.pl') } });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }

  // robots.txt – osobny zapis (klucz settings 'robots'); pusta treść = domyślna
  // GTM ID – osobna akcja, nie wymaga pełnych danych sklepu
  if (b.action === 'gtm') {
    const gtmId = String(b.gtmId ?? '').trim().toUpperCase();
    if (gtmId && !/^GTM-[A-Z0-9]{4,10}$/.test(gtmId)) return json(422, { error: 'Nieprawidłowy GTM ID. Format: GTM-XXXXXXX' });
    try {
      const sb = db(env);
      const [row] = await sb.select<{ value: Record<string, unknown> }>('settings?select=value&key=eq.site');
      const existing = row?.value ?? {};
      await sb.upsert('settings', { key: 'site', value: { ...existing, gtmId }, updated_at: new Date().toISOString(), updated_by: admin }, 'key', 'key');
      clearSiteCache();
      console.log(`Admin ${admin} zmienił GTM ID na ${gtmId || '(puste)'}`);
      return json(200, { ok: true, gtmId });
    } catch (e) {
      console.error('Zapis GTM ID: ' + (e instanceof Error ? e.message : String(e)));
      return json(500, { error: 'Nie udało się zapisać GTM ID.' });
    }
  }

  // Logo (nagłówek / stopka) – osobny zapis; adres musi wskazywać na folder logo/ we własnym magazynie zdjęć
  if (b.action === 'logo') {
    const field = b.target === 'footer' ? 'logoFooter' : b.target === 'header' ? 'logoHeader' : '';
    if (!field) return json(400, { error: 'Nieznane miejsce logo.' });
    const url = String(b.url ?? '').trim();
    const base = (env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
    if (url && !url.startsWith(`${base}/storage/v1/object/public/products/logo/`)) return json(422, { error: 'Nieprawidłowy adres logo. Wyślij plik przez panel.' });
    try {
      const sb = db(env);
      const [row] = await sb.select<{ value: Record<string, unknown> }>('settings?select=value&key=eq.site');
      await sb.upsert('settings', { key: 'site', value: { ...(row?.value ?? {}), [field]: url }, updated_at: new Date().toISOString(), updated_by: admin }, 'key', 'key');
      clearSiteCache();
      console.log(`Admin ${admin} zmienił ${field}: ${url || '(usunięte)'}`);
      return json(200, { ok: true, [field]: url });
    } catch (e) {
      console.error('Zapis logo: ' + (e instanceof Error ? e.message : String(e)));
      return json(500, { error: 'Nie udało się zapisać logo.' });
    }
  }

  if (b.action === 'robots') {
    const text = String(b.text ?? '').replace(/\r/g, '').replace(/\t/g, ' ').trim();
    if (text.length > ROBOTS_MAX) return json(422, { error: `robots.txt może mieć maks. ${ROBOTS_MAX} znaków.` });
    const bad = invalidRobotsLines(text);
    if (bad.length) return json(422, { error: `Nieprawidłowe linie: ${bad.slice(0, 5).join(', ')}. Każda linia to „Pole: wartość”, komentarz (#) albo pusta.` });
    try {
      await db(env).upsert('settings', { key: 'robots', value: { text }, updated_at: new Date().toISOString(), updated_by: admin }, 'key', 'key');
      clearRobotsCache();
      console.log(`Admin ${admin} zmienił robots.txt`);
      return json(200, { robots: { text, default: defaultRobots(), preview: renderRobots(text, 'https://can-c.pl') } });
    } catch (e) {
      console.error('Zapis robots.txt: ' + (e instanceof Error ? e.message : String(e)));
      return json(500, { error: 'Nie udało się zapisać robots.txt.' });
    }
  }

  const v: Record<string, string> = {};
  for (const k of SITE_KEYS) v[k] = String(b[k] ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200);

  const errors: string[] = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) errors.push('Nieprawidłowy e-mail.');
  if (v.phone && !/^[+\d][\d\s-]{6,20}$/.test(v.phone)) errors.push('Nieprawidłowy telefon.');
  if (!v.company || !v.address) errors.push('Podaj nazwę firmy i adres.');
  if (v.nip && !/^\d{10}$/.test(v.nip.replace(/\D/g, ''))) errors.push('NIP: 10 cyfr.');
  if (v.regon && !/^\d{9}(\d{5})?$/.test(v.regon.replace(/\D/g, ''))) errors.push('REGON: 9 lub 14 cyfr.');
  for (const k of ['facebook', 'returnsUrl'] as const) if (v[k] && !/^https:\/\/[^\s]+$/.test(v[k])) errors.push(`Adres ${k === 'facebook' ? 'Facebooka' : 'szybkich zwrotów'} musi zaczynać się od https://`);
  if (errors.length) return json(422, { error: errors.join(' ') });
  v.nip = v.nip.replace(/\D/g, ''); v.regon = v.regon.replace(/\D/g, '');

  // Treści: pasek promocji, czas wysyłki, komunikat
  const LIMITS: Record<string, number> = { promo1: 80, promo2: 80, promo3: 80, shippingTime: 80, noticeText: 300 };
  for (const k of CONTENT_KEYS) v[k] = String(b[k] ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, LIMITS[k] ?? 40);
  // Walidacja GTM ID
  if (v.gtmId && !/^GTM-[A-Z0-9]{4,10}$/.test(v.gtmId)) return json(422, { error: 'Nieprawidłowy GTM ID. Format: GTM-XXXXXXX' });
  v.noticeEnabled = b.noticeEnabled === true || b.noticeEnabled === 'true' ? 'true' : '';
  const toIso = (x: string) => { if (!x) return ''; const d = new Date(x); return isNaN(+d) ? 'bad' : d.toISOString(); };
  v.noticeFrom = toIso(v.noticeFrom); v.noticeTo = toIso(v.noticeTo);
  if (v.noticeFrom === 'bad' || v.noticeTo === 'bad') return json(422, { error: 'Nieprawidłowa data komunikatu.' });
  if (v.noticeFrom && v.noticeTo && v.noticeFrom > v.noticeTo) return json(422, { error: 'Data końca komunikatu jest wcześniejsza niż początku.' });
  if (v.noticeEnabled && !v.noticeText) return json(422, { error: 'Wpisz treść komunikatu albo go wyłącz.' });
  if (!v.shippingTime) return json(422, { error: 'Podaj czas wysyłki.' });

  try {
    // Pola, których ten formularz nie wysyła (GTM ID z zakładki Analityka, logo), zostają bez zmian
    const [row] = await db(env).select<{ value: Record<string, unknown> }>('settings?select=value&key=eq.site');
    const prev = row?.value ?? {};
    for (const k of CONTENT_KEYS) if (!(k in b) && k !== 'noticeEnabled' && typeof prev[k] === 'string') v[k] = prev[k] as string;
    await db(env).upsert('settings', { key: 'site', value: { ...prev, ...v }, updated_at: new Date().toISOString(), updated_by: admin }, 'key', 'key');
    clearSiteCache();
    console.log(`Admin ${admin} zmienił ustawienia sklepu`);
    return json(200, { site: v });
  } catch (e) {
    console.error('Zapis ustawień: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Nie udało się zapisać. Czy uruchomiono skrypt 006_ustawienia.sql?' });
  }
};
