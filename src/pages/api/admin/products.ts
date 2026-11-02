import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  try {
    const rows = await db(env).select('products?select=id,name,price,bundles,stock,active,ean,updated_at&order=id');
    return json(200, { rows });
  } catch (e) {
    console.error('Admin products: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd pobierania produktów.' });
  }
};

// Zapis: { id, price (zł, np. "369,00" lub null), stock, active, ean }
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });

  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  if (typeof b?.id !== 'string' || !/^[a-z0-9-]{2,60}$/.test(b.id)) return json(400, { error: 'Nieprawidłowy produkt.' });

  const priceText = b.price === null || b.price === '' ? null : String(b.price).replace(/\s|zł/g, '').replace(',', '.');
  const price = priceText === null ? null : Math.round(Number(priceText) * 100);
  const stock = Number(b.stock);
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 10_000_000)) return json(422, { error: 'Nieprawidłowa cena.' });
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000) return json(422, { error: 'Nieprawidłowy stan magazynowy.' });

  try {
    const [row] = await db(env).update(`products?id=eq.${b.id}`, {
      price, stock, active: b.active === true, ean: String(b.ean || '').replace(/\D/g, '').slice(0, 14) || null,
    }, 'id,price,stock,active,ean,updated_at');
    if (!row) return json(404, { error: 'Nie znaleziono produktu.' });
    console.log(`Admin ${admin} zmienił produkt ${b.id}`);
    return json(200, { row });
  } catch (e) {
    console.error('Admin product save: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd zapisu.' });
  }
};
