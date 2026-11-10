// Przekierowania ze starych adresów (np. WordPress) i dziennik błędów 404 – panel: SEO → Przekierowania.
// Pliki statyczne Cloudflare serwuje bez udziału tego kodu, więc nie spowalnia to zwykłych stron.
import { defineMiddleware } from 'astro:middleware';
import { getEnv } from './lib/env';
import { matchRedirect, targetUrl, isProbe, logNotFound, countRedirectHit } from './lib/redirects';

// Zapis „w tle” po wysłaniu odpowiedzi (ctx.waitUntil); gdy niedostępne – czekamy na zapis
async function later(locals: unknown, task: Promise<unknown>) {
  const safe = task.catch((e) => console.error('SEO w tle: ' + (e instanceof Error ? e.message : String(e))));
  try {
    const ctx = (locals as any)?.runtime?.ctx ?? (locals as any)?.cfContext;
    if (ctx?.waitUntil) return ctx.waitUntil(safe);
  } catch { /* Astro 6+: brak locals.runtime */ }
  try {
    const mod: any = await import('cloudflare:workers');
    if (typeof mod.waitUntil === 'function') return mod.waitUntil(safe);
  } catch { /* poza Workers */ }
  await safe;
}

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
