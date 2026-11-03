import type { APIRoute } from 'astro';

export const prerender = false;

// Produkcja (can-c.pl): indeksowanie + mapa strony. Staging i inne adresy: blokada indeksowania.
export const GET: APIRoute = ({ url }) => {
  const production = /^(www\.)?can-c\.pl$/.test(url.hostname);
  const body = production
    ? ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /konto', 'Disallow: /koszyk', 'Disallow: /zamowienie', '', `Sitemap: ${url.origin}/sitemap.xml`].join('\n')
    : ['User-agent: *', 'Disallow: /'].join('\n');
  return new Response(body + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
