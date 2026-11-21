// Integracja z ifirma.pl - „własna integracja sklepu” (API zamówień): wysłane zamówienia trafiają do ifirma,
// a faktury wystawiasz tam jak dotąd z WooCommerce. Dokumentacja: https://api.ifirma.pl/dodawanie-zamowienia/
// Zasada: do ifirma trafiają WSZYSTKIE zamówienia ze sklepu (i panelu) ze statusem i stanem płatności ze sklepu;
// każda zmiana statusu aktualizuje zamówienie w ifirma. O wystawieniu faktury decydujesz w ifirma.
import type { Env } from './env';
import type { db as dbFn } from './supabase';
import { PRODUCT_VAT_RATE } from '../config';

type Sb = ReturnType<typeof dbFn>;
const URL_ORDERS = 'https://www.ifirma.pl/hub/user/platform/CUSTOM/V1/orders/order';

export const ifirmaEnabled = (env: Env) => Boolean(env.IFIRMA_ORDERS_TOKEN);

export const IFIRMA_STATUS: Record<string, string> = {
  pending_payment: 'Oczekuje na płatność', paid: 'Opłacone', packing: 'Kompletowanie', on_hold: 'Wstrzymane',
  shipped: 'Wysłane', completed: 'Zrealizowane', cancelled: 'Anulowane', refunded: 'Anulowane', failed: 'Anulowane',
};
const STATUS = IFIRMA_STATUS;

// Data w formacie ifirma (yyyy-MM-ddTHH:mm:ss.SSS), czas polski
function ifDate(iso: string | null | undefined) {
  if (!iso) return undefined;
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.000`;
}
const r2 = (n: number) => Math.round(n * 100) / 100;
const cut = (s: unknown, n: number) => String(s ?? '').slice(0, n);
const splitName = (full: string) => { const parts = String(full || '').trim().split(/\s+/); return { firstName: parts.shift() || '', lastName: parts.join(' ') }; };

// Zamówienie z bazy → JSON dla ifirma. Ceny w sklepie są brutto (grosze) - wyliczamy netto i VAT wg stawki produktu.
// Rabat z kodu rozkładamy proporcjonalnie na pozycje, żeby suma pozycji = kwota zapłacona za produkty.
export async function buildIfirmaOrder(sb: Sb, orderId: string) {
  const [o] = await sb.select<any>(`orders?select=*,customers(id,first_name,last_name,phone)&id=eq.${orderId}`);
  if (!o) throw new Error('Nie znaleziono zamówienia');
  const items = await sb.select<any>(`order_items?select=product_id,name,qty,unit_price,discount,total&order_id=eq.${orderId}`);
  const ids = [...new Set(items.map((i: any) => i.product_id).filter(Boolean))];
  const prods = ids.length ? await sb.select<any>(`products?select=id,vat_rate,ean&id=in.(${ids.map((x) => `"${x}"`).join(',')})`) : [];
  const vatOf = (pid: string | null) => Number(prods.find((p: any) => p.id === pid)?.vat_rate ?? PRODUCT_VAT_RATE);

  const itemsGross = items.reduce((s: number, i: any) => s + i.total, 0);
  const codeDiscount = Math.min(o.discount_code_amount || 0, itemsGross);
  let left = codeDiscount;
  const lines = items.map((i: any, idx: number) => {
    const share = idx === items.length - 1 ? left : Math.round((codeDiscount * i.total) / (itemsGross || 1));
    left -= share;
    const gross = (i.total - share) / 100; // zapłacone za pozycję (brutto)
    const rate = vatOf(i.product_id) / 100;
    const net = r2(gross / (1 + rate));
    const unitNet = r2(i.unit_price / 100 / (1 + rate));
    return {
      id: cut(i.product_id || `poz-${idx + 1}`, 200),
      name: cut(i.name, 300),
      quantity: i.qty,
      price: unitNet,
      priceAfterDiscount: r2(net / i.qty),
      totalPrice: net,
      totalTax: r2(gross - net),
      unit: 'szt.',
      sku: cut(prods.find((p: any) => p.id === i.product_id)?.ean || i.product_id || '', 30) || undefined,
      type: 'ITEM',
    };
  });

  const a = o.shipping_address || {};
  const b = o.billing || {};
  const name = splitName(a.name || [o.customers?.first_name, o.customers?.last_name].filter(Boolean).join(' '));
  const shipping = {
    firstName: cut(name.firstName, 500), lastName: cut(name.lastName, 500),
    address1: cut(a.street, 65), city: cut(a.city, 65), postcode: cut(a.postcode, 16), country: 'PL',
    email: cut(o.email, 500), phone: cut(a.phone || o.customers?.phone, 32),
  };
  const billing = o.wants_invoice && (b.company || b.nip)
    ? { company: cut(b.company, 500), nip: cut(String(b.nip || '').replace(/\D/g, ''), 40), address1: cut(b.street, 65), city: cut(b.city, 65), postcode: cut(b.postcode, 16), country: 'PL', email: cut(o.email, 65), phone: shipping.phone, firstName: shipping.firstName, lastName: shipping.lastName }
    : { ...shipping, email: cut(o.email, 65) };

  const payload: Record<string, unknown> = {
    id: String(o.number),
    customId: o.id,
    status: STATUS[o.status] || o.status,
    created: ifDate(o.created_at),
    modified: ifDate(o.updated_at || new Date().toISOString()),
    currency: 'PLN',
    shippingTotal: r2((o.shipping_cost || 0) / 100),
    productsTotalNet: r2(lines.reduce((s: number, l: any) => s + l.totalPrice, 0)),
    productsTotalTax: r2(lines.reduce((s: number, l: any) => s + l.totalTax, 0)),
    paymentMethod: o.payment_provider === 'bank_transfer' ? 'Przelew tradycyjny' : o.payment_provider === 'przelewy24' ? 'Przelewy24' : cut(o.payment_provider || 'Inna', 100),
    ...(o.p24_order_id ? { transactionId: String(o.p24_order_id) } : {}),
    paid: Boolean(o.paid_at),
    ...(o.status === 'completed' ? { completed: ifDate(o.updated_at) } : {}),
    ...(o.customer_note ? { message: cut(o.customer_note, 2000) } : {}),
    deliveryType: o.shipping_method === 'inpost_locker' ? 'InPost Paczkomat' : 'Kurier DPD',
    invoiceRequired: Boolean(o.wants_invoice),
    ...(o.tracking_number ? { trackingList: [{ number: cut(o.tracking_number, 50) }] } : {}),
    items: lines,
    billing,
    shipping,
    ...(o.shipping_method === 'inpost_locker' && o.shipping_point ? {
      pickupPoint: { method: 'InPost', externalId: cut(o.shipping_point, 50), name: cut(`Paczkomat ${o.shipping_point}`, 200), description: cut(a.point_name || '', 200), countryCode: 'PL' },
    } : {}),
  };
  return { order: o, payload };
}

// Wysłanie / aktualizacja w ifirma. POST przy pierwszym razie, później PUT (identyfikacja po numerze zamówienia).
export async function pushToIfirma(env: Env, sb: Sb, orderId: string, opts: { by?: string; force?: boolean } = {}) {
  if (!ifirmaEnabled(env)) return { ok: false, skipped: 'Brak IFIRMA_ORDERS_TOKEN' };
  const { order, payload } = await buildIfirmaOrder(sb, orderId);
  if (order.source === 'woocommerce') return { ok: false, skipped: 'Zamówienie z WooCommerce - idzie do ifirma starą integracją' };
  const sent = await sb.select<any>(`order_events?select=id&order_id=eq.${orderId}&type=eq.ifirma_sent&limit=1`);
  const already = sent.length > 0;

  const res = await fetch(URL_ORDERS, {
    method: already ? 'PUT' : 'POST',
    // ifirma wymaga nagłówka User-Agent z nazwą integracji (firma / adres sklepu) - bez niego odpowiada 401
    headers: { Authorization: `Bearer ${env.IFIRMA_ORDERS_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', 'User-Agent': 'Can-C sklep can-c.pl (Colderro)' },
    body: JSON.stringify(payload),
  });
  const text = (await res.text()).slice(0, 1000);
  if (!res.ok) {
    const error = `HTTP ${res.status}: ${text}`.slice(0, 900);
    await sb.insert('order_events', { order_id: orderId, type: 'ifirma_error', data: { error, method: already ? 'PUT' : 'POST', by: opts.by ?? null } }, 'id').catch(() => {});
    console.error(`ifirma: zamówienie ${order.number} - ${error}`);
    return { ok: false, error };
  }
  await sb.insert('order_events', { order_id: orderId, type: already ? 'ifirma_updated' : 'ifirma_sent', data: { status: payload.status, by: opts.by ?? null, response: text.slice(0, 300) } }, 'id').catch(() => {});
  return { ok: true, updated: already };
}

// Synchronizacja: zamówienia z ostatnich dni, których nie ma w ifirma albo mają tam inny status
// (np. automatyczne anulowanie nieopłaconych po 24 h i „zrealizowane” po 14 dniach robi baza, bez udziału sklepu).
export async function syncIfirma(env: Env, sb: Sb, opts: { days?: number; limit?: number; by?: string } = {}) {
  if (!ifirmaEnabled(env)) return { ok: false, skipped: 'Brak IFIRMA_ORDERS_TOKEN', sent: 0, failed: 0, left: 0 };
  const since = new Date(Date.now() - (opts.days ?? 60) * 864e5).toISOString();
  const orders = await sb.select<{ id: string; status: string }>(`orders?select=id,status&source=in.(shop,admin)&created_at=gte.${encodeURIComponent(since)}&order=created_at.asc&limit=2000`);
  if (!orders.length) return { ok: true, sent: 0, failed: 0, left: 0 };
  const evs: { order_id: string; data: any; created_at: string }[] = [];
  for (let i = 0; i < orders.length; i += 150) {
    const chunk = orders.slice(i, i + 150).map((o) => o.id).join(',');
    evs.push(...await sb.select<any>(`order_events?select=order_id,data,created_at&type=in.(ifirma_sent,ifirma_updated)&order_id=in.(${chunk})&order=created_at.asc`));
  }
  const last = new Map<string, string>();
  for (const e of evs) last.set(e.order_id, e.data?.status);
  const todo = orders.filter((o) => last.get(o.id) !== STATUS[o.status]);
  const batch = todo.slice(0, opts.limit ?? 40); // limit ifirma: 100 zapytań na minutę
  let sent = 0; let failed = 0; let firstError: string | null = null;
  for (const o of batch) {
    const r: any = await pushToIfirma(env, sb, o.id, { by: opts.by }).catch((e) => ({ ok: false, error: String(e) }));
    if (r.ok) sent++; else if (!r.skipped) { failed++; firstError ??= r.error; }
  }
  return { ok: true, sent, failed, firstError, left: todo.length - batch.length };
}
