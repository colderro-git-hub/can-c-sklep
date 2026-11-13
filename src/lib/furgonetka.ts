// Integracja własna Furgonetki: wspólne funkcje
import type { Env } from './env';
import { PARCEL_DEFAULTS, PRODUCT_VAT_RATE, PRODUCT_NUMERIC_ID } from '../config';

// Klucz może przyjść w różnych nagłówkach - sprawdzamy typowe miejsca
export function readApiKey(request: Request) {
  const h = request.headers;
  const url = new URL(request.url);
  const raw =
    h.get('x-api-key') || h.get('apikey') || h.get('api-key') || h.get('x-apikey') ||
    h.get('authorization') || url.searchParams.get('apiKey') || url.searchParams.get('api_key') || url.searchParams.get('token') || '';
  return raw.replace(/^(Bearer|Token|ApiKey)\s+/i, '').trim();
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function authorized(request: Request, env: Env) {
  const expected = env.FURGONETKA_API_KEY || '';
  if (expected.length < 24) { console.error('Furgonetka: brak lub za krótki FURGONETKA_API_KEY'); return false; }
  const ok = safeEqual(readApiKey(request), expected);
  if (!ok) console.warn('Furgonetka: odrzucono klucz. Nagłówki żądania: ' + [...request.headers.keys()].join(', '));
  return ok;
}

// Czas warszawski bez strefy (format oczekiwany przez Furgonetkę)
export function toWarsaw(iso: string | null) {
  if (!iso) return null;
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    .formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}:${g('second')}`;
}

// Data od Furgonetki → UTC (bez strefy traktujemy jako czas warszawski)
export function fromWarsaw(value: string) {
  if (!value) return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) { const d = new Date(value); return isNaN(+d) ? null : d.toISOString(); }
  const guess = Date.parse(value.replace(' ', 'T') + 'Z');
  if (isNaN(guess)) return null;
  const wall = Date.parse(toWarsaw(new Date(guess).toISOString())! + 'Z');
  return new Date(guess - (wall - guess)).toISOString();
}

const STATUS: Record<string, string> = { paid: 'paid', packing: 'paid', on_hold: 'on_hold', shipped: 'shipped', completed: 'completed', cancelled: 'cancelled' };
const r2 = (n: number) => Math.round(n * 100) / 100;

function splitName(full: string) {
  const parts = (full || '').trim().split(/\s+/);
  return { name: parts.shift() || '', surname: parts.join(' ') };
}

export function toFurgonetkaOrder(o: any) {
  const a = o.shipping_address || {};
  const person = splitName(a.name || [o.customers?.first_name, o.customers?.last_name].filter(Boolean).join(' '));
  const phone = (a.phone || o.customers?.phone || '').replace(/^\+48/, '');
  const ship = {
    company: '',
    name: person.name, surname: person.surname,
    street: a.street || '', city: a.city || '', postcode: a.postcode || '', countryCode: 'PL',
    phone, email: o.email,
  };
  const b = o.billing;
  const invoice = b
    ? { company: b.company || '', name: person.name, surname: person.surname, street: b.street || '', city: b.city || '', postcode: b.postcode || '', countryCode: 'PL', phone, email: o.email, nip: b.nip || '' }
    : { ...ship, nip: '' };
  const items = o.order_items || [];
  const vat = PRODUCT_VAT_RATE;
  const locker = o.shipping_method === 'inpost_locker';

  return {
    sourceOrderId: String(o.number),
    datetimeOrder: toWarsaw(o.created_at),
    sourceDatetimeChange: toWarsaw(o.updated_at),
    service: locker ? 'inpost' : 'dpd',
    serviceDescription: locker ? 'InPost Paczkomat' : 'Kurier DPD',
    status: STATUS[o.status] || o.status,
    totalPrice: r2(o.total / 100),
    shippingCost: r2(o.shipping_cost / 100),
    shippingTaxRate: 23,
    totalPaid: o.paid_at ? r2(o.total / 100) : 0,
    codAmount: 0,
    totalWeight: r2(items.reduce((s: number, i: any) => s + i.qty * PARCEL_DEFAULTS.weightPerItem, 0)),
    point: locker ? o.shipping_point || '' : '',
    comment: o.customer_note || '',
    shippingAddress: ship,
    invoiceAddress: invoice,
    products: items.map((i: any, idx: number) => {
      const unitGross = r2((i.total / i.qty) / 100); // cena po rabacie za sztukę
      return {
        sourceProductId: PRODUCT_NUMERIC_ID[i.product_id] ?? 100 + idx,
        name: i.name,
        priceGross: unitGross,
        priceNet: r2(unitGross / (1 + vat / 100)),
        vat, taxRate: vat,
        weight: PARCEL_DEFAULTS.weightPerItem,
        quantity: i.qty,
        width: PARCEL_DEFAULTS.width, height: PARCEL_DEFAULTS.height, depth: PARCEL_DEFAULTS.depth,
        sku: i.product_id || '',
        gtin: i.products?.ean || '',
        unit: 'szt.',
      };
    }),
    paymentDatetime: toWarsaw(o.paid_at),
  };
}
