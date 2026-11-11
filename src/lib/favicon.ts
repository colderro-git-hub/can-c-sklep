// Favicon z panelu (Ustawienia sklepu → Favicon). Plik leży w Supabase Storage, a strona zawsze wskazuje stałe adresy
// /favicon/light, /favicon/dark, /favicon/apple – dzięki temu działa też na stronach statycznych (koszyk, zamówienie, konto).
import type { Env } from './env';
import { getSite } from './site-settings';

export type FaviconVariant = 'light' | 'dark' | 'apple';

export async function faviconResponse(env: Env, variant: FaviconVariant): Promise<Response> {
  const site = await getSite(env);
  // Brak wersji ciemnej → jasna; brak ikony Apple → jasna, o ile to bitmapa (iOS nie pokaże SVG)
  let url = variant === 'dark' ? site.faviconDark || site.faviconLight
    : variant === 'apple' ? site.faviconApple || (/\.png$/i.test(site.faviconLight) ? site.faviconLight : '')
    : site.faviconLight;
  const base = (env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  // Tylko pliki z własnego magazynu (folder logo/)
  if (!url || !base || !url.startsWith(`${base}/storage/v1/object/public/products/logo/`)) url = '';
  if (!url) return new Response('Brak ikony', { status: 404, headers: { 'Cache-Control': 'public, max-age=300' } });
  try {
    const res = await fetch(url);
    const type = (res.headers.get('Content-Type') || '').split(';')[0].trim();
    if (!res.ok || !/^image\/(svg\+xml|png|jpeg|webp)$/.test(type)) throw new Error(`HTTP ${res.status} ${type}`);
    return new Response(res.body, {
      headers: {
        'Content-Type': type,
        // Krótko: zmiana w panelu ma szybko dotrzeć do przeglądarek
        'Cache-Control': 'public, max-age=600',
        'X-Content-Type-Options': 'nosniff',
        ...(type === 'image/svg+xml' ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } : {}),
      },
    });
  } catch (e) {
    console.error('Favicon: ' + (e instanceof Error ? e.message : String(e)));
    return new Response('Brak ikony', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
}
