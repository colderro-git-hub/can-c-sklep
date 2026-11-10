// /llms.txt – opis sklepu dla modeli językowych (generowany; ustawienia w panelu: SEO → Roboty i AI)
import type { APIRoute } from 'astro';
import { getEnv } from '../lib/env';
import { buildLlms } from '../lib/llms';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  try {
    const { enabled, text } = await buildLlms(await getEnv(locals));
    if (!enabled) return new Response('Not found\n', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
  } catch (e) {
    console.error('llms.txt: ' + (e instanceof Error ? e.message : String(e)));
    return new Response('Service unavailable\n', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
};
