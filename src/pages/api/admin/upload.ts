import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { requireAdmin } from '../../../lib/admin-auth';

export const prerender = false;

const TYPES: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

// Pobranie istniejącego zdjęcia (do usuwania tła w przeglądarce) – omija CORS obcych serwerów.
// Tylko admin, tylko https i tylko obrazy do 8 MB; Worker i tak nie sięga do sieci prywatnych (global_fetch_strictly_public).
export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  const src = url.searchParams.get('src') || '';
  if (!/^https:\/\/[^\s]+$/.test(src)) return json(400, { error: 'Nieprawidłowy adres zdjęcia.' });
  try {
    const res = await fetch(src, { redirect: 'follow' });
    const type = (res.headers.get('Content-Type') || '').split(';')[0].trim();
    if (!res.ok || !/^image\/(png|jpeg|webp|gif)$/.test(type)) return json(422, { error: 'Pod tym adresem nie ma zdjęcia.' });
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 8 * 1024 * 1024) return json(413, { error: 'Zdjęcie jest większe niż 8 MB.' });
    return new Response(buf, { headers: { 'Content-Type': type, 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('Pobranie zdjęcia: ' + (e instanceof Error ? e.message : String(e)));
    return json(502, { error: 'Nie udało się pobrać zdjęcia.' });
  }
};

// Wysyłka zdjęcia produktu do Supabase Storage (publiczny bucket „products”)
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const product = String(form?.get('product') || 'produkt').replace(/[^a-z0-9-]/g, '').slice(0, 60) || 'produkt';
  if (!(file instanceof File)) return json(400, { error: 'Brak pliku.' });
  // Logo sklepu (folder logo/) i grafiki stron z CMS (folder cms/): dodatkowo SVG sprawdzone pod kątem skryptów
  const isLogo = product === 'logo';
  const svgAllowed = isLogo || product === 'cms';
  const isSvg = svgAllowed && (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name));
  const ext = isSvg ? 'svg' : TYPES[file.type];
  if (!ext) return json(415, { error: svgAllowed ? 'Dozwolone formaty: SVG, PNG, JPG, WebP.' : 'Dozwolone formaty: WebP, JPG, PNG.' });
  if (file.size > (isLogo ? 1 : 5) * 1024 * 1024) return json(413, { error: `Plik jest większy niż ${isLogo ? 1 : 5} MB.` });
  let body: ReadableStream | string = file.stream();
  if (isSvg) {
    const text = await file.text();
    // SVG to kod: odrzucamy skrypty, zdarzenia JavaScript, osadzone strony i zewnętrzne zasoby
    if (!/<svg[\s>]/i.test(text)) return json(415, { error: 'To nie jest prawidłowy plik SVG.' });
    if (/<script|<foreignObject|<iframe|<embed|<object|\son\w+\s*=|javascript:|<!ENTITY|xlink:href\s*=\s*["']\s*(?!#|data:image\/)|\shref\s*=\s*["']\s*(?!#|data:image\/)/i.test(text))
      return json(422, { error: 'Plik SVG zawiera skrypty lub odwołania do zewnętrznych zasobów. Wyeksportuj logo jako „czysty” SVG albo PNG.' });
    body = text;
  }

  const base = (env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = env.SUPABASE_SECRET_KEY || '';
  const name = `${product}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const contentType = isSvg ? 'image/svg+xml' : file.type;
  const res = await fetch(`${base}/storage/v1/object/products/${name}`, {
    method: 'POST',
    headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': contentType, 'Cache-Control': 'max-age=31536000', 'x-upsert': 'false' },
    body,
    // @ts-ignore – wymagane przy wysyłaniu strumienia
    duplex: 'half',
  });
  if (!res.ok) {
    console.error('Upload zdjęcia: ' + res.status + ' ' + (await res.text()));
    return json(502, { error: isSvg ? 'Nie udało się zapisać pliku SVG. Czy uruchomiono skrypt 016_logo_svg.sql?' : 'Nie udało się zapisać zdjęcia. Czy istnieje bucket „products” w Supabase Storage?' });
  }
  return json(200, { url: `${base}/storage/v1/object/public/products/${name}` });
};
