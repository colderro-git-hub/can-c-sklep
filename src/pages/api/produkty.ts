import type { APIRoute } from 'astro';
import { getEnv, json } from '../../lib/env';
import { getCatalog, leadTimeText } from '../../lib/catalog';
import { getSite } from '../../lib/site-settings';

export const prerender = false;

// Publiczny katalog dla koszyka i formularza zamówienia (ceny tylko do podglądu - płatność liczy serwer)
export const GET: APIRoute = async ({ locals }) => {
  try {
    const env = await getEnv(locals);
    const [list, site] = await Promise.all([getCatalog(env), getSite(env)]);
    const body = list.map((p) => ({
      slug: p.id, name: p.name, size: p.subtitle || '', price: p.current, regular: p.price, onSale: p.onSale,
      bundles: p.bundles, avail: p.avail, image: p.images[0]?.url || null, imageAlt: p.images[0]?.alt || p.name,
      leadTime: leadTimeText(p.lead_time, site.shippingTime),
    }));
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' } });
  } catch (e) {
    console.error('API produkty: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd pobierania produktów.' });
  }
};
