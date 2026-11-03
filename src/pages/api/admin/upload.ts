import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { requireAdmin } from '../../../lib/admin-auth';

export const prerender = false;

const TYPES: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

// Wysyłka zdjęcia produktu do Supabase Storage (publiczny bucket „products”)
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const product = String(form?.get('product') || 'produkt').replace(/[^a-z0-9-]/g, '').slice(0, 60) || 'produkt';
  if (!(file instanceof File)) return json(400, { error: 'Brak pliku.' });
  const ext = TYPES[file.type];
  if (!ext) return json(415, { error: 'Dozwolone formaty: WebP, JPG, PNG.' });
  if (file.size > 5 * 1024 * 1024) return json(413, { error: 'Plik jest większy niż 5 MB.' });

  const base = (env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = env.SUPABASE_SECRET_KEY || '';
  const name = `${product}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const res = await fetch(`${base}/storage/v1/object/products/${name}`, {
    method: 'POST',
    headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': file.type, 'Cache-Control': 'max-age=31536000', 'x-upsert': 'false' },
    body: file.stream(),
    // @ts-ignore – wymagane przy wysyłaniu strumienia
    duplex: 'half',
  });
  if (!res.ok) {
    console.error('Upload zdjęcia: ' + res.status + ' ' + (await res.text()));
    return json(502, { error: 'Nie udało się zapisać zdjęcia. Czy istnieje bucket „products” w Supabase Storage?' });
  }
  return json(200, { url: `${base}/storage/v1/object/public/products/${name}` });
};
