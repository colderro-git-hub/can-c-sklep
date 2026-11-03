import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';
import { clearCatalogCache, PRODUCT_FIELDS } from '../../../lib/catalog';
import { availabilityOf } from '../../../lib/pricing';
import { sendBackInStock } from '../../../lib/stock-notify';

export const prerender = false;

// Lista (GET) albo szczegóły produktu z historią cen (GET ?id=)
export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  const sb = db(env);
  try {
    const id = url.searchParams.get('id');
    if (id) {
      if (!/^[a-z0-9-]{2,60}$/.test(id)) return json(400, { error: 'Nieprawidłowy produkt.' });
      const [p] = await sb.select(`products?select=${PRODUCT_FIELDS}&id=eq.${id}`);
      if (!p) return json(404, { error: 'Nie znaleziono produktu.' });
      const history = await sb.select(`price_history?select=price,sale_price,changed_at&product_id=eq.${id}&order=changed_at.desc&limit=20`);
      const lowest30 = await sb.rpc('lowest_price_30d', { p_product: id }).catch(() => null);
      return json(200, { product: p, history, lowest30 });
    }
    const rows = await sb.select<any>(`products?select=${PRODUCT_FIELDS}&order=sort_order.asc,name.asc`);
    const reviews = await sb.select<{ product_id: string; rating: number; status: string }>('reviews?select=product_id,rating,status&limit=10000');
    const waiting = await sb.select<{ product_id: string }>('stock_notifications?select=product_id&notified_at=is.null&limit=10000').catch(() => []);
    return json(200, {
      rows: rows.map((p) => {
        const r = reviews.filter((x) => x.product_id === p.id);
        const ok = r.filter((x) => x.status === 'approved');
        return { ...p, avail: availabilityOf(p), reviewsApproved: ok.length, reviewsPending: r.filter((x) => x.status === 'pending').length, notifyWaiting: waiting.filter((w) => w.product_id === p.id).length, ratingAvg: ok.length ? Math.round((ok.reduce((s, x) => s + x.rating, 0) / ok.length) * 10) / 10 : null };
      }),
    });
  } catch (e) {
    console.error('Admin products: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd pobierania produktów. Czy uruchomiono skrypt 010_produkty_opinie.sql?' });
  }
};

const txt = (v: unknown, max: number) => String(v ?? '').replace(/\r/g, '').trim().slice(0, max);
const line = (v: unknown, max: number) => txt(v, max).replace(/[\n\t]+/g, ' ');
const money = (v: unknown) => { const t = String(v ?? '').replace(/\s|zł/g, '').replace(',', '.'); if (!t) return null; const n = Math.round(Number(t) * 100); return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? n : NaN; };
const iso = (v: unknown) => { const t = String(v ?? '').trim(); if (!t) return null; const d = new Date(t); return isNaN(+d) ? 'bad' : d.toISOString(); };
const list = (v: unknown, max: number, each: number) => (Array.isArray(v) ? v : String(v ?? '').split(/\n|,/)).map((x) => line(x, each)).filter(Boolean).slice(0, max);

// Zapis: { action: 'save', isNew, id, ...pola } | { action: 'duplicate', id }
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  const sb = db(env);

  try {
    if (b.action === 'duplicate') {
      const [src] = await sb.select<any>(`products?select=*&id=eq.${String(b.id).replace(/[^a-z0-9-]/g, '')}`);
      if (!src) return json(404, { error: 'Nie znaleziono produktu.' });
      let id = `${src.id}-kopia`; for (let i = 2; (await sb.select(`products?select=id&id=eq.${id}`)).length; i++) id = `${src.id}-kopia-${i}`;
      const { created_at, updated_at, ...rest } = src;
      await sb.insert('products', { ...rest, id, name: `${src.name} (kopia)`, active: false, stock: 0, ean: null }, 'id');
      clearCatalogCache();
      return json(200, { id });
    }
    if (b.action !== 'save') return json(400, { error: 'Nieznana akcja.' });

    const id = line(b.id, 60).toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) || id.length < 2) return json(422, { error: 'Adres (slug): małe litery, cyfry i myślniki, np. krople-can-c-k9.' });
    const price = money(b.price), sale = money(b.sale_price);
    const sale_start = iso(b.sale_start), sale_end = iso(b.sale_end);
    const images = (Array.isArray(b.images) ? b.images : []).filter((i: any) => typeof i?.url === 'string' && /^https:\/\//.test(i.url)).slice(0, 15).map((i: any) => ({ url: i.url.slice(0, 500), alt: line(i.alt, 150) }));
    const unit_value = b.unit_value === '' || b.unit_value == null ? null : Number(String(b.unit_value).replace(',', '.'));
    const errors: string[] = [];
    if (line(b.name, 150).length < 3) errors.push('Podaj nazwę produktu.');
    if (Number.isNaN(price)) errors.push('Nieprawidłowa cena.');
    if (Number.isNaN(sale)) errors.push('Nieprawidłowa cena promocyjna.');
    if (sale !== null && price !== null && sale >= price) errors.push('Cena promocyjna musi być niższa od regularnej.');
    if (sale_start === 'bad' || sale_end === 'bad') errors.push('Nieprawidłowa data promocji.');
    if (![0, 5, 8, 23].includes(Number(b.vat_rate))) errors.push('Stawka VAT: 0, 5, 8 lub 23%.');
    if (!Number.isInteger(Number(b.stock)) || Number(b.stock) < 0) errors.push('Nieprawidłowy stan magazynowy.');
    const ean = String(b.ean ?? '').replace(/\D/g, '');
    if (ean && ![8, 12, 13, 14].includes(ean.length)) errors.push('EAN/GTIN: 8, 12, 13 lub 14 cyfr.');
    if (unit_value !== null && (!Number.isFinite(unit_value) || unit_value <= 0)) errors.push('Nieprawidłowa ilość w opakowaniu.');
    if (errors.length) return json(422, { error: errors.join(' ') });

    const row = {
      id, name: line(b.name, 150), subtitle: line(b.subtitle, 60) || null, active: b.active === true,
      price, sale_price: sale, sale_start, sale_end, vat_rate: Number(b.vat_rate), bundles: b.bundles === true,
      short_description: txt(b.short_description, 300) || null, description: txt(b.description, 20000) || null,
      highlights: list(b.highlights, 10, 150), seo_title: line(b.seo_title, 70) || null, seo_description: line(b.seo_description, 170) || null,
      tags: list(b.tags, 20, 40), images, stock: Number(b.stock), low_stock_alert: Math.max(0, Math.round(Number(b.low_stock_alert) || 0)),
      availability: ['in_stock', 'out_of_stock', 'preorder', 'backorder'].includes(b.availability) ? b.availability : null,
      ean: ean || null, mpn: line(b.mpn, 70) || null, brand: line(b.brand, 70) || 'Can-C', google_category: line(b.google_category, 250) || null,
      condition: ['new', 'refurbished', 'used'].includes(b.condition) ? b.condition : 'new',
      unit_value, unit_measure: ['ml', 'l', 'g', 'kg', 'szt'].includes(b.unit_measure) ? b.unit_measure : null,
      weight_g: b.weight_g ? Math.max(0, Math.round(Number(b.weight_g))) : null,
      related_ids: list(b.related_ids, 6, 60).filter((r) => r !== id), sort_order: Math.round(Number(b.sort_order) || 0),
    };

    if (b.isNew) {
      if ((await sb.select(`products?select=id&id=eq.${id}`)).length) return json(409, { error: 'Produkt o takim adresie już istnieje.' });
      await sb.insert('products', row, 'id');
    } else {
      const [before] = await sb.select<any>(`products?select=availability,active&id=eq.${id}`);
      const [saved] = await sb.update(`products?id=eq.${id}`, row, 'id');
      if (!saved) return json(404, { error: 'Nie znaleziono produktu.' });
      // Produkt wrócił do sprzedaży → wysyłamy powiadomienia czekającym klientom
      const wasOut = before && availabilityOf(before) === 'out_of_stock';
      if (wasOut && availabilityOf(row) !== 'out_of_stock' && row.active && row.price !== null) {
        clearCatalogCache();
        const r = await sendBackInStock(env, id, new URL(request.url).origin);
        if (r.sent) { console.log(`Admin ${admin} zapisał produkt ${id}; powiadomienia: ${r.sent}`); return json(200, { id, notified: r.sent }); }
      }
    }
    clearCatalogCache();
    console.log(`Admin ${admin} zapisał produkt ${id}`);
    return json(200, { id });
  } catch (e) {
    console.error('Admin product save: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd zapisu.' });
  }
};
