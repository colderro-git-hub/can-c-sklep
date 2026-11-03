import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/env';
import { db } from '../../lib/supabase';
import { unsubscribeToken } from '../../lib/automations';

export const prerender = false;

// Wypisanie z maili marketingowych jednym kliknięciem (link w mailu, podpisany HMAC)
async function handle(url: URL, locals: unknown) {
  const env = await getEnv(locals);
  const c = url.searchParams.get('c') || '';
  const t = url.searchParams.get('t') || '';
  if (!/^[0-9a-f-]{36}$/i.test(c) || !env.CRON_SECRET || t !== (await unsubscribeToken(env, c))) {
    return Response.redirect(new URL('/wypisano/?blad=1', url), 303);
  }
  try {
    await db(env).update(`customers?id=eq.${c}`, { marketing_consent: false, consent_source: 'wypisanie z maila' }, 'id');
  } catch (e) {
    console.error('Wypisanie: ' + (e instanceof Error ? e.message : String(e)));
    return Response.redirect(new URL('/wypisano/?blad=1', url), 303);
  }
  return Response.redirect(new URL('/wypisano/', url), 303);
}
export const GET: APIRoute = ({ url, locals }) => handle(url, locals);
export const POST: APIRoute = ({ url, locals }) => handle(url, locals); // List-Unsubscribe-Post (Gmail, Outlook)
