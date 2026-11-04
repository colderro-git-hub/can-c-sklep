// Integracja z Przelewy24 (REST API v1).
// Dokumentacja: https://developers.przelewy24.pl
import type { Env } from './env';

async function sha384(value: unknown) {
  const data = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest('SHA-384', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function p24Config(env: Env) {
  const { P24_MERCHANT_ID, P24_POS_ID, P24_CRC, P24_API_KEY } = env;
  if (!P24_MERCHANT_ID || !P24_CRC || !P24_API_KEY) throw new Error('Brak konfiguracji Przelewy24 (sekrety P24_*)');
  const merchantId = Number(P24_MERCHANT_ID);
  const posId = Number(P24_POS_ID || P24_MERCHANT_ID);
  const host = env.P24_SANDBOX === 'true' ? 'https://sandbox.przelewy24.pl' : 'https://secure.przelewy24.pl';
  return { merchantId, posId, crc: P24_CRC, apiKey: P24_API_KEY, host };
}

type Cfg = ReturnType<typeof p24Config>;

async function api(cfg: Cfg, method: string, path: string, body: unknown) {
  const res = await fetch(`${cfg.host}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(`${cfg.posId}:${cfg.apiKey}`)}` },
    body: JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`P24 ${path}: ${res.status} ${JSON.stringify(data)}`);
  return data;
}

// 1. Rejestracja transakcji → adres strony płatności
export async function registerTransaction(
  cfg: Cfg,
  t: { sessionId: string; amount: number; description: string; email: string; client: string; phone?: string; urlReturn: string; urlStatus: string; timeLimit?: number },
) {
  const sign = await sha384({ sessionId: t.sessionId, merchantId: cfg.merchantId, amount: t.amount, currency: 'PLN', crc: cfg.crc });
  const data = await api(cfg, 'POST', '/transaction/register', {
    merchantId: cfg.merchantId,
    posId: cfg.posId,
    sessionId: t.sessionId,
    amount: t.amount,
    currency: 'PLN',
    description: t.description,
    email: t.email,
    client: t.client,
    phone: t.phone,
    country: 'PL',
    language: 'pl',
    urlReturn: t.urlReturn,
    urlStatus: t.urlStatus,
    timeLimit: t.timeLimit ?? 30, // minuty; 0 = bez limitu (link wysyłany mailem)
    encoding: 'UTF-8',
    sign,
  });
  return `${cfg.host}/trnRequest/${data.data.token}`;
}

export type P24Notification = {
  merchantId: number; posId: number; sessionId: string; amount: number; originAmount: number;
  currency: string; orderId: number; methodId: number; statement: string; sign: string;
};

// 2. Sprawdzenie podpisu powiadomienia od P24
export async function isValidNotification(cfg: Cfg, n: P24Notification) {
  const expected = await sha384({
    merchantId: n.merchantId, posId: n.posId, sessionId: n.sessionId, amount: n.amount, originAmount: n.originAmount,
    currency: n.currency, orderId: n.orderId, methodId: n.methodId, statement: n.statement, crc: cfg.crc,
  });
  return expected === n.sign && n.merchantId === cfg.merchantId;
}

// 3. Potwierdzenie transakcji – bez tego P24 nie rozliczy płatności
export async function verifyTransaction(cfg: Cfg, v: { sessionId: string; orderId: number; amount: number }) {
  const sign = await sha384({ sessionId: v.sessionId, orderId: v.orderId, amount: v.amount, currency: 'PLN', crc: cfg.crc });
  const data = await api(cfg, 'PUT', '/transaction/verify', {
    merchantId: cfg.merchantId, posId: cfg.posId, sessionId: v.sessionId, amount: v.amount, currency: 'PLN', orderId: v.orderId, sign,
  });
  return data?.data?.status === 'success';
}

// 4. Dane transakcji po sessionId (do ręcznego sprawdzenia płatności z panelu)
// status: 0 – brak płatności, 1 – opłacona, czeka na weryfikację, 2 – opłacona i zweryfikowana, 3 – zwrócona
export async function getTransaction(cfg: Cfg, sessionId: string) {
  const res = await fetch(`${cfg.host}/api/v1/transaction/by/sessionId/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Basic ${btoa(`${cfg.posId}:${cfg.apiKey}`)}` },
  });
  if (res.status === 404) return null;
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`P24 transaction/by/sessionId: ${res.status} ${JSON.stringify(data)}`);
  return data.data as { orderId: number; sessionId: string; status: number; amount: number; currency: string; paymentMethod?: number };
}

// 5. Nazwy metod płatności (BLIK, karta, banki) – do podsumowania zamówienia.
// Lista zmienia się rzadko, więc trzymamy ją w pamięci izolatu przez 12 godzin.
let methodsCache: { at: number; host: string; map: Map<number, string> } | null = null;
export async function paymentMethodName(cfg: Cfg, methodId: number): Promise<string | null> {
  if (!Number.isInteger(methodId) || methodId <= 0) return null;
  if (!methodsCache || methodsCache.host !== cfg.host || Date.now() - methodsCache.at > 12 * 3600_000) {
    const res = await fetch(`${cfg.host}/api/v1/payment/methods/pl`, {
      headers: { Authorization: `Basic ${btoa(`${cfg.posId}:${cfg.apiKey}`)}` },
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data?.data)) throw new Error(`P24 payment/methods: ${res.status}`);
    methodsCache = { at: Date.now(), host: cfg.host, map: new Map(data.data.map((m: any) => [Number(m.id), String(m.name || '').trim()])) };
  }
  return methodsCache.map.get(methodId) || null;
}
