import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';

export const prerender = false;

const PAGE = 50;
const SORTS: Record<string, string> = {
  last_active: 'last_active_at.desc.nullslast',
  created: 'created_at.desc',
  orders: 'orders_count.desc',
  spent: 'total_spent.desc',
  name: 'full_name.asc.nullslast',
};
const COLS = 'id,full_name,email,phone,created_at,last_active_at,last_order_at,orders_count,total_spent,country,city,postcode,has_account,marketing_consent,source';

// Lista klientów: ?q=&sort=last_active&page=1  |  eksport: &format=csv  |  szczegóły: ?id=uuid
export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  const sb = db(env);

  try {
    const id = url.searchParams.get('id');
    if (id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: 'Nieprawidłowy identyfikator.' });
      const [c] = await sb.select(`customer_stats?select=${COLS}&id=eq.${id}`);
      if (!c) return json(404, { error: 'Nie znaleziono klienta.' });
      const [extra] = await sb.select(`customers?select=default_address,default_locker,billing,consent_at,consent_source&id=eq.${id}`);
      const orders = await sb.select(`orders?select=id,number,created_at,status,total,discount_code,source,order_items(name,qty)&customer_id=eq.${id}&order=created_at.desc&limit=100`);
      return json(200, { customer: { ...c, ...extra }, orders });
    }

    // Wyszukiwanie po imieniu i nazwisku, e-mailu, telefonie, miejscowości
    const q = (url.searchParams.get('q') || '').trim().slice(0, 80).replace(/[*,()"\\]/g, ' ').replace(/\s+/g, ' ');
    const filters: string[] = [];
    if (q) {
      const like = encodeURIComponent(`*${q}*`);
      const digits = q.replace(/\D/g, '');
      const ors = [`full_name.ilike.${like}`, `email.ilike.${like}`, `city.ilike.${like}`];
      if (digits.length >= 3) ors.push(`phone.ilike.${encodeURIComponent(`*${digits.slice(-9)}*`)}`);
      filters.push(`or=(${ors.join(',')})`);
    }
    if (url.searchParams.get('buyers') === '1') filters.push('orders_count=gt.0');
    const order = SORTS[url.searchParams.get('sort') || ''] || SORTS.last_active;
    const f = filters.length ? `&${filters.join('&')}` : '';

    if (url.searchParams.get('format') === 'csv') {
      const rows = await sb.select<any>(`customer_stats?select=${COLS}${f}&order=${order}&limit=5000`);
      const head = ['Imię i nazwisko', 'E-mail', 'Telefon', 'Ostatnio aktywny', 'Data rejestracji', 'Zamówienia', 'Suma wydatków', 'Średnia wartość', 'Kraj', 'Miejscowość', 'Kod pocztowy', 'Konto', 'Zgoda marketingowa'];
      const cell = (v: unknown) => { const t = String(v ?? ''); return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
      const zl = (g: number) => (g / 100).toFixed(2).replace('.', ',');
      const d = (s: string | null) => (s ? new Date(s).toLocaleDateString('pl-PL') : '');
      const lines = rows.map((r) => [r.full_name, r.email, r.phone, d(r.last_active_at), d(r.created_at), r.orders_count, zl(r.total_spent), r.orders_count ? zl(Math.round(r.total_spent / r.orders_count)) : '0,00', r.country, r.city, r.postcode, r.has_account ? 'tak' : 'nie', r.marketing_consent ? 'tak' : 'nie'].map(cell).join(';'));
      console.log(`Admin ${admin} wyeksportował ${rows.length} klientów`);
      return new Response('\uFEFF' + [head.join(';'), ...lines].join('\r\n'), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="klienci-can-c-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' },
      });
    }

    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const { rows, total } = await sb.selectCount(`customer_stats?select=${COLS}${f}&order=${order}&limit=${PAGE}&offset=${(page - 1) * PAGE}`);
    return json(200, { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE)) });
  } catch (e) {
    console.error('Admin klienci: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd pobierania klientów. Czy uruchomiono skrypt 007_klienci.sql?' });
  }
};
