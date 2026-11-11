// Liczenie zamówienia po stronie serwera – ceny zawsze z bazy, nigdy z przeglądarki.
import { applyPromotions, type Promotion } from './promotions';
export type DbProduct = {
  id: string; name: string; price: number | null; bundles: boolean; active: boolean;
  sale_price?: number | null; sale_start?: string | null; sale_end?: string | null;
  stock?: number; availability?: string | null;
};
export type CartLine = { slug: string; qty: number };

// Kolumny potrzebne do wyceny – używaj w zapytaniach o produkty do koszyka
export const PRICING_COLS = 'id,name,price,bundles,active,sale_price,sale_start,sale_end,stock,availability';

export function saleActive(p: Pick<DbProduct, 'sale_price' | 'sale_start' | 'sale_end' | 'price'>, now = Date.now()) {
  if (p.sale_price == null || p.price == null || p.sale_price >= p.price) return false;
  if (p.sale_start && new Date(p.sale_start).getTime() > now) return false;
  if (p.sale_end && new Date(p.sale_end).getTime() < now) return false;
  return true;
}
export const effectivePrice = (p: DbProduct) => (saleActive(p) ? (p.sale_price as number) : p.price);
// Dostępność: ręczne ustawienie z panelu, inaczej „dostępny” (stan 0 nie blokuje sprzedaży – to ewidencja)
export type Availability = 'in_stock' | 'out_of_stock' | 'preorder' | 'backorder';
export const availabilityOf = (p: Pick<DbProduct, 'availability'>): Availability =>
  (['in_stock', 'out_of_stock', 'preorder', 'backorder'].includes(p.availability || '') ? p.availability : 'in_stock') as Availability;
export const isAvailable = (p: DbProduct) => availabilityOf(p) !== 'out_of_stock';

// Rabaty ilościowe i zestawowe pochodzą z promocji (lib/promotions.ts, panel: Kody rabatowe → Promocje)
export function priceCart(lines: CartLine[], products: DbProduct[], promos: Promotion[] = [], now = Date.now()) {
  const base = lines.map((l) => {
    const p = products.find((x) => x.id === l.slug);
    const unit = p ? effectivePrice(p) : null;
    if (!p || !p.active || unit === null || !isAvailable(p)) throw new Error(`Produkt niedostępny: ${l.slug}`);
    return { p, qty: l.qty, unit };
  });
  const promo = applyPromotions(base.map((b) => ({ product_id: b.p.id, qty: b.qty, unit_price: b.unit })), promos, now);
  const items = base.map(({ p, qty, unit }) => {
    const gross = unit * qty;
    const discount = Math.min(gross, promo.discounts[p.id] ?? 0);
    return { product_id: p.id, name: p.name, qty, unit_price: unit, discount, total: gross - discount };
  });
  const subtotal = items.reduce((s, i) => s + i.unit_price * i.qty, 0);
  const discount = items.reduce((s, i) => s + i.discount, 0);
  const shipping_cost = 0; // darmowa dostawa w Polsce
  return {
    items, subtotal, discount, shipping_cost, total: subtotal - discount + shipping_cost,
    promotions: promo.applied,
    // Kod rabatowy nie łączy się z promocją, która ma wyłączone „łączy się z kodami”
    codesBlockedBy: promo.applied.find((a) => !a.with_codes)?.label ?? null,
  };
}
export const PRODUCT_PRICE_FIELDS = PRICING_COLS;
