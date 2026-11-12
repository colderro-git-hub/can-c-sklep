import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';

export const prerender = false;

const STATUSES = ['pending_payment', 'paid', 'packing', 'on_hold', 'shipped', 'completed', 'cancelled', 'refunded', 'failed'];
const PAGE = 50;

// Lista zamówień: ?status=paid&q=18772|email&page=1
export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });

  const status = url.searchParams.get('status') || '';
  const q = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);

  const filters: string[] = [];
  if (STATUSES.includes(status)) filters.push(`status=eq.${status}`);
  if (/^\d+$/.test(q)) filters.push(`number=eq.${q}`);
  else if (q) filters.push(`email=ilike.*${encodeURIComponent(q.toLowerCase().replace(/[*,()]/g, ''))}*`);

  try {
    const sb = db(env);
    const { rows, total } = await sb.selectCount(
      `orders?select=id,number,created_at,email,status,total,shipping_method,shipping_point,tracking_number,carrier,source,shipping_address,order_items(name,qty)` +
        (filters.length ? `&${filters.join('&')}` : '') +
        `&order=created_at.desc&limit=${PAGE}&offset=${(page - 1) * PAGE}`,
    );
    // Liczniki do zakładek (tylko statusy wymagające działania)
    const counts: Record<string, number> = {};
    for (const s of ['paid', 'packing', 'on_hold', 'pending_payment', 'shipped']) {
      counts[s] = (await sb.selectCount(`orders?select=id&status=eq.${s}&limit=1`)).total;
    }
    // Sprzedaż: ostatnie 30 dni i dzisiaj (opłacone, wysłane, zrealizowane)
    const day = 24 * 60 * 60 * 1000;
    const since30 = new Date(Date.now() - 30 * day).toISOString();
    const paidRows = await sb.select<{ total: number; paid_at: string }>(
      `orders?select=total,paid_at&status=in.(paid,packing,shipped,completed)&paid_at=gte.${encodeURIComponent(since30)}&limit=5000`,
    );
    const todayStart = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Warsaw' }));
    todayStart.setHours(0, 0, 0, 0);
    const offset = Date.now() - new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Warsaw' })).getTime();
    const todayUtc = todayStart.getTime() + offset;
    const sum = (rs: { total: number }[]) => rs.reduce((a, r) => a + r.total, 0);
    const today = paidRows.filter((r) => new Date(r.paid_at).getTime() >= todayUtc);
    const stats = {
      revenue30: sum(paidRows), orders30: paidRows.length,
      avg30: paidRows.length ? Math.round(sum(paidRows) / paidRows.length) : 0,
      revenueToday: sum(today), ordersToday: today.length,
    };
    return json(200, { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE)), counts, stats });
  } catch (e) {
    console.error('Admin orders: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd pobierania zamówień.' });
  }
};
