// Liczenie zamówienia po stronie serwera – ceny zawsze z bazy, nigdy z przeglądarki.
export type DbProduct = { id: string; name: string; price: number | null; bundles: boolean; active: boolean };
export type CartLine = { slug: string; qty: number };

export const discountRate = (qty: number, bundles: boolean) => (!bundles ? 0 : qty >= 4 ? 0.1 : qty >= 2 ? 0.08 : 0);

export function priceCart(lines: CartLine[], products: DbProduct[]) {
  const items = lines.map((l) => {
    const p = products.find((x) => x.id === l.slug);
    if (!p || !p.active || p.price === null) throw new Error(`Produkt niedostępny: ${l.slug}`);
    const gross = p.price * l.qty;
    const discount = Math.round(gross * discountRate(l.qty, p.bundles));
    return { product_id: p.id, name: p.name, qty: l.qty, unit_price: p.price, discount, total: gross - discount };
  });
  const subtotal = items.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const discount = items.reduce((s, i) => s + i.discount, 0);
  const shipping_cost = 0; // darmowa dostawa w Polsce
  return { items, subtotal, discount, shipping_cost, total: subtotal - discount + shipping_cost };
}
