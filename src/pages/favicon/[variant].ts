import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/env';
import { faviconResponse, type FaviconVariant } from '../../lib/favicon';

export const prerender = false;

export const GET: APIRoute = async ({ params, locals }) => {
  const v = params.variant;
  if (v !== 'light' && v !== 'dark' && v !== 'apple') return new Response(null, { status: 404 });
  return faviconResponse(await getEnv(locals), v as FaviconVariant);
};
