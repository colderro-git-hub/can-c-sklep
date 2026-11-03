import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../../lib/env';
import { db } from '../../../../lib/supabase';
import { authorized, fromWarsaw, toFurgonetkaOrder } from '../../../../lib/furgonetka';

export const prerender = false;

// GET /api/furgonetka/orders?datetime=2026-11-02T10:00:00&limit=100
// Furgonetka cyklicznie pobiera zamówienia zmienione po podanej dacie (od najstarszych).
// Przekazujemy tylko zamówienia z nowego sklepu, opłacone lub później (nieopłacone nie trafiają do wysyłki).
export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = await getEnv(locals);
  if (!authorized(request, env)) return json(401, { error: 'Unauthorized' });

  const since = fromWarsaw(url.searchParams.get('datetime') || '') || '2000-01-01T00:00:00Z';
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 100));
  const sources = env.ALLOW_WC_ACTIONS === 'true' ? 'shop,admin,woocommerce' : 'shop,admin';

  try {
    const rows = await db(env).select(
      `orders?select=id,number,created_at,updated_at,paid_at,email,status,total,shipping_cost,shipping_method,shipping_point,shipping_address,billing,customer_note,` +
        `order_items(product_id,name,qty,total,products(ean)),customers(first_name,last_name,phone)` +
        `&source=in.(${sources})&status=in.(paid,on_hold,shipped,completed,cancelled)` +
        `&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc&limit=${limit}`,
    );
    return json(200, rows.map(toFurgonetkaOrder));
  } catch (e) {
    console.error('Furgonetka orders: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Server error' });
  }
};
