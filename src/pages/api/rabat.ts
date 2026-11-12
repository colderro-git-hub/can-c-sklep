import type { APIRoute } from 'astro';
import { getEnv, json } from '../../lib/env';
import { db } from '../../lib/supabase';
import { priceCart, PRODUCT_PRICE_FIELDS, type DbProduct } from '../../lib/pricing';
import { checkCode, normalizeCode } from '../../lib/discounts';
import { getPromotions, findCodePromotion } from '../../lib/promotions-db';
import { promoActive, describeDiscount } from '../../lib/promotions';

export const prerender = false;

// Warunki promocji z kodem – do komunikatu, gdy koszyk ich nie spełnia
const conditions = (p: NonNullable<Awaited<ReturnType<typeof findCodePromotion>>>, names: Map<string, string>) =>
  p.kind === 'bundle'
    ? `zestaw: ${p.items.map((i) => `${names.get(i.product_id) || i.product_id}${i.qty > 1 ? ` × ${i.qty}` : ''}`).join(' + ')}`
    : `od ${Math.min(...p.tiers.map((t) => t.min))} szt.: ${p.product_ids.map((id) => names.get(id) || id).join(', ')}`;

// Podgląd rabatu z kodu w koszyku / przy zamówieniu: { code, email, items: [{slug, qty}] }
// Kod może być zwykłym kodem rabatowym albo kodem uruchamiającym promocję (zestaw / rabat ilościowy)
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
    const promos = await getPromotions(env);
    let priced;
    try { priced = priceCart(lines, products, promos); } catch { return json(409, { error: 'Któryś z produktów jest niedostępny. Odśwież koszyk.' }); }

    // Promocja uruchamiana kodem
    const code = normalizeCode(b.code);
    const promo = await findCodePromotion(env, code);
    if (promo) {
      if (!promoActive(promo)) return json(422, { error: 'Ten kod nie jest aktywny.' });
      const withCode = priceCart(lines, products, promos, { code });
      if (!withCode.codePromo) {
        const names = new Map((await sb.select<{ id: string; name: string }>('products?select=id,name')).map((p) => [p.id, p.name]));
        return json(422, { error: `Kod działa przy zakupie – ${conditions(promo, names)}.` });
      }
      const amount = priced.total - withCode.total;
      if (amount <= 0) return json(422, { error: 'Ten kod nie obniży ceny tego koszyka – obecne rabaty są korzystniejsze.' });
      return json(200, { code, amount, total: withCode.total, promo: withCode.codePromo.label, describe: promo.kind === 'bundle' ? describeDiscount(promo.type, promo.value) : null });
    }

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
