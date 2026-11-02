import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { priceCart, type DbProduct } from '../../../lib/pricing';
import { p24Config, registerTransaction } from '../../../lib/p24';

export const prerender = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const POSTCODE_RE = /^\d{2}-\d{3}$/;
const LOCKER_RE = /^[A-Z0-9-]{4,15}$/;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) : '');

// Suma kontrolna NIP
function validNip(nip: string) {
  if (!/^\d{10}$/.test(nip)) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = w.reduce((s, x, i) => s + x * Number(nip[i]), 0);
  return sum % 11 === Number(nip[9]);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const origin = request.headers.get('Origin');
  const self = new URL(request.url);
  if (origin && new URL(origin).host !== self.host) return json(403, { error: 'Niedozwolone źródło żądania.' });

  let body: any;
  try { body = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  if (str(body.website, 100)) return json(400, { error: 'Nieprawidłowe dane.' }); // pułapka na boty

  // ---------- Walidacja ----------
  const email = str(body.email, 200).toLowerCase();
  const phone = str(body.phone, 20).replace(/[^\d+]/g, '');
  const firstName = str(body.firstName, 60);
  const lastName = str(body.lastName, 60);
  const method = body.shippingMethod === 'dpd' ? 'dpd' : 'inpost_locker';
  const locker = str(body.locker, 15).toUpperCase();
  const lockerName = str(body.lockerName, 150);
  const addr = { street: str(body.street, 120), postcode: str(body.postcode, 6), city: str(body.city, 60) };
  const wantsInvoice = body.invoice === true;
  const inv = { company: str(body.company, 150), nip: str(body.nip, 13).replace(/[^\d]/g, ''), street: str(body.invStreet, 120), postcode: str(body.invPostcode, 6), city: str(body.invCity, 60) };
  const note = str(body.note, 500);

  const errors: string[] = [];
  if (!EMAIL_RE.test(email)) errors.push('Podaj poprawny e-mail.');
  if (!/^(\+48)?\d{9}$/.test(phone)) errors.push('Podaj numer telefonu (9 cyfr).');
  if (firstName.length < 2 || lastName.length < 2) errors.push('Podaj imię i nazwisko.');
  if (method === 'inpost_locker' && !LOCKER_RE.test(locker)) errors.push('Podaj kod Paczkomatu, np. WRO01M.');
  if (method === 'dpd' && (!addr.street || !POSTCODE_RE.test(addr.postcode) || !addr.city)) errors.push('Uzupełnij adres dostawy.');
  if (wantsInvoice && (!inv.company || !validNip(inv.nip) || !inv.street || !POSTCODE_RE.test(inv.postcode) || !inv.city)) errors.push('Sprawdź dane do faktury i NIP.');
  if (body.terms !== true) errors.push('Zaakceptuj regulamin.');

  const lines = Array.isArray(body.items)
    ? body.items
        .filter((i: any) => typeof i?.slug === 'string' && Number.isInteger(i?.qty) && i.qty > 0 && i.qty <= 20)
        .map((i: any) => ({ slug: i.slug.slice(0, 60), qty: i.qty }))
        .slice(0, 10)
    : [];
  if (!lines.length) errors.push('Koszyk jest pusty.');
  if (errors.length) return json(422, { error: errors.join(' ') });

  const env = await getEnv(locals);
  let sb: ReturnType<typeof db>;
  let p24: ReturnType<typeof p24Config>;
  try { sb = db(env); p24 = p24Config(env); } catch (e) {
    console.error('Konfiguracja: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Sklep jest chwilowo niedostępny. Spróbuj za kilka minut.' });
  }

  try {
    // ---------- Cena z bazy ----------
    const ids = [...new Set(lines.map((l: any) => l.slug))].map((s) => `"${String(s).replace(/"/g, '')}"`).join(',');
    const products = await sb.select<DbProduct>(`products?select=id,name,price,bundles,active&id=in.(${ids})`);
    let priced;
    try { priced = priceCart(lines, products); } catch (e) {
      return json(409, { error: 'Któryś z produktów jest niedostępny. Odśwież koszyk.' });
    }

    // ---------- Klient (bez nadpisywania istniejącej zgody marketingowej) ----------
    const customerRow: Record<string, unknown> = { email, first_name: firstName, last_name: lastName, phone };
    if (method === 'inpost_locker') customerRow.default_locker = locker;
    else customerRow.default_address = addr;
    if (body.marketing === true) Object.assign(customerRow, { marketing_consent: true, consent_at: new Date().toISOString(), consent_source: 'checkout' });
    const [customer] = await sb.upsert<{ id: string }>('customers', customerRow, 'email', 'id');

    // ---------- Zamówienie ----------
    const name = `${firstName} ${lastName}`;
    const [order] = await sb.insert<{ id: string; number: number }>('orders', {
      customer_id: customer.id,
      email,
      status: 'pending_payment',
      subtotal: priced.subtotal,
      discount: priced.discount,
      shipping_cost: priced.shipping_cost,
      total: priced.total,
      shipping_method: method,
      shipping_point: method === 'inpost_locker' ? locker : null,
      shipping_address: method === 'dpd' ? { name, phone, ...addr, country: 'PL' } : { name, phone, ...(lockerName ? { point_name: lockerName } : {}) },
      billing: wantsInvoice ? inv : null,
      wants_invoice: wantsInvoice,
      customer_note: note || null,
      payment_provider: 'przelewy24',
      source: 'shop',
    }, 'id,number');

    await sb.insert('order_items', priced.items.map((i) => ({ ...i, order_id: order.id })), 'id');
    await sb.insert('order_events', { order_id: order.id, type: 'created', data: { total: priced.total } }, 'id');

    // ---------- Płatność ----------
    const redirect = await registerTransaction(p24, {
      sessionId: order.id,
      amount: priced.total,
      description: `Zamówienie nr ${order.number} – can-c.pl`,
      email,
      client: name,
      phone,
      urlReturn: `${self.origin}/zamowienie/dziekujemy/?id=${order.id}`,
      urlStatus: `${self.origin}/api/p24/status`,
    });
    await sb.insert('order_events', { order_id: order.id, type: 'p24_registered', data: {} }, 'id');

    return json(200, { redirect, number: order.number });
  } catch (e) {
    console.error('Błąd tworzenia zamówienia: ' + (e instanceof Error ? e.message : String(e)));
    return json(502, { error: 'Nie udało się rozpocząć płatności. Spróbuj ponownie.' });
  }
};

export const ALL: APIRoute = () => json(405, { error: 'Metoda niedozwolona.' });
