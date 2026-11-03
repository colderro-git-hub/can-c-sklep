import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';
import { priceCart, PRODUCT_PRICE_FIELDS, type DbProduct } from '../../../lib/pricing';
import { p24Config, registerTransaction } from '../../../lib/p24';
import { finalizePayment } from '../../../lib/payments';
import { sendMail, zl } from '../../../lib/mail';
import { getSite } from '../../../lib/site-settings';
import { str, EMAIL_RE, POSTCODE_RE, LOCKER_RE, cleanPhone, validPhone, validNip } from '../../../lib/validate';

export const prerender = false;

// Zamówienie dodane ręcznie w panelu (telefon, e-mail, sprzedaż poza sklepem).
// payment: 'paid' – opłacone poza sklepem (przelew, gotówka) | 'link' – wysyłamy klientowi link do płatności P24 | 'pending' – czeka na płatność
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }

  const email = str(b.email, 200).toLowerCase();
  const phone = cleanPhone(b.phone);
  const firstName = str(b.firstName, 60), lastName = str(b.lastName, 60);
  const method = b.shippingMethod === 'dpd' ? 'dpd' : 'inpost_locker';
  const locker = str(b.locker, 15).toUpperCase();
  const addr = { street: str(b.street, 120), postcode: str(b.postcode, 6), city: str(b.city, 60) };
  const wantsInvoice = b.invoice === true;
  const inv = { company: str(b.company, 150), nip: str(b.nip, 13).replace(/\D/g, ''), street: str(b.invStreet, 120), postcode: str(b.invPostcode, 6), city: str(b.invCity, 60) };
  const payment = ['paid', 'link', 'pending'].includes(b.payment) ? b.payment : 'pending';
  const paymentNote = str(b.paymentNote, 120);
  const extraDiscount = Math.max(0, Math.round(Number(String(b.extraDiscount || 0).replace(',', '.')) * 100)) || 0;
  const lines = Array.isArray(b.items)
    ? b.items.filter((i: any) => typeof i?.slug === 'string' && Number.isInteger(Number(i?.qty)) && Number(i.qty) > 0 && Number(i.qty) <= 100)
        .map((i: any) => ({ slug: i.slug.slice(0, 60), qty: Number(i.qty) })).slice(0, 20)
    : [];

  const errors: string[] = [];
  if (!EMAIL_RE.test(email)) errors.push('Podaj e-mail klienta.');
  if (phone && !validPhone(phone)) errors.push('Telefon: 9 cyfr.');
  if (firstName.length < 2 || lastName.length < 2) errors.push('Podaj imię i nazwisko.');
  if (method === 'inpost_locker' && !LOCKER_RE.test(locker)) errors.push('Podaj kod Paczkomatu.');
  if (method === 'dpd' && (!addr.street || !POSTCODE_RE.test(addr.postcode) || !addr.city)) errors.push('Uzupełnij adres dostawy.');
  if (wantsInvoice && (!inv.company || !validNip(inv.nip) || !inv.street || !POSTCODE_RE.test(inv.postcode) || !inv.city)) errors.push('Sprawdź dane do faktury i NIP.');
  if (!lines.length) errors.push('Dodaj co najmniej jeden produkt.');
  if (errors.length) return json(422, { error: errors.join(' ') });

  const sb = db(env);
  const origin = new URL(request.url).origin;
  try {
    // Łączymy pozycje tego samego produktu (rabat zestawowy liczy się od łącznej liczby sztuk)
    const merged = Object.values(lines.reduce((acc: Record<string, any>, l: any) => { (acc[l.slug] ??= { slug: l.slug, qty: 0 }).qty += l.qty; return acc; }, {}));
    const ids = merged.map((l: any) => `"${l.slug.replace(/"/g, '')}"`).join(',');
    const products = await sb.select<DbProduct>(`products?select=${PRODUCT_PRICE_FIELDS}&id=in.(${ids})`);
    let priced;
    try { priced = priceCart(merged as any, products); } catch { return json(409, { error: 'Któryś z produktów jest nieaktywny albo nie ma ceny.' }); }
    if (extraDiscount > priced.total) return json(422, { error: 'Rabat jest większy niż wartość zamówienia.' });
    const total = priced.total - extraDiscount;

    const customerRow: Record<string, unknown> = { email, first_name: firstName, last_name: lastName, ...(phone ? { phone } : {}) };
    if (method === 'inpost_locker') customerRow.default_locker = locker; else customerRow.default_address = addr;
    if (wantsInvoice) customerRow.billing = inv;
    const [customer] = await sb.upsert<{ id: string }>('customers', customerRow, 'email', 'id');

    const name = `${firstName} ${lastName}`;
    const [order] = await sb.insert<any>('orders', {
      customer_id: customer.id, email, status: 'pending_payment',
      subtotal: priced.subtotal, discount: priced.discount + extraDiscount, shipping_cost: 0, total,
      shipping_method: method, shipping_point: method === 'inpost_locker' ? locker : null,
      shipping_address: method === 'dpd' ? { name, phone, ...addr, country: 'PL' } : { name, phone },
      billing: wantsInvoice ? inv : null, wants_invoice: wantsInvoice, customer_note: str(b.note, 500) || null,
      payment_provider: payment === 'paid' ? `ręcznie${paymentNote ? `: ${paymentNote}` : ''}` : 'przelewy24',
      source: 'admin',
    }, 'id,number,email,status,total,currency,shipping_method,shipping_point,shipping_address,wants_invoice');
    await sb.insert('order_items', priced.items.map((i) => ({ ...i, order_id: order.id })), 'id');
    await sb.insert('order_events', { order_id: order.id, type: 'created', data: { by: admin, manual: true, payment, ...(extraDiscount ? { extraDiscount } : {}) } }, 'id');

    let paymentUrl: string | null = null;
    let mailed = false;
    if (payment === 'paid') {
      // Opłacone poza sklepem: status, stany, e-mail z potwierdzeniem (jeśli zaznaczono)
      if (b.notify === false) {
        await sb.update(`orders?id=eq.${order.id}`, { status: 'paid', paid_at: new Date().toISOString() }, 'id');
        await sb.insert('order_events', { order_id: order.id, type: 'p24_verified', data: { by: admin, manual: true } }, 'id');
        try { await sb.rpc('apply_order_stock', { p_order: order.id }); } catch { /* ewidencja */ }
      } else {
        await finalizePayment(env, sb, null, order, { orderId: null, origin, skipVerify: true, by: admin });
        mailed = true;
      }
    } else if (payment === 'link') {
      const p24 = p24Config(env);
      paymentUrl = await registerTransaction(p24, {
        sessionId: order.id, amount: total, description: `Zamówienie nr ${order.number} – can-c.pl`, email, client: name, phone,
        urlReturn: `${origin}/zamowienie/dziekujemy/?id=${order.id}`, urlStatus: `${origin}/api/p24/status`, timeLimit: 0,
      });
      await sb.insert('order_events', { order_id: order.id, type: 'p24_registered', data: { link: true } }, 'id');
      if (b.notify !== false) {
        const site = await getSite(env);
        const items = priced.items.map((i) => `• ${i.name} × ${i.qty} – ${zl(i.total)}`).join('\n');
        await sendMail(env, {
          to: email,
          replyTo: env.CONTACT_TO?.split(',')[0]?.trim(),
          subject: `Zamówienie nr ${order.number} – link do płatności – Can-C`,
          text: [
            `Dzień dobry ${firstName},`, '', 'przygotowaliśmy dla Ciebie zamówienie:', '', items,
            extraDiscount ? `Rabat: −${zl(extraDiscount)}` : '', `Do zapłaty: ${zl(total)} (dostawa gratis)`, '',
            `Zapłać BLIK-iem, przelewem lub kartą: ${paymentUrl}`, '',
            'Link jest ważny 7 dni. Po opłaceniu wyślemy potwierdzenie, a potem numer przesyłki.', '',
            `Zespół Can-C · ${site.email}`,
          ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n'),
        });
        mailed = true;
      }
    }
    console.log(`Admin ${admin} dodał ręcznie zamówienie ${order.number} (${payment})`);
    return json(200, { id: order.id, number: order.number, total, paymentUrl, mailed });
  } catch (e) {
    console.error('Ręczne zamówienie: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Nie udało się utworzyć zamówienia.' });
  }
};
