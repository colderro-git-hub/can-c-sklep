import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/env';
import { getSite } from '../../lib/site-settings';

export const prerender = false;

// Publiczne dane kontaktowe sklepu (te same, które są na stronie) – z krótką pamięcią podręczną
export const GET: APIRoute = async ({ locals }) => {
  const site = await getSite(await getEnv(locals));
  return new Response(JSON.stringify(site), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
};
