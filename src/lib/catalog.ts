// Katalog produktów dla sklepu: dane z bazy + cena efektywna, najniższa z 30 dni, cena jednostkowa, oceny.
import type { Env } from './env';
import { db } from './supabase';
import { saleActive, effectivePrice, availabilityOf, type DbProduct, type Availability } from './pricing';

// Opinie testowe (source=test) widoczne tylko przy SHOW_TEST_REVIEWS=true - domyślnie ukryte
export const testReviewsFilter = (env: Env) => (env.SHOW_TEST_REVIEWS === 'true' ? '' : '&source=neq.test');

export type Product = DbProduct & {
  subtitle: string | null; short_description: string | null; description: string | null; highlights: string[];
  seo_title: string | null; seo_description: string | null; tags: string[]; vat_rate: number;
  images: { url: string; alt?: string }[]; ean: string | null; brand: string; mpn: string | null;
  google_category: string | null; condition: string; unit_value: number | null; unit_measure: string | null;
  weight_g: number | null; related_ids: string[]; sort_order: number; stock: number; low_stock_alert: number; updated_at: string;
  how_to_use: string | null; lead_time: string | null;
};
export type CatalogItem = Product & {
  current: number | null; onSale: boolean; avail: Availability; lowest30: number | null; unitPrice: string | null;
  rating: { avg: number; count: number };
};
export type Review = { id: string; product_id: string; author_name: string; rating: number; title: string | null; body: string; verified_purchase: boolean; reply: string | null; created_at: string };

export const PRODUCT_FIELDS = 'id,name,subtitle,price,bundles,active,stock,low_stock_alert,ean,sale_price,sale_start,sale_end,vat_rate,short_description,description,highlights,seo_title,seo_description,tags,images,brand,mpn,google_category,condition,availability,unit_value,unit_measure,weight_g,related_ids,sort_order,updated_at,how_to_use,lead_time';
export const PRODUCT_COLS = PRODUCT_FIELDS;

export const AVAIL_LABEL: Record<Availability, string> = {
  in_stock: 'Dostępny', out_of_stock: 'Chwilowo niedostępny', preorder: 'Przedsprzedaż', backorder: 'Na zamówienie',
};

// Etykieta na zdjęciu produktu (karty, strona produktu). „Dostępny” nie dostaje etykiety.
export const AVAIL_BADGE: Partial<Record<Availability, string>> = {
  out_of_stock: 'Brak w magazynie', preorder: 'Przedsprzedaż', backorder: 'Na zamówienie',
};

// Termin realizacji jako pełne zdanie: tekst z produktu (wpisany w panelu) albo „Wysyłamy <czas wysyłki ze sklepu>.”
export function leadTimeText(productLeadTime: string | null | undefined, shippingTime: string) {
  const own = String(productLeadTime || '').trim().replace(/^[\s:;,.\u2013\u2014-]+/, '');
  if (own) return own.charAt(0).toUpperCase() + own.slice(1);
  return `Wysyłamy ${shippingTime}.`;
}

const pln = (g: number) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(g / 100);

// Cena jednostkowa (ustawa o informowaniu o cenach): np. „36,90 zł / 1 ml”
export function unitPriceLabel(p: Pick<Product, 'unit_value' | 'unit_measure'>, price: number | null) {
  const qty = Number(p.unit_value);
  if (!price || !qty || !p.unit_measure) return null;
  // ml/g: za 1 jednostkę przy małych opakowaniach, za 100 przy dużych; l/kg/szt: za 1
  const base = (p.unit_measure === 'ml' || p.unit_measure === 'g') && qty >= 100 ? 100 : 1;
  return `${pln(Math.round((price / qty) * base))} / ${base} ${p.unit_measure === 'szt' ? 'szt.' : p.unit_measure}`;
}

let cache: { at: number; items: CatalogItem[] } | null = null;

async function build(env: Env, products: Product[]): Promise<CatalogItem[]> {
  const sb = db(env);
  const reviews = products.length
    ? await sb.select<{ product_id: string; rating: number }>(`reviews?select=product_id,rating&status=eq.approved${testReviewsFilter(env)}&limit=10000`)
    : [];
  return Promise.all(products.map(async (p) => {
    let lowest30: number | null = null;
    try { lowest30 = (await sb.rpc('lowest_price_30d', { p_product: p.id })) as number | null; } catch { /* brak historii */ }
    const r = reviews.filter((x) => x.product_id === p.id);
    const current = effectivePrice(p);
    return {
      ...p, images: Array.isArray(p.images) ? p.images : [], tags: (p.tags || []).filter(Boolean), highlights: p.highlights || [], related_ids: p.related_ids || [],
      current, onSale: saleActive(p), avail: availabilityOf(p), lowest30, unitPrice: unitPriceLabel(p, current),
      rating: { avg: r.length ? Math.round((r.reduce((s, x) => s + x.rating, 0) / r.length) * 10) / 10 : 0, count: r.length },
    };
  }));
}

// Aktywne produkty (z 30-sekundową pamięcią w obrębie Workera)
export async function getCatalog(env: Env, { fresh = false } = {}): Promise<CatalogItem[]> {
  if (!fresh && cache && Date.now() - cache.at < 30_000) return cache.items;
  const products = await db(env).select<Product>(`products?select=${PRODUCT_FIELDS}&active=eq.true&order=sort_order.asc,name.asc`);
  const items = await build(env, products);
  cache = { at: Date.now(), items };
  return items;
}
export const clearCatalogCache = () => { cache = null; };

// Karta produktu: produkt, pierwsze opinie (kolejne doczytuje GET /api/opinie), produkty powiązane
export const REVIEWS_PAGE = 5;
export async function getProductPage(env: Env, slug: string) {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  const list = await getCatalog(env);
  const product = list.find((p) => p.id === slug);
  if (!product) return null;
  const reviews = await db(env).select<Review>(
    `reviews?select=id,product_id,author_name,rating,title,body,verified_purchase,reply,created_at&product_id=eq.${slug}&status=eq.approved${testReviewsFilter(env)}&order=created_at.desc&limit=${REVIEWS_PAGE}`,
  );
  const related = product.related_ids.map((id) => list.find((p) => p.id === id)).filter(Boolean) as CatalogItem[];
  return { product, reviews, related: related.length ? related : list.filter((p) => p.id !== slug).slice(0, 1) };
}
