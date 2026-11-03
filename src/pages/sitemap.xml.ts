import type { APIRoute } from 'astro';
import { getEnv } from '../lib/env';
import { getCatalog } from '../lib/catalog';

export const prerender = false;

// Mapa strony dla Google: strony informacyjne + produkty z bazy (z datą zmiany i zdjęciami)
const PAGES = ['/', '/sklep/', '/stosowanie/', '/faq/', '/kontakt/', '/o-nas/', '/formy-dostawy/', '/formy-platnosci/', '/odstapienie-od-umowy/', '/regulamin/', '/polityka-prywatnosci/'];
const x = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

export const GET: APIRoute = async ({ locals, url }) => {
  const origin = url.origin;
  let products: Awaited<ReturnType<typeof getCatalog>> = [];
  try { products = await getCatalog(await getEnv(locals)); } catch (e) { console.error('Sitemap: ' + (e instanceof Error ? e.message : String(e))); }
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...PAGES.map((p) => `  <url><loc>${x(origin + p)}</loc></url>`),
    ...products.map((p) => [
      '  <url>',
      `    <loc>${x(`${origin}/produkt/${p.id}/`)}</loc>`,
      p.updated_at ? `    <lastmod>${p.updated_at.slice(0, 10)}</lastmod>` : '',
      ...p.images.slice(0, 10).map((i) => `    <image:image><image:loc>${x(i.url)}</image:loc></image:image>`),
      '  </url>',
    ].filter(Boolean).join('\n')),
    '</urlset>',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
