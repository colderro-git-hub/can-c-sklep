// GA4 Data API - integracja przez Service Account (JWT + OAuth2).
// Cloudflare Workers obsługuje SubtleCrypto natywnie - bez zewnętrznych bibliotek.
import type { Env } from './env';

const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const GA4_API = 'https://analyticsdata.googleapis.com/v1beta';

// Cache tokenu w pamięci izolatu (max 55 min, Google wystawia na 60)
let tokenCache: { token: string; exp: number } | null = null;

async function getAccessToken(env: Env): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.token;

  const rawKey = env.GA4_PRIVATE_KEY || '';
  const email = env.GA4_CLIENT_EMAIL;
  if (!rawKey || !email) throw new Error('Brak konfiguracji GA4 (GA4_PRIVATE_KEY, GA4_CLIENT_EMAIL).');
  // Obsługuje dwa formaty: dosłowne \n (Cloudflare Secret) i prawdziwe nowe linie (plik JSON)
  const key = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;

  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const payload = btoa(JSON.stringify({
    iss: email, scope: GA4_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  })).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');

  const data = `${header}.${payload}`;

  // Import klucza PEM RSA
  const pem = key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      'pkcs8', der.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign'],
    );
  } catch (e) {
    throw new Error('GA4: błąd importu klucza RSA. Sprawdź czy GA4_PRIVATE_KEY zawiera pełny klucz PEM z nagłówkami BEGIN/END PRIVATE KEY. Błąd: ' + (e instanceof Error ? e.message : String(e)));
  }

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(data),
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const jwt = `${data}.${sigB64}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const json: any = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`GA4 OAuth: ${json.error_description || json.error || res.status}`);

  tokenCache = { token: json.access_token, exp: (now + 3550) * 1000 };
  return json.access_token;
}

// Uruchom raport GA4 Data API
async function runReport(env: Env, body: object): Promise<any> {
  const pid = env.GA4_PROPERTY_ID;
  if (!pid) throw new Error('Brak GA4_PROPERTY_ID.');
  const token = await getAccessToken(env);
  const res = await fetch(`${GA4_API}/properties/${pid}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json() as any;
  if (!res.ok) throw new Error(`GA4 API: ${json.error?.message || res.status}`);
  return json;
}

// Spłaszcz wynik GA4 do prostego obiektu {wymiar: metryka}
function flatRows(report: any): Record<string, number> {
  const out: Record<string, number> = {};
  if (!report?.rows) return out;
  for (const row of report.rows) {
    const dim = row.dimensionValues?.[0]?.value || 'total';
    const val = Number(row.metricValues?.[0]?.value || 0);
    out[dim] = (out[dim] || 0) + val;
  }
  return out;
}

function totalRows(report: any): number {
  return (report?.rows || []).reduce((s: number, r: any) => s + Number(r.metricValues?.[0]?.value || 0), 0);
}

export type GA4Stats = {
  // Produkty i koszyk
  view_item_list: number; select_item: number; view_item: number;
  add_to_cart: number; remove_from_cart: number; view_cart: number;
  // Proces zamówienia
  begin_checkout: number; add_shipping_info: number; add_payment_info: number;
  purchase: number; refund: number;
  // Konto
  sign_up: number; login: number;
  // Formularze
  form_start: number; form_field_click: number; form_field_error: number; form_submit: number;
  // Ruch
  sessions: number; users: number; newUsers: number; bounceRate: number;
  // Pola formularza - top błędy i kliknięcia
  topFieldClicks: { field: string; count: number }[];
  topFieldErrors: { field: string; count: number }[];
  // Lejek
  funnelRates: { step: string; count: number; rate: number }[];
};

export async function getGA4Stats(env: Env, days = 30): Promise<GA4Stats> {
  const dateRange = { startDate: `${days}daysAgo`, endDate: 'today' };

  // 1. Zdarzenia e-commerce i inne - jedna metryka eventCount per nazwa zdarzenia
  const [eventsReport, sessionReport, fieldClicksReport, fieldErrorsReport] = await Promise.all([
    runReport(env, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: [
        'view_item_list','select_item','view_item','add_to_cart','remove_from_cart','view_cart',
        'begin_checkout','add_shipping_info','add_payment_info','purchase','refund',
        'sign_up','login','form_start','form_field_click','form_field_error','form_submit',
      ]}}},
      limit: 50,
    }),
    runReport(env, {
      dateRanges: [dateRange],
      metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'newUsers' }, { name: 'bounceRate' }],
      limit: 1,
    }),
    // Top pola formularza - kliknięcia (field_name wymiar)
    runReport(env, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'customEvent:field_name' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'form_field_click' }}},
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 10,
    }).catch(() => null),
    // Top pola formularza - błędy
    runReport(env, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'customEvent:field_name' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'form_field_error' }}},
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 10,
    }).catch(() => null),
  ]);

  const ev = flatRows(eventsReport);
  const sess = sessionReport?.rows?.[0];
  const sessions = Number(sess?.metricValues?.[0]?.value || 0);
  const users = Number(sess?.metricValues?.[1]?.value || 0);
  const newUsers = Number(sess?.metricValues?.[2]?.value || 0);
  const bounceRate = Math.round(Number(sess?.metricValues?.[3]?.value || 0) * 100) / 100;

  const topFieldClicks = (fieldClicksReport?.rows || []).map((r: any) => ({
    field: r.dimensionValues?.[0]?.value || '?',
    count: Number(r.metricValues?.[0]?.value || 0),
  }));
  const topFieldErrors = (fieldErrorsReport?.rows || []).map((r: any) => ({
    field: r.dimensionValues?.[0]?.value || '?',
    count: Number(r.metricValues?.[0]?.value || 0),
  }));

  // Lejek konwersji z % względem view_item
  const funnelSteps = [
    { step: 'Wyświetlenie produktu', count: ev['view_item'] || 0 },
    { step: 'Dodanie do koszyka', count: ev['add_to_cart'] || 0 },
    { step: 'Rozpoczęcie zamówienia', count: ev['begin_checkout'] || 0 },
    { step: 'Zakup', count: ev['purchase'] || 0 },
  ];
  const funnelBase = funnelSteps[0].count || 1;
  const funnelRates = funnelSteps.map(s => ({ ...s, rate: Math.round((s.count / funnelBase) * 1000) / 10 }));

  return {
    view_item_list: ev['view_item_list'] || 0,
    select_item: ev['select_item'] || 0,
    view_item: ev['view_item'] || 0,
    add_to_cart: ev['add_to_cart'] || 0,
    remove_from_cart: ev['remove_from_cart'] || 0,
    view_cart: ev['view_cart'] || 0,
    begin_checkout: ev['begin_checkout'] || 0,
    add_shipping_info: ev['add_shipping_info'] || 0,
    add_payment_info: ev['add_payment_info'] || 0,
    purchase: ev['purchase'] || 0,
    refund: ev['refund'] || 0,
    sign_up: ev['sign_up'] || 0,
    login: ev['login'] || 0,
    form_start: ev['form_start'] || 0,
    form_field_click: ev['form_field_click'] || 0,
    form_field_error: ev['form_field_error'] || 0,
    form_submit: ev['form_submit'] || 0,
    sessions, users, newUsers, bounceRate,
    topFieldClicks, topFieldErrors, funnelRates,
  };
}
