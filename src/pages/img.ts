import type { APIRoute } from 'astro';
import { getEnv } from '../lib/env';
import { IMG_WIDTHS } from '../lib/img';
import { later } from '../lib/background';

export const prerender = false;

// /img?w=800&u=<adres zdjęcia w Supabase Storage> → zmniejszone zdjęcie (AVIF/WebP) z Cloudflare Images (binding IMAGES).
// Wynik w pamięci podręcznej Cloudflare (rok - adres zawiera szerokość, a zmiana zdjęcia w panelu zmienia adres pliku).
// Bez bindingu albo przy błędzie: przekierowanie do oryginału, więc strona nigdy nie traci zdjęcia.
export const GET: APIRoute = async ({ url, request, locals }) => {
  const env: any = await getEnv(locals);
  const src = url.searchParams.get('u') || '';
  const w = Number(url.searchParams.get('w'));
  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  if (!base || !src.startsWith(`${base}/storage/v1/object/public/`) || !(IMG_WIDTHS as readonly number[]).includes(w)) {
    return new Response('Nieprawidłowy obraz', { status: 400 });
  }
  const accept = request.headers.get('Accept') || '';
  const format = /image\/avif/.test(accept) ? 'image/avif' : 'image/webp';
  // Osobny wpis w pamięci podręcznej dla AVIF i WebP
  const cacheKey = new Request(`${url.origin}/img?w=${w}&f=${format === 'image/avif' ? 'avif' : 'webp'}&u=${encodeURIComponent(src)}`);
  const cache = (globalThis as any).caches?.default as Cache | undefined;
  const hit = await cache?.match(cacheKey);
  if (hit) return hit;

  if (!env.IMAGES?.input) return Response.redirect(src, 302);
  try {
    const orig = await fetch(src);
    if (!orig.ok || !orig.body) return Response.redirect(src, 302);
    const out = await env.IMAGES.input(orig.body).transform({ width: w, fit: 'scale-down' }).output({ format, quality: 82 });
    const res = new Response(out.image(), {
      headers: {
        'Content-Type': out.contentType?.() || format,
        'Cache-Control': 'public, max-age=31536000, immutable',
        Vary: 'Accept',
      },
    });
    if (cache) await later(locals, cache.put(cacheKey, res.clone()));
    return res;
  } catch (e) {
    console.error('Obraz /img: ' + (e instanceof Error ? e.message : String(e)));
    return Response.redirect(src, 302);
  }
};
