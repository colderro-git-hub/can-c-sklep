// GA4 Measurement Protocol – zdarzenia wysyłane z serwera (tu: zwrot z panelu admina, gdzie nie ma GTM).
// Wymaga sekretów Workera: GA4_MEASUREMENT_ID (G-XXXXXXX) i GA4_API_SECRET
// (GA4 → Administracja → Strumienie danych → strumień www → Klucze tajne interfejsu Measurement Protocol API).
import type { Env } from './env';

export type GaIds = { ga_client_id?: string; ga_session_id?: string };

// Identyfikatory z ciasteczek GA4 w żądaniu złożenia zamówienia. Ciasteczka istnieją tylko po zgodzie
// na analitykę (Consent Mode), więc bez zgody nic nie zapisujemy.
//   _ga            = GA1.1.<client_id>            → client_id = "1234567890.1700000000"
//   _ga_<STREAM>   = GS1.1.<session_id>.…  albo  GS2.1.s<session_id>$o…
export function gaIdsFromCookies(cookie: string | null): GaIds {
  if (!cookie) return {};
  const jar = new Map<string, string>();
  for (const part of cookie.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) jar.set(part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1).trim()));
  }
  const out: GaIds = {};
  const ga = jar.get('_ga')?.match(/^GA\d\.\d\.(\d+\.\d+)$/);
  if (ga) out.ga_client_id = ga[1];
  for (const [k, v] of jar) {
    if (!/^_ga_[A-Z0-9]+$/.test(k)) continue;
    const s = v.match(/^GS\d\.\d\.s?(\d{8,12})[.$]/);
    if (s) { out.ga_session_id = s[1]; break; }
  }
  return out;
}

export const ga4MpConfigured = (env: Env) => Boolean(env.GA4_MEASUREMENT_ID && env.GA4_API_SECRET);

// Zwrot: transaction_id = id zamówienia (UUID), tak samo jak w zdarzeniu purchase na stronie podziękowania.
// Zwrot częściowy wysyłamy z kwotą bez listy produktów (panel nie rozbija zwrotu na pozycje).
export async function sendGa4Refund(env: Env, o: { id: string; amount: number; attribution?: GaIds | null }): Promise<{ ok: boolean; error?: string }> {
  if (!ga4MpConfigured(env)) return { ok: false, error: 'brak GA4_MEASUREMENT_ID / GA4_API_SECRET' };
  // Bez identyfikatora klienta (brak zgody, zamówienie ręczne, import) – losowy; GA4 łączy zwrot z zakupem po transaction_id
  const clientId = o.attribution?.ga_client_id || `${Math.floor(Math.random() * 2 ** 31)}.${Math.floor(Date.now() / 1000)}`;
  const body = {
    client_id: clientId,
    non_personalized_ads: true,
    events: [{
      name: 'refund',
      params: {
        transaction_id: o.id,
        currency: 'PLN',
        value: o.amount / 100,
        ...(o.attribution?.ga_session_id ? { session_id: o.attribution.ga_session_id } : {}),
        engagement_time_msec: 1,
      },
    }],
  };
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(env.GA4_MEASUREMENT_ID!)}&api_secret=${encodeURIComponent(env.GA4_API_SECRET!)}`;
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    // Measurement Protocol zwraca 2xx także przy błędnych danych – poprawność sprawdza się w DebugView / /debug/mp/collect
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Purchase z serwera – dla zamówień, przy których przeglądarka nie wyśle zdarzenia: przelew tradycyjny
// (opłacany po wyjściu ze strony), zamówienia z panelu i płatności potwierdzone ręcznie.
// GA4_SERVER_PURCHASE=all → wysyłaj dla wszystkich (GA4 scala zakupy o tym samym transaction_id).
export function shouldSendServerPurchase(env: Env, o: { source?: string | null; payment_provider?: string | null }, byAdmin: boolean) {
  if (!ga4MpConfigured(env) || o.source === 'woocommerce') return false;
  if (env.GA4_SERVER_PURCHASE === 'all') return true;
  return byAdmin || o.source === 'admin' || o.payment_provider === 'bank_transfer';
}

export async function sendGa4Purchase(env: Env, o: {
  id: string; total: number; shipping_cost?: number | null; discount_code?: string | null; attribution?: GaIds | null;
  items: { product_id: string | null; name: string; qty: number; unit_price: number; discount: number }[];
}): Promise<{ ok: boolean; error?: string }> {
  if (!ga4MpConfigured(env)) return { ok: false, error: 'brak GA4_MEASUREMENT_ID / GA4_API_SECRET' };
  const total = o.total / 100, shipping = (o.shipping_cost || 0) / 100;
  const productGross = total - shipping;
  const tax = Math.round((productGross - productGross / 1.23) * 100) / 100; // VAT 23% – jak na stronie podziękowania
  const clientId = o.attribution?.ga_client_id || `${Math.floor(Math.random() * 2 ** 31)}.${Math.floor(Date.now() / 1000)}`;
  const body = {
    client_id: clientId,
    non_personalized_ads: true,
    events: [{
      name: 'purchase',
      params: {
        transaction_id: o.id, currency: 'PLN', value: total, shipping, tax,
        ...(o.discount_code ? { coupon: o.discount_code } : {}),
        ...(o.attribution?.ga_session_id ? { session_id: o.attribution.ga_session_id } : {}),
        engagement_time_msec: 1,
        items: o.items.map((i) => ({
          item_id: i.product_id || i.name, item_name: i.name, price: i.unit_price / 100, quantity: i.qty,
          item_brand: 'Can-C', ...(i.discount ? { discount: i.discount / 100 } : {}),
        })),
      },
    }],
  };
  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(env.GA4_MEASUREMENT_ID!)}&api_secret=${encodeURIComponent(env.GA4_API_SECRET!)}`;
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
