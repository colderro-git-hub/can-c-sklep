// Plik klucza IndexNow: https://can-c.pl/{klucz}.txt (klucz z panelu: SEO → Weryfikacje). Inne adresy *.txt → 404.
import type { APIRoute } from 'astro';
import { getEnv } from '../lib/env';
import { getSeo } from '../lib/seo';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const notFound = () => new Response('Not found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  const name = String(params.indexnow || '');
  if (!/^[a-f0-9]{32}$/.test(name)) return notFound();
  const cfg = (await getSeo(await getEnv(locals))).indexnow || {};
  if (!cfg.enabled || cfg.key !== name) return notFound();
  return new Response(cfg.key, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
};
