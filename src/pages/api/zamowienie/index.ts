import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { priceCart, PRODUCT_PRICE_FIELDS, type DbProduct } from '../../../lib/pricing';
import { p24Config, registerTransaction } from '../../../lib/p24';
import { BANK_PROVIDER, BANK_ACCOUNT, BANK_INFO_TEXT, bankTitle } from '../../../lib/bank-transfer';
import { sendMail } from '../../../lib/mail';
import { getSite } from '../../../lib/site-settings';
import { orderConfirmationBankHtml } from '../../../lib/email-templates';
import { checkCode, normalizeCode } from '../../../lib/discounts';
import { getPromotions, findCodePromotion } from '../../../lib/promotions-db';
import { promoActive } from '../../../lib/promotions';
import { gaIdsFromCookies } from '../../../lib/ga4-mp';

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
  const paymentMethod = body.paymentMethod === BANK_PROVIDER ? BANK_PROVIDER : 'p24';
  let sb: ReturnType<typeof db>;
  let p24: ReturnType<typeof p24Config> | null = null;
  try {
    sb = db(env);
    if (paymentMethod === 'p24') p24 = p24Config(env);
  } catch (e) {
    console.error('Konfiguracja: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Sklep jest chwilowo niedostępny. Spróbuj za kilka minut.' });
  }

  try {
    // ---------- Cena z bazy ----------
    const ids = [...new Set(lines.map((l: any) => l.slug))].map((s) => `"${String(s).replace(/"/g, '')}"`).join(',');
    const products = await sb.select<DbProduct>(`products?select=${PRODUCT_PRICE_FIELDS}&id=in.(${ids})`);
    const promos = await getPromotions(env);
    // Kod uruchamiający promocję (zestaw / rabat ilościowy) – rabat trafia do pozycji, nie do kwoty kodu
    const codePromo = str(body.discountCode, 30) ? await findCodePromotion(env, body.discountCode) : null;
    const promoCode = codePromo ? normalizeCode(body.discountCode) : null;
    let priced;
    try { priced = priceCart(lines, products, promos, { code: promoCode }); } catch (e) {
      return json(409, { error: 'Któryś z produktów jest niedostępny. Odśwież koszyk.' });
    }

    // ---------- Kod rabatowy (sprawdzany ponownie po stronie serwera) ----------
    let codeName: string | null = null;
    let codeAmount = 0;
    if (codePromo) {
      if (!promoActive(codePromo) || !priced.codePromo) return json(422, { error: 'Kod nie działa dla tego koszyka. Usuń go albo sprawdź warunki promocji.' });
      codeName = promoCode; // do raportów; kwota rabatu jest w pozycjach i w order_promotions
    } else if (str(body.discountCode, 30)) {
      if (priced.codesBlockedBy) return json(422, { error: `Kod rabatowy nie łączy się z promocją „${priced.codesBlockedBy}”. Usuń kod, aby skorzystać z promocji.` });
      const r = await checkCode(sb, body.discountCode, priced.total, email);
      if (!r.ok) return json(422, { error: r.error });
      codeName = r.code.code;
      codeAmount = r.amount;
    }
    const discountTotal = priced.discount + codeAmount;
    const total = priced.total - codeAmount;
    if (total < 100) return json(422, { error: 'Kwota zamówienia po rabacie jest za niska.' });

    // ---------- Klient (bez nadpisywania istniejącej zgody marketingowej) ----------
    const customerRow: Record<string, unknown> = { email, first_name: firstName, last_name: lastName, phone };
    if (method === 'inpost_locker') customerRow.default_locker = locker;
    else customerRow.default_address = addr;
    if (wantsInvoice) customerRow.billing = inv;
    if (body.marketing === true) Object.assign(customerRow, { marketing_consent: true, consent_at: new Date().toISOString(), consent_source: 'checkout' });
    const [customer] = await sb.upsert<{ id: string }>('customers', customerRow, 'email', 'id');

    // ---------- Zamówienie ----------
    const name = `${firstName} ${lastName}`;
    const [order] = await sb.insert<{ id: string; number: number }>('orders', {
      customer_id: customer.id,
      email,
      status: 'pending_payment',
      subtotal: priced.subtotal,
      discount: discountTotal,
      shipping_cost: priced.shipping_cost,
      total,
      discount_code: codeName,
      discount_code_amount: codeAmount,
      shipping_method: method,
      shipping_point: method === 'inpost_locker' ? locker : null,
      shipping_address: method === 'dpd' ? { name, phone, ...addr, country: 'PL' } : { name, phone, ...(lockerName ? { point_name: lockerName } : {}) },
      billing: wantsInvoice ? inv : null,
      wants_invoice: wantsInvoice,
      customer_note: note || null,
      payment_provider: paymentMethod === BANK_PROVIDER ? BANK_PROVIDER : 'przelewy24',
      source: 'shop',
      // Identyfikatory GA4 (tylko gdy klient zgodził się na analitykę) – do zdarzeń z serwera, np. zwrotu
      attribution: (() => { const ga = gaIdsFromCookies(request.headers.get('Cookie')); return Object.keys(ga).length ? ga : null; })(),
    }, 'id,number');

    await sb.insert('order_items', priced.items.map((i) => ({ ...i, order_id: order.id })), 'id');
    // Naliczone promocje – do statystyk w panelu (błąd zapisu nie blokuje zamówienia)
    if (priced.promotions.length) {
      await sb.insert('order_promotions', priced.promotions.map((p) => ({ order_id: order.id, promotion_id: p.id, name: p.label, kind: p.kind, amount: p.amount })), 'id')
        .catch((e) => console.error('Promocje zamówienia: ' + (e instanceof Error ? e.message : String(e))));
    }
    await sb.insert('order_events', { order_id: order.id, type: 'created', data: { total, paymentMethod, ...(codeName ? { code: codeName, codeAmount } : {}), ...(priced.promotions.length ? { promotions: priced.promotions.map((p) => `${p.label} −${(p.amount / 100).toFixed(2)} zł`) } : {}) } }, 'id');

    // ---------- Płatność ----------
    if (paymentMethod === BANK_PROVIDER) {
      // Przelew bankowy: zamówienie od razu w statusie „czeka na płatność", bez rejestracji w P24.
      // Wyślij mail z danymi do przelewu (jak mail potwierdzenia, ale z numerem konta zamiast przycisku płać).
      try {
        const site = await getSite(env);
        const delivery = method === 'inpost_locker' ? `InPost Paczkomat ${locker}` : `Kurier DPD, ${addr.street}, ${addr.postcode} ${addr.city}`;
        const itemRows = priced.items.map((i) => ({ name: i.name, qty: i.qty, total: i.total }));
        const mailHtml = orderConfirmationBankHtml({ site, origin: self.origin, number: order.number, total, items: itemRows, delivery, invoice: wantsInvoice, pointName: undefined, bankAccount: BANK_ACCOUNT, bankTitle: bankTitle(order.number) });
        await sendMail(env, {
          to: email,
          subject: `Zamówienie nr ${order.number} – dane do przelewu`,
          text: `Dziękujemy za zamówienie nr ${order.number}.

Tytuł przelewu: ${bankTitle(order.number)}
Kwota: ${(total / 100).toFixed(2).replace('.', ',')} zł

${BANK_INFO_TEXT}

W razie pytań odpiszemy na ten adres.`,
          html: mailHtml,
          replyTo: env.CONTACT_TO,
        });
        await sb.insert('order_events', { order_id: order.id, type: 'mail_confirmation', data: { bank: true } }, 'id');
      } catch (mailErr) {
        console.error('Mail przelew bankowy: ' + (mailErr instanceof Error ? mailErr.message : String(mailErr)));
        await sb.insert('order_events', { order_id: order.id, type: 'mail_failed', data: { bank: true, err: String(mailErr) } }, 'id');
      }
      return json(200, { id: order.id, number: order.number });
    }

    const redirect = await registerTransaction(p24!, {
      sessionId: order.id,
      amount: total,
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
