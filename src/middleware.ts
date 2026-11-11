// Przekierowania ze starych adresów (np. WordPress) i dziennik błędów 404 – panel: SEO → Przekierowania.
// Pliki statyczne Cloudflare serwuje bez udziału tego kodu, więc nie spowalnia to zwykłych stron.
import { defineMiddleware } from 'astro:middleware';
import { getEnv } from './lib/env';
import { matchRedirect, targetUrl, isProbe, logNotFound, countRedirectHit } from './lib/redirects';
import { later } from './lib/background';

const SKIP = /^\/(api|admin|_astro|_image|_server-islands)(\/|$)/;

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) return next();
  const { pathname, search } = context.url;
  const method = context.request.method;
  if (SKIP.test(pathname) || (method !== 'GET' && method !== 'HEAD')) return next();

  let env: Awaited<ReturnType<typeof getEnv>> | null = null;
  try { env = await getEnv(context.locals); } catch { /* brak środowiska */ }
  if (!env?.SUPABASE_URL) return next();

  const hit = await matchRedirect(env, pathname, search);
  if (hit) {
    const location = targetUrl(hit.r.to_url, search, hit.keepQuery);
    // Ochrona przed pętlą: cel prowadzi z powrotem na ten sam adres
    if (new URL(location, context.url).href !== context.url.href) {
      await later(context.locals, countRedirectHit(env, hit.r.id));
      return new Response(null, { status: hit.r.code, headers: { Location: location, 'Cache-Control': 'public, max-age=300' } });
    }
  }

  const res = await next();
  if (res.status === 404 && method === 'GET' && !isProbe(pathname)) {
    const ref = context.request.headers.get('referer');
    await later(context.locals, logNotFound(env, pathname + search, ref, context.request.headers.get('user-agent')));
  }
  return res;
});
