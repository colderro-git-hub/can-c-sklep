import type { APIRoute } from 'astro';
import { getEnv, json } from '../../lib/env';
import { db } from '../../lib/supabase';
import { priceCart, PRODUCT_PRICE_FIELDS, type DbProduct } from '../../lib/pricing';
import { checkCode } from '../../lib/discounts';
import { getPromotions } from '../../lib/promotions-db';

export const prerender = false;

// Podgląd rabatu z kodu w koszyku / przy zamówieniu: { code, email, items: [{slug, qty}] }
export const POST: APIRoute = async ({ request, locals }) => {
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  const lines = Array.isArray(b.items)
    ? b.items.filter((i: any) => typeof i?.slug === 'string' && Number.isInteger(i?.qty) && i.qty > 0 && i.qty <= 20).slice(0, 10)
    : [];
  if (!lines.length) return json(422, { error: 'Koszyk jest pusty.' });
  try {
    const env = await getEnv(locals);
    const sb = db(env);
    const ids = [...new Set(lines.map((l: any) => `"${String(l.slug).replace(/"/g, '')}"`))].join(',');
    const products = await sb.select<DbProduct>(`products?select=${PRODUCT_PRICE_FIELDS}&id=in.(${ids})`);
    let priced;
    try { priced = priceCart(lines, products, await getPromotions(env)); } catch { return json(409, { error: 'Któryś z produktów jest niedostępny. Odśwież koszyk.' }); }
    if (priced.codesBlockedBy) return json(422, { error: `Kod rabatowy nie łączy się z promocją „${priced.codesBlockedBy}”.` });
    const email = typeof b.email === 'string' && b.email.includes('@') ? b.email.trim().toLowerCase().slice(0, 200) : null;
    const r = await checkCode(sb, b.code, priced.total, email);
    if (!r.ok) return json(422, { error: r.error });
    return json(200, { code: r.code.code, amount: r.amount, total: priced.total - r.amount });
  } catch (e) {
    console.error('Rabat: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Nie udało się sprawdzić kodu.' });
  }
};
