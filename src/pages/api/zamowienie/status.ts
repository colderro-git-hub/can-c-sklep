import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { getCatalog, leadTimeText } from '../../../lib/catalog';
import { getSite } from '../../../lib/site-settings';
import { p24Config, paymentMethodName } from '../../../lib/p24';

export const prerender = false;

// Pełne podsumowanie pokazujemy tylko przez tyle dni od złożenia zamówienia.
// Identyfikator to losowy UUID (122 bity), ale adres strony zostaje w historii przeglądarki.
const DETAILS_DAYS = 7;
const PAID = ['paid', 'shipped', 'completed'];
const CLOSED = ['cancelled', 'failed', 'refunded'];

type Order = {
  id: string; number: number; status: string; total: number; subtotal: number; discount: number; shipping_cost: number;
  discount_code: string | null; discount_code_amount: number; created_at: string; paid_at: string | null; email: string;
  shipping_method: string; shipping_point: string | null; shipping_address: Record<string, string> | null;
  billing: Record<string, string> | null; wants_invoice: boolean; customer_note: string | null; payment_provider: string | null;
};

// Status i podsumowanie zamówienia dla strony „Dziękujemy”
export const GET: APIRoute = async ({ url, locals }) => {
  const id = url.searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: 'Nieprawidłowy identyfikator.' });
  const env = await getEnv(locals);
  try {
    const sb = db(env);
    const [o] = await sb.select<Order>(
      `orders?select=id,number,status,total,subtotal,discount,shipping_cost,discount_code,discount_code_amount,created_at,paid_at,email,shipping_method,shipping_point,shipping_address,billing,wants_invoice,customer_note,payment_provider&id=eq.${id}`,
    );
    if (!o) return json(404, { error: 'Nie znaleziono zamówienia.' });
    const base = { number: o.number, status: o.status, total: o.total };
    const fresh = Date.now() - new Date(o.created_at).getTime() < DETAILS_DAYS * 864e5;
    if (!fresh || CLOSED.includes(o.status)) return json(200, { ...base, details: null });

    const [items, catalog, site] = await Promise.all([
      sb.select<{ product_id: string; name: string; qty: number; unit_price: number; discount: number; total: number }>(
        `order_items?select=product_id,name,qty,unit_price,discount,total&order_id=eq.${id}`,
      ),
      getCatalog(env).catch(() => []),
      getSite(env),
    ]);

    // Termin wysyłki: jeden dla całego zamówienia albo przy każdym produkcie, gdy się różnią
    const lines = items.map((i) => {
      const p = catalog.find((c) => c.id === i.product_id);
      return {
        slug: i.product_id, name: i.name, qty: i.qty, unitPrice: i.unit_price, discount: i.discount, total: i.total,
        image: p?.images[0]?.url || null, leadTime: leadTimeText(p?.lead_time, site.shippingTime),
      };
    });
    const leadTimes = [...new Set(lines.map((l) => l.leadTime))];

    // Metoda płatności: identyfikator z powiadomienia P24 → nazwa z API P24
    const provider = o.payment_provider || 'przelewy24';
    let method: string | null = null;
    if (PAID.includes(o.status) && provider === 'przelewy24') {
      try {
        const events = await sb.select<{ data: { methodId?: number } }>(
          `order_events?select=data&order_id=eq.${id}&type=in.(p24_verified,p24_notification)&order=created_at.desc&limit=5`,
        );
        const methodId = events.map((e) => Number(e.data?.methodId)).find((n) => n > 0);
        if (methodId) method = await paymentMethodName(p24Config(env), methodId);
      } catch (e) {
        console.error('Status zamówienia – metoda płatności: ' + (e instanceof Error ? e.message : String(e)));
      }
    }

    const a = o.shipping_address || {};
    const details = {
      createdAt: o.created_at,
      paidAt: o.paid_at,
      email: o.email,
      items: lines,
      subtotal: o.subtotal,
      bundleDiscount: Math.max(0, o.discount - (o.discount_code_amount || 0)),
      code: o.discount_code,
      codeAmount: o.discount_code_amount || 0,
      shipping: o.shipping_cost,
      delivery: {
        method: o.shipping_method,
        point: o.shipping_point,
        pointName: a.point_name || null,
        name: a.name || null,
        phone: a.phone || null,
        street: a.street || null,
        postcode: a.postcode || null,
        city: a.city || null,
      },
      invoice: o.wants_invoice && o.billing
        ? { company: o.billing.company || '', nip: o.billing.nip || '', street: o.billing.street || '', postcode: o.billing.postcode || '', city: o.billing.city || '' }
        : null,
      note: o.customer_note,
      payment: {
        provider: provider === 'przelewy24' ? 'Przelewy24'
          : provider.startsWith('ręcznie') ? `Płatność przyjęta przez sklep${provider.slice(8).trim() ? ` (${provider.replace(/^ręcznie:?\s*/, '')})` : ''}`
          : provider,
        method,
      },
      shippingTime: leadTimes.length === 1 ? leadTimes[0] : null,
      notice: site.noticeActive ? site.noticeText : null,
      contact: { email: site.email, phone: site.phone || null },
    };
    return json(200, { ...base, details });
  } catch (e) {
    console.error('Status zamówienia: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd serwera.' });
  }
};
