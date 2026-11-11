import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';
import { clearPromotionsCache } from '../../../lib/promotions-db';

export const prerender = false;

const UUID = /^[0-9a-f-]{36}$/i;
const PAID = 'paid,shipped,completed';
type Sb = ReturnType<typeof db>;

// Lista promocji ze statystykami; ?uses=<id> – promocja + zamówienia, w których ją naliczono
export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  try {
    const sb = db(env);
    const usesId = url.searchParams.get('uses');
    if (usesId) {
      if (!UUID.test(usesId)) return json(400, { error: 'Nieprawidłowa promocja.' });
      const [promo] = await sb.select<any>(`promotions?select=*&id=eq.${usesId}`);
      if (!promo) return json(404, { error: 'Nie znaleziono promocji.' });
      const rows = await sb.select<any>(
        `order_promotions?select=amount,orders(id,number,created_at,status,email,total,source,customer_id,shipping_address,customers(first_name,last_name))&promotion_id=eq.${usesId}&order=created_at.desc&limit=500`,
      );
      return json(200, {
        promo,
        uses: rows.filter((r) => r.orders).map(({ amount, orders: o }) => ({
          id: o.id, number: o.number, created_at: o.created_at, status: o.status, email: o.email, total: o.total, amount,
          source: o.source, customer_id: o.customer_id,
          name: [o.customers?.first_name, o.customers?.last_name].filter(Boolean).join(' ') || o.shipping_address?.name || '',
        })),
      });
    }
    const [rows, products] = await Promise.all([
      sb.select<any>('promotions?select=*&order=sort_order.asc,created_at.asc'),
      sb.select<{ id: string; name: string; price: number | null; active: boolean }>('products?select=id,name,price,active&order=sort_order.asc'),
    ]);
    // Skuteczność: opłacone zamówienia z promocją
    const used = await sb.select<any>(
      `order_promotions?select=promotion_id,amount,orders!inner(total,status,created_at,customer_id,email)&orders.status=in.(${PAID})&limit=10000`,
    );
    type S = { orders: number; revenue: number; discount: number; customers: Set<string>; last: string | null };
    const stats: Record<string, S> = {};
    for (const u of used) {
      if (!u.promotion_id || !u.orders) continue;
      const s = (stats[u.promotion_id] ??= { orders: 0, revenue: 0, discount: 0, customers: new Set(), last: null });
      s.orders++; s.revenue += u.orders.total; s.discount += u.amount;
      s.customers.add(u.orders.customer_id || u.orders.email);
      if (!s.last || u.orders.created_at > s.last) s.last = u.orders.created_at;
    }
    const out = (id: string) => {
      const s = stats[id];
      return s ? { orders: s.orders, revenue: s.revenue, discount: s.discount, customers: s.customers.size, last: s.last } : { orders: 0, revenue: 0, discount: 0, customers: 0, last: null };
    };
    return json(200, { rows: rows.map((r) => ({ ...r, stats: out(r.id) })), products });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Admin promocje: ' + msg);
    if (/promotions/.test(msg) && /exist|relation|schema cache/i.test(msg)) return json(500, { error: 'Brak tabeli promocji. Uruchom skrypt supabase/019_promocje.sql.' });
    return json(500, { error: 'Błąd pobierania promocji.' });
  }
};

const money = (x: unknown) => Math.round(Number(String(x ?? '').replace(/\s/g, '').replace(',', '.')) * 100);

// Pola z formularza → wiersz tabeli promotions albo komunikat błędu
async function parse(sb: Sb, b: any): Promise<{ row: Record<string, unknown> } | { error: string }> {
  const name = String(b.name ?? '').trim().slice(0, 100);
  const label = String(b.label ?? '').trim().slice(0, 60) || null;
  const kind = b.kind === 'bundle' ? 'bundle' : 'quantity';
  if (name.length < 3) return { error: 'Podaj nazwę promocji (min. 3 znaki).' };
  const toIso = (d: unknown) => (typeof d === 'string' && d ? new Date(d).toISOString() : null);
  let starts_at: string | null, ends_at: string | null;
  try { starts_at = toIso(b.starts_at); ends_at = toIso(b.ends_at); } catch { return { error: 'Nieprawidłowa data.' }; }
  if (starts_at && ends_at && starts_at > ends_at) return { error: 'Data końca jest wcześniejsza niż początku.' };

  const known = new Set((await sb.select<{ id: string }>('products?select=id')).map((p) => p.id));
  const row: Record<string, unknown> = {
    name, label, kind, starts_at, ends_at,
    with_codes: b.with_codes !== false,
    sort_order: Math.max(0, Math.min(9999, Math.round(Number(b.sort_order) || 0))),
    description: String(b.description ?? '').trim().slice(0, 300) || null,
    product_ids: [], combined: false, tiers: [], items: [], type: 'percent', value: 0, max_sets: null,
  };

  if (kind === 'quantity') {
    const ids = [...new Set((Array.isArray(b.product_ids) ? b.product_ids : []).map(String))].filter((id) => known.has(id as string));
    if (!ids.length) return { error: 'Wybierz co najmniej jeden produkt.' };
    const tiers: { min: number; type: string; value: number }[] = [];
    for (const t of Array.isArray(b.tiers) ? b.tiers.slice(0, 6) : []) {
      if (t?.min === '' && t?.value === '') continue;
      const min = Math.round(Number(t?.min));
      const type = t?.type === 'amount' ? 'amount' : 'percent';
      const value = type === 'percent' ? Math.round(Number(String(t?.value ?? '').replace(',', '.'))) : money(t?.value);
      if (!Number.isInteger(min) || min < 2 || min > 100) return { error: 'Próg: liczba sztuk od 2 do 100.' };
      if (!Number.isFinite(value) || value <= 0 || (type === 'percent' && value > 90)) return { error: `Nieprawidłowy rabat dla progu ${min} szt. (procent 1–90 albo kwota w zł).` };
      if (tiers.some((x) => x.min === min)) return { error: `Próg ${min} szt. występuje dwa razy.` };
      tiers.push({ min, type, value });
    }
    if (!tiers.length) return { error: 'Dodaj co najmniej jeden próg rabatu.' };
    tiers.sort((a, b2) => a.min - b2.min);
    Object.assign(row, { product_ids: ids, combined: b.combined === true, tiers });
  } else {
    const items: { product_id: string; qty: number }[] = [];
    for (const it of Array.isArray(b.items) ? b.items.slice(0, 8) : []) {
      const id = String(it?.product_id ?? '');
      if (!id) continue;
      if (!known.has(id)) return { error: 'Zestaw zawiera nieznany produkt.' };
      const qty = Math.round(Number(it?.qty) || 1);
      if (qty < 1 || qty > 20) return { error: 'Liczba sztuk w zestawie: od 1 do 20.' };
      const same = items.find((x) => x.product_id === id);
      if (same) same.qty += qty; else items.push({ product_id: id, qty });
    }
    if (items.length < 2) return { error: 'Zestaw musi zawierać co najmniej dwa różne produkty. Rabat na kilka sztuk jednego produktu ustaw jako rabat ilościowy.' };
    const type = b.type === 'amount' ? 'amount' : 'percent';
    const value = type === 'percent' ? Math.round(Number(String(b.value ?? '').replace(',', '.'))) : money(b.value);
    if (!Number.isFinite(value) || value <= 0 || (type === 'percent' && value > 90)) return { error: 'Nieprawidłowy rabat zestawu (procent 1–90 albo kwota w zł).' };
    const max_sets = b.max_sets === '' || b.max_sets === null || b.max_sets === undefined ? null : Math.round(Number(b.max_sets));
    if (max_sets !== null && (!Number.isInteger(max_sets) || max_sets < 1 || max_sets > 100)) return { error: 'Limit zestawów w zamówieniu: od 1 do 100 albo puste.' };
    Object.assign(row, { items, type, value, max_sets });
  }
  return { row };
}

// { action: 'create' | 'update', id?, ...pola } · { action: 'toggle', id, active } · { action: 'delete', id }
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  const sb = db(env);
  const now = new Date().toISOString();
  try {
    if (b.action === 'toggle') {
      if (!UUID.test(b.id || '')) return json(400, { error: 'Nieprawidłowa promocja.' });
      const [row] = await sb.update(`promotions?id=eq.${b.id}`, { active: b.active === true, updated_at: now, updated_by: admin }, 'id,active');
      clearPromotionsCache();
      return row ? json(200, { row }) : json(404, { error: 'Nie znaleziono.' });
    }
    if (b.action === 'delete') {
      if (!UUID.test(b.id || '')) return json(400, { error: 'Nieprawidłowa promocja.' });
      const used = await sb.select(`order_promotions?select=id&promotion_id=eq.${b.id}&limit=1`);
      if (used.length) return json(409, { error: 'Promocja była już naliczona w zamówieniach – wyłącz ją zamiast usuwać, żeby zachować statystyki.' });
      await sb.remove(`promotions?id=eq.${b.id}`);
      clearPromotionsCache();
      console.log(`Admin ${admin} usunął promocję ${b.id}`);
      return json(200, { ok: true });
    }
    if (b.action !== 'create' && b.action !== 'update') return json(400, { error: 'Nieznana akcja.' });
    const parsed = await parse(sb, b);
    if ('error' in parsed) return json(422, { error: parsed.error });
    if (b.action === 'update') {
      if (!UUID.test(b.id || '')) return json(400, { error: 'Nieprawidłowa promocja.' });
      const [cur] = await sb.select<any>(`promotions?select=id,kind&id=eq.${b.id}`);
      if (!cur) return json(404, { error: 'Nie znaleziono promocji.' });
      if (cur.kind !== parsed.row.kind) return json(422, { error: 'Nie można zmienić rodzaju promocji. Utwórz nową.' });
      const [row] = await sb.update(`promotions?id=eq.${b.id}`, { ...parsed.row, updated_at: now, updated_by: admin }, 'id,name');
      clearPromotionsCache();
      console.log(`Admin ${admin} zmienił promocję ${row?.name}`);
      return json(200, { row });
    }
    const [row] = await sb.insert('promotions', { ...parsed.row, active: b.active !== false, created_by: admin, updated_by: admin }, 'id,name');
    clearPromotionsCache();
    console.log(`Admin ${admin} utworzył promocję ${parsed.row.name}`);
    return json(200, { row });
  } catch (e) {
    console.error('Admin promocje zapis: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd zapisu promocji.' });
  }
};
