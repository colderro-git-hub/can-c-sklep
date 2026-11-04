import type { APIRoute } from 'astro';
import { getEnv } from '../lib/env';
import { getCustomRobots, renderRobots } from '../lib/robots';

export const prerender = false;

// Produkcja (can-c.pl): treść z panelu (Ustawienia sklepu → robots.txt) albo domyślna + mapa strony.
// Staging i inne adresy: zawsze blokada indeksowania, niezależnie od ustawień.
export const GET: APIRoute = async ({ url, locals }) => {
  const production = /^(www\.)?can-c\.pl$/.test(url.hostname);
  const body = production
    ? renderRobots(await getCustomRobots(await getEnv(locals)), url.origin)
    : 'User-agent: *\nDisallow: /\n';
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
