// Import klientów i zamówień z WooCommerce do Supabase.
//
// Uruchomienie (w folderze projektu):
//   node --env-file=.import.env scripts/import-woocommerce.mjs --dry   ← podgląd, nic nie zapisuje
//   node --env-file=.import.env scripts/import-woocommerce.mjs         ← właściwy import
//
// Skrypt można uruchamiać wielokrotnie: rekordy są aktualizowane po wc_order_id i e-mailu,
// więc nic się nie zdubluje (przyda się w dniu startu do dociągnięcia nowych zamówień).

const { WC_URL, WC_KEY, WC_SECRET, SUPABASE_SECRET_KEY } = process.env;
// Adres projektu bez końcowego „/” i bez „/rest/v1”, nawet jeśli tak został wklejony
const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const DRY = process.argv.includes('--dry');
const META = process.argv.includes('--meta');

for (const [k, v] of Object.entries({ WC_URL, WC_KEY, WC_SECRET, SUPABASE_URL, SUPABASE_SECRET_KEY })) {
  if (!v) { console.error(`Brak zmiennej ${k} w pliku .import.env`); process.exit(1); }
}

// ---------- Pomocnicze ----------
export const grosze = (v) => Math.round(parseFloat(v || '0') * 100);
const lower = (s) => String(s || '').trim().toLowerCase();
const nonEmpty = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));
const metaValue = (meta, re) => meta?.find((m) => re.test(m.key) && typeof m.value === 'string' && m.value.trim())?.value.trim() ?? null;

export const STATUS = {
  pending: 'pending_payment',
  processing: 'paid',
  'on-hold': 'on_hold',
  completed: 'completed',
  cancelled: 'cancelled',
  refunded: 'refunded',
  failed: 'failed',
};
const SKIP_STATUS = new Set(['checkout-draft', 'trash', 'draft']);

// Dopasowanie pozycji do produktów w nowym sklepie (po nazwie / SKU)
export function matchProduct(item) {
  const t = lower(`${item.name} ${item.sku || ''}`);
  if (t.includes('k9')) return 'krople-can-c-k9';
  if (t.includes('kaps') && t.includes('90')) return 'kapsulki-can-c-90';
  if (t.includes('kaps') && t.includes('60')) return 'kapsulki-can-c-60';
  if (t.includes('krop') || t.includes('can-c') || t.includes('can c')) return 'krople-can-c';
  return null;
}

const address = (a) =>
  a && (a.address_1 || a.city)
    ? nonEmpty({
        name: [a.first_name, a.last_name].filter(Boolean).join(' '),
        company: a.company,
        street: [a.address_1, a.address_2].filter(Boolean).join(' '),
        postcode: a.postcode,
        city: a.city,
        country: a.country,
        phone: a.phone,
      })
    : null;

// ---------- Przekształcenie zamówienia WooCommerce → nasz format ----------
export function mapOrder(o) {
  const items = (o.line_items || []).map((li) => {
    const gross = grosze(li.subtotal) + grosze(li.subtotal_tax);   // przed rabatem
    const paid = grosze(li.total) + grosze(li.total_tax);          // po rabacie
    const qty = Math.max(1, li.quantity || 1);
    return {
      product_id: matchProduct(li),
      name: li.name,
      qty,
      unit_price: Math.round(gross / qty),
      discount: Math.max(0, gross - paid),
      total: paid,
    };
  });

  const total = grosze(o.total);
  const shipping = grosze(o.shipping_total) + grosze(o.shipping_tax);
  let subtotal = items.reduce((s, i) => s + i.unit_price * i.qty, 0);
  let discount = Math.max(0, subtotal + shipping - total);
  // Opłaty dodatkowe (fee_lines) lub zaokrąglenia: domykamy sumę, żeby zgadzała się z kwotą zapłaconą
  if (subtotal - discount + shipping !== total) subtotal = total - shipping + discount;

  const meta = o.meta_data || [];
  const get = (key) => meta.find((m) => m.key === key && typeof m.value === 'string' && m.value.trim())?.value.trim() ?? null;
  const nip = metaValue(meta, /(^|_)nip$|vat_?number|tax_?id/i);
  // Punkt odbioru i przewoźnik zapisane przez wtyczkę Furgonetki
  const locker = get('_furgonetkaPoint');
  const carrier = get('_furgonetkaService');
  const p24Id = Number(get('_p24_order_id')) || null;
  // Źródło ruchu z WooCommerce (Order Attribution) – przyda się do analizy kanałów i PPC
  const attr = (k) => get(`_wc_order_attribution_${k}`);
  const host = (u) => { try { return u ? new URL(u).host : null; } catch { return null; } };
  const path = (u) => { try { return u ? new URL(u).pathname : null; } catch { return null; } };
  const attribution = attr('source_type')
    ? nonEmpty({
        source_type: attr('source_type'),
        utm_source: attr('utm_source'),
        utm_medium: attr('utm_medium'),
        utm_campaign: attr('utm_campaign'),
        utm_content: attr('utm_content'),
        device: attr('device_type'),
        referrer: host(attr('referrer')),          // tylko domena, bez pełnego adresu
        landing_page: path(attr('session_entry')), // tylko ścieżka, bez parametrów (np. gclid)
        session_pages: Number(attr('session_pages')) || null,
        session_count: Number(attr('session_count')) || null,
      })
    : null;
  const subscribed = ['1', 'yes', 'true'].includes(lower(get('mailchimp_woocommerce_is_subscribed')));
  const shippingLine = o.shipping_lines?.[0];

  return {
    order: {
      number: parseInt(String(o.number).replace(/\D/g, ''), 10) || o.id,
      email: lower(o.billing?.email),
      status: STATUS[o.status] ?? 'on_hold',
      subtotal,
      discount,
      shipping_cost: shipping,
      total,
      currency: o.currency || 'PLN',
      shipping_method: shippingLine?.method_title || shippingLine?.method_id || null,
      shipping_point: locker,
      shipping_address: address(o.shipping) ?? address(o.billing),
      billing: nip || o.billing?.company ? nonEmpty({ ...address(o.billing), nip }) : null,
      wants_invoice: Boolean(nip),
      customer_note: o.customer_note || null,
      payment_provider: o.payment_method_title || o.payment_method || null,
      paid_at: o.date_paid_gmt ? `${o.date_paid_gmt}Z` : null,
      p24_order_id: p24Id,
      carrier,
      attribution,
      source: 'woocommerce',
      wc_order_id: o.id,
      created_at: `${o.date_created_gmt}Z`,
    },
    items,
    customer: {
      email: lower(o.billing?.email),
      first_name: o.billing?.first_name || null,
      last_name: o.billing?.last_name || null,
      phone: o.billing?.phone || null,
      default_address: address(o.shipping) ?? address(o.billing),
      default_locker: locker,
      subscribed,
      source: 'woocommerce',
      created_at: `${o.date_created_gmt}Z`,
    },
  };
}

// ---------- WooCommerce API ----------
async function wcAll(path) {
  const out = [];
  for (let page = 1; ; page++) {
    const url = new URL(`/wp-json/wc/v3/${path}`, WC_URL);
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    url.searchParams.set('orderby', 'id');
    url.searchParams.set('order', 'asc');
    if (path === 'customers') url.searchParams.set('role', 'all');
    if (path === 'orders') url.searchParams.set('status', 'any');
    url.searchParams.set('consumer_key', WC_KEY);
    url.searchParams.set('consumer_secret', WC_SECRET);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`WooCommerce ${path} strona ${page}: ${res.status} ${await res.text()}`);
    const batch = await res.json();
    out.push(...batch);
    const pages = Number(res.headers.get('x-wp-totalpages') || 1);
    process.stdout.write(`\r  ${path}: ${out.length} pobranych (strona ${page}/${pages})   `);
    if (page >= pages || batch.length === 0) break;
  }
  process.stdout.write('\n');
  return out;
}

// ---------- Supabase REST ----------
const sbHeaders = {
  apikey: SUPABASE_SECRET_KEY,
  ...(SUPABASE_SECRET_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${SUPABASE_SECRET_KEY}` } : {}),
  'Content-Type': 'application/json',
};

async function sb(method, path, body, prefer) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...sbHeaders, ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();          // przy return=minimal odpowiedź jest pusta
  return text ? JSON.parse(text) : null;
}

const chunks = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// ---------- Główna logika ----------
async function main() {
  console.log(DRY ? '\nTRYB PODGLĄDU – nic nie zostanie zapisane\n' : '\nIMPORT DO SUPABASE\n');

  console.log('1. Pobieranie z WooCommerce…');
  const wcCustomers = await wcAll('customers');
  const wcOrders = (await wcAll('orders')).filter((o) => !SKIP_STATUS.has(o.status));
  const mapped = wcOrders.map(mapOrder).filter((m) => m.order.email);

  // Numer transakcji P24 musi być unikalny – przy powtórzeniu zostawiamy pierwszy
  const seenP24 = new Set();
  for (const m of mapped) {
    if (!m.order.p24_order_id) continue;
    if (seenP24.has(m.order.p24_order_id)) m.order.p24_order_id = null;
    else seenP24.add(m.order.p24_order_id);
  }

  // --meta: lista nazw dodatkowych pól zamówień (bez wartości), żeby znaleźć NIP i paczkomat
  if (META) {
    const keys = new Map();
    for (const o of wcOrders) for (const m of o.meta_data || []) {
      if (typeof m.value === 'string' && m.value.trim()) keys.set(m.key, (keys.get(m.key) || 0) + 1);
    }
    console.log('\nPola meta w zamówieniach (nazwa: liczba zamówień z wartością):');
    [...keys].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`   ${k}: ${n}`));
    return;
  }

  // Klienci: z zamówień (także goście) + z listy kont. Zawsze ten sam zestaw pól (wymóg zapisu zbiorczego).
  const blank = { first_name: null, last_name: null, phone: null, default_address: null, default_locker: null, wc_customer_id: null, marketing_consent: false, consent_at: null, consent_source: null };
  const customers = new Map();
  for (const m of mapped) {                       // zamówienia są posortowane od najstarszego
    const c = m.customer;
    const prev = customers.get(c.email);
    customers.set(c.email, {
      ...blank,
      ...prev,
      email: c.email,
      first_name: c.first_name ?? prev?.first_name ?? null,      // nowsze dane nadpisują starsze
      last_name: c.last_name ?? prev?.last_name ?? null,
      phone: c.phone ?? prev?.phone ?? null,
      default_address: c.default_address ?? prev?.default_address ?? null,
      default_locker: c.default_locker ?? prev?.default_locker ?? null,
      // Zgoda z Mailchimp przy zamówieniu: zapisujemy pierwszą datę zapisu
      marketing_consent: Boolean(prev?.marketing_consent || c.subscribed),
      consent_at: prev?.consent_at ?? (c.subscribed ? c.created_at : null),
      consent_source: prev?.consent_source ?? (c.subscribed ? 'woocommerce_mailchimp' : null),
      source: 'woocommerce',
      created_at: prev?.created_at ?? c.created_at,              // data pierwszego zakupu
    });
  }
  for (const c of wcCustomers) {
    const email = lower(c.email);
    if (!email) continue;
    const prev = customers.get(email);
    customers.set(email, {
      ...blank,
      ...prev,
      email,
      first_name: c.first_name || prev?.first_name || null,
      last_name: c.last_name || prev?.last_name || null,
      phone: c.billing?.phone || prev?.phone || null,
      default_address: prev?.default_address ?? address(c.shipping) ?? address(c.billing) ?? null,
      source: 'woocommerce',
      wc_customer_id: c.id,                                     // tylko z kont, żeby uniknąć konfliktów
      created_at: c.date_created_gmt ? `${c.date_created_gmt}Z` : prev?.created_at ?? new Date().toISOString(),
    });
  }

  // Podsumowanie
  const byStatus = mapped.reduce((acc, m) => ({ ...acc, [m.order.status]: (acc[m.order.status] || 0) + 1 }), {});
  const unmatched = new Set(mapped.flatMap((m) => m.items.filter((i) => !i.product_id).map((i) => i.name)));
  const revenue = mapped.filter((m) => ['paid', 'shipped', 'completed'].includes(m.order.status)).reduce((s, m) => s + m.order.total, 0);
  const maxNumber = Math.max(0, ...mapped.map((m) => m.order.number));

  console.log(`\n2. Podsumowanie`);
  console.log(`   Zamówienia: ${mapped.length}`, byStatus);
  console.log(`   Klienci (konta + goście): ${customers.size}`);
  console.log(`   Przychód z opłaconych/zrealizowanych: ${(revenue / 100).toLocaleString('pl-PL')} zł`);
  console.log(`   Najwyższy numer zamówienia: ${maxNumber}`);
  const cnt = (f) => mapped.filter(f).length;
  console.log(`   Znalezione dane: punkt odbioru ${cnt((m) => m.order.shipping_point)}, przewoźnik ${cnt((m) => m.order.carrier)}, nr transakcji P24 ${cnt((m) => m.order.p24_order_id)}, źródło ruchu ${cnt((m) => m.order.attribution)}, NIP ${cnt((m) => m.order.billing?.nip)}`);
  console.log(`   Klienci ze zgodą marketingową (Mailchimp): ${[...customers.values()].filter((c) => c.marketing_consent).length}`);
  if (unmatched.size) console.log(`   Pozycje bez dopasowania do produktu (zapiszą się z samą nazwą):`, [...unmatched]);

  if (DRY) {
    console.log('\nPrzykładowe zamówienie po przekształceniu:\n', JSON.stringify(mapped.at(-1), null, 2));
    console.log('\nWygląda dobrze? Uruchom ponownie bez --dry.');
    return;
  }

  console.log('\n3. Zapis klientów…');
  const custIds = new Map();
  for (const batch of chunks([...customers.values()], 200)) {
    const rows = await sb('POST', 'customers?on_conflict=email&select=id,email', batch, 'resolution=merge-duplicates,return=representation');
    rows.forEach((r) => custIds.set(r.email, r.id));
  }
  console.log(`   zapisano ${custIds.size}`);

  console.log('4. Zapis zamówień…');
  let done = 0;
  for (const batch of chunks(mapped, 100)) {
    const rows = await sb(
      'POST',
      'orders?on_conflict=wc_order_id&select=id,wc_order_id',
      batch.map((m) => ({ ...m.order, customer_id: custIds.get(m.order.email) ?? null })),
      'resolution=merge-duplicates,return=representation',
    );
    const idByWc = new Map(rows.map((r) => [r.wc_order_id, r.id]));
    const ids = rows.map((r) => r.id);

    // Pozycje: usuwamy stare i wstawiamy na nowo (bezpieczne przy ponownym imporcie)
    await sb('DELETE', `order_items?order_id=in.(${ids.join(',')})`);
    const items = batch.flatMap((m) => m.items.map((i) => ({ ...i, order_id: idByWc.get(m.order.wc_order_id) })));
    if (items.length) await sb('POST', 'order_items', items, 'return=minimal');

    done += rows.length;
    process.stdout.write(`\r   zapisano ${done}/${mapped.length}   `);
  }

  console.log('\n\nGotowe. Ostatni krok – w Supabase SQL Editor uruchom:');
  console.log(`  select setval('public.order_number_seq', greatest((select max(number) from public.orders), ${maxNumber}));`);
  console.log('Dzięki temu nowe zamówienia dostaną kolejne numery po WooCommerce.\n');
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('import-woocommerce.mjs')) {
  main().catch((e) => { console.error('\nBŁĄD:', e.message); process.exit(1); });
}
