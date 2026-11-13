import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';

export const prerender = false;

// Pulpit „Do zrobienia”: wszystko, co czeka na Twoją reakcję, w jednym zapytaniu
export const GET: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  const sb = db(env);
  const safe = <T,>(p: Promise<T>, fb: T) => p.catch(() => fb);
  const SHOP = 'source=in.(shop,admin)';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const since = today.toISOString();
  try {
    const [toShip, packing, onHold, bank, mail, reviews, products, errors, sending, todayOrders] = await Promise.all([
      safe(sb.select<any>(`orders?select=id,number,email,total,paid_at,created_at&status=eq.paid&${SHOP}&order=paid_at.asc.nullslast&limit=200`), []),
      safe(sb.select<any>(`orders?select=id&status=eq.packing&${SHOP}&limit=500`), []),
      safe(sb.select<any>(`orders?select=id,number&status=eq.on_hold&${SHOP}&limit=200`), []),
      safe(sb.select<any>(`orders?select=id,number,email,total,created_at&status=eq.pending_payment&payment_provider=eq.bank_transfer&order=created_at.asc&limit=50`), []),
      safe(sb.select<any>('mail_threads?select=id,subject,contact_name,contact_email,last_message_at&category=eq.customer&status=eq.open&unread=gt.0&order=last_message_at.asc&limit=50'), []),
      safe(sb.select<any>('reviews?select=id,author_name,rating,product_id,created_at&status=eq.pending&order=created_at.asc&limit=100'), []),
      safe(sb.select<any>('products?select=id,name,stock,low_stock_alert,availability&active=is.true&order=stock.asc'), []),
      safe(sb.select<any>('error_log?select=id,area,critical&resolved_at=is.null&limit=200'), []),
      safe(sb.select<any>('newsletter_campaigns?select=id,name,sent_count,recipients&status=eq.sending'), []),
      safe(sb.select<any>(`orders?select=total,status&created_at=gte.${encodeURIComponent(since)}&${SHOP}&status=in.(paid,packing,shipped,completed)`), []),
    ]);
    const lowStock = products.filter((p: any) => p.availability !== 'out_of_stock' && p.stock !== null && p.stock <= (p.low_stock_alert ?? 5));
    const days = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : 0);
    return json(200, {
      toShip: { count: toShip.length, oldestDays: toShip[0] ? days(toShip[0].paid_at || toShip[0].created_at) : 0, list: toShip.slice(0, 5).map((o: any) => ({ id: o.id, number: o.number, email: o.email, total: o.total, days: days(o.paid_at || o.created_at) })) },
      packing: packing.length,
      onHold: onHold.length,
      bank: { count: bank.length, list: bank.slice(0, 5).map((o: any) => ({ id: o.id, number: o.number, email: o.email, total: o.total, days: days(o.created_at) })) },
      mail: { count: mail.length, list: mail.slice(0, 5).map((t: any) => ({ id: t.id, subject: t.subject, who: t.contact_name || t.contact_email, days: days(t.last_message_at) })) },
      reviews: { count: reviews.length, oldestDays: reviews[0] ? days(reviews[0].created_at) : 0 },
      lowStock: lowStock.map((p: any) => ({ id: p.id, name: p.name, stock: p.stock, alert: p.low_stock_alert ?? 5 })),
      errors: { count: errors.length, critical: errors.filter((e: any) => e.critical).length },
      sending: sending.map((c: any) => ({ id: c.id, name: c.name, sent: c.sent_count, recipients: c.recipients })),
      today: { orders: todayOrders.length, revenue: todayOrders.reduce((s: number, o: any) => s + (o.total || 0), 0) },
    });
  } catch (e) {
    console.error('Admin pulpit: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Nie udało się wczytać pulpitu.' });
  }
};
