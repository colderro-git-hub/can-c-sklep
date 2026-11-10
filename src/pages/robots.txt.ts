import type { APIRoute } from 'astro';
import { getEnv } from '../lib/env';
import { getCustomRobots, renderRobots } from '../lib/robots';
import { getSeo } from '../lib/seo';

export const prerender = false;

// Produkcja (can-c.pl): treść z panelu (SEO → Roboty i AI) albo domyślna + reguły botów AI + mapa strony.
// Staging i inne adresy: zawsze blokada indeksowania, niezależnie od ustawień.
export const GET: APIRoute = async ({ url, locals }) => {
  const production = /^(www\.)?can-c\.pl$/.test(url.hostname);
  const env = await getEnv(locals);
  const body = production
    ? renderRobots(await getCustomRobots(env), url.origin, (await getSeo(env)).ai?.block ?? [])
    : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
