import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { requireAdmin } from '../../../lib/admin-auth';
import { db } from '../../../lib/supabase';
import { getGA4Stats } from '../../../lib/ga4';

export const prerender = false;

export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });

  const range = url.searchParams.get('range') || '30';
  const days = Math.min(365, Math.max(1, Number(range) || 30));
  const from = new Date(Date.now() - days * 864e5).toISOString();
  const sb = db(env);

  // GA4 (opcjonalne)
  let ga4: any = null;
  if (env.GA4_PRIVATE_KEY && env.GA4_CLIENT_EMAIL && env.GA4_PROPERTY_ID) {
    ga4 = await getGA4Stats(env, days).catch((e) => {
      console.error('GA4 stats: ' + (e instanceof Error ? e.message : String(e)));
      return null;
    });
  }

  try {
    const [orders, codes] = await Promise.all([
      sb.select<any>(`orders?select=id,number,status,total,subtotal,discount,shipping_cost,discount_code,discount_code_amount,shipping_method,payment_provider,source,created_at,paid_at,shipped_at,customer_id,email&created_at=gte.${from}&order=created_at.asc`),
      sb.select<any>(`discount_codes?select=id,code,type,value,used_count,description,active`),
    ]);

    const paid = ['paid', 'shipped', 'completed', 'on_hold'];
    const allShop = orders.filter((o: any) => o.source !== 'woocommerce');
    const paidOrders = allShop.filter((o: any) => paid.includes(o.status));

    // Pobierz order_items dla opłaconych zamówień
    const paidIds = paidOrders.map((o: any) => o.id);
    let items: any[] = [];
    if (paidIds.length > 0) {
      const chunk = paidIds.slice(0, 500).join(',');
      items = await sb.select<any>(`order_items?select=product_id,name,qty,unit_price,discount,total,order_id&order_id=in.(${chunk})`);
    }

    // ---- Lejek zamówień ----
    const funnel = {
      placed: allShop.length,
      paid: paidOrders.length,
      shipped: allShop.filter((o: any) => ['shipped', 'completed'].includes(o.status)).length,
      completed: allShop.filter((o: any) => o.status === 'completed').length,
      cancelled: allShop.filter((o: any) => o.status === 'cancelled').length,
      pending: allShop.filter((o: any) => o.status === 'pending_payment').length,
    };

    // ---- KPI ----
    const revenue = paidOrders.reduce((s: number, o: any) => s + o.total, 0);
    const avgOrder = paidOrders.length ? Math.round(revenue / paidOrders.length) : 0;
    const convRate = allShop.length ? Math.round((paidOrders.length / allShop.length) * 1000) / 10 : 0;

    const payTimes = paidOrders
      .filter((o: any) => o.paid_at && o.created_at)
      .map((o: any) => (new Date(o.paid_at).getTime() - new Date(o.created_at).getTime()) / 60000);
    const avgPayMin = payTimes.length ? Math.round(payTimes.reduce((a: number, b: number) => a + b, 0) / payTimes.length) : null;

    // ---- Przychód dzienny ----
    const dailyMap: Record<string, number> = {};
    const orderDayMap: Record<string, number> = {};
    paidOrders.forEach((o: any) => {
      const day = o.created_at.slice(0, 10);
      dailyMap[day] = (dailyMap[day] || 0) + o.total;
      orderDayMap[day] = (orderDayMap[day] || 0) + 1;
    });
    const daily: { date: string; revenue: number; orders: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      daily.push({ date: d, revenue: dailyMap[d] || 0, orders: orderDayMap[d] || 0 });
    }

    // ---- Top produkty ----
    const prodMap: Record<string, { name: string; qty: number; revenue: number; orders: number }> = {};
    items.forEach((i: any) => {
      if (!prodMap[i.product_id]) prodMap[i.product_id] = { name: i.name, qty: 0, revenue: 0, orders: 0 };
      prodMap[i.product_id].qty += i.qty;
      prodMap[i.product_id].revenue += i.total;
      prodMap[i.product_id].orders += 1;
    });
    const topProducts = Object.entries(prodMap)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // ---- Metody dostawy i płatności ----
    const byShipping: Record<string, number> = {};
    const byPayment: Record<string, number> = {};
    paidOrders.forEach((o: any) => {
      const s = o.shipping_method || 'inne';
      byShipping[s] = (byShipping[s] || 0) + 1;
      const p = o.payment_provider === 'bank_transfer' ? 'Przelew bankowy' : 'Przelewy24';
      byPayment[p] = (byPayment[p] || 0) + 1;
    });

    // ---- Klienci ----
    const allByCustomer: Record<string, string[]> = {};
    orders.forEach((o: any) => {
      if (!o.customer_id || o.source === 'woocommerce') return;
      if (!allByCustomer[o.customer_id]) allByCustomer[o.customer_id] = [];
      allByCustomer[o.customer_id].push(o.created_at);
    });
    let newCustomers = 0, returning = 0, guests = 0;
    paidOrders.forEach((o: any) => {
      if (!o.customer_id) { guests++; return; }
      const all = (allByCustomer[o.customer_id] || []).sort();
      if (all[0] >= from) newCustomers++; else returning++;
    });

    // ---- Kody rabatowe ----
    const codeUsage: Record<string, { used: number; revenue: number; discount: number }> = {};
    paidOrders.filter((o: any) => o.discount_code).forEach((o: any) => {
      const c = o.discount_code;
      if (!codeUsage[c]) codeUsage[c] = { used: 0, revenue: 0, discount: 0 };
      codeUsage[c].used++;
      codeUsage[c].revenue += o.total;
      codeUsage[c].discount += o.discount_code_amount || 0;
    });
    const topCodes = Object.entries(codeUsage)
      .map(([code, v]) => ({ code, ...v }))
      .sort((a, b) => b.used - a.used)
      .slice(0, 10);

    // ---- Poprzedni okres ----
    const prevFrom = new Date(Date.now() - 2 * days * 864e5).toISOString();
    const prevOrders = await sb.select<any>(`orders?select=total,status,source&created_at=gte.${prevFrom}&created_at=lt.${from}`);
    const prevPaid = prevOrders.filter((o: any) => paid.includes(o.status) && o.source !== 'woocommerce');
    const prevRevenue = prevPaid.reduce((s: number, o: any) => s + o.total, 0);

    return json(200, {
      range: days, from, ga4,
      kpi: { revenue, orders: paidOrders.length, avgOrder, convRate, avgPayMin, newCustomers, returning, guests },
      prev: { revenue: prevRevenue, orders: prevPaid.length },
      funnel, daily, topProducts, byShipping, byPayment, topCodes,
    });
  } catch (e) {
    console.error('analytics GET: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd pobierania danych.' });
  }
};
