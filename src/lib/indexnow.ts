// IndexNow (indexnow.org): natychmiastowe powiadamianie wyszukiwarek o nowych i zmienionych adresach.
// Obsługują go Bing (a przez niego Copilot i wyszukiwarka ChatGPT), Yandex, Seznam, Naver. Google – nie (mapa strony w Search Console).
import type { Env } from './env';
import { db } from './supabase';
import { getCatalog } from './catalog';
import { SEO_PAGES, clearSeoCache, type IndexNowLog } from './seo';

export const SITE_HOST = 'can-c.pl';
const ORIGIN = `https://${SITE_HOST}`;
export const newIndexNowKey = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

const STATUS: Record<number, string> = {
  200: 'Przyjęte', 202: 'Przyjęte – klucz w trakcie weryfikacji',
  400: 'Nieprawidłowe zgłoszenie', 403: 'Klucz nie został potwierdzony (plik klucza niedostępny na can-c.pl)',
  422: 'Adresy nie należą do can-c.pl', 429: 'Za dużo zgłoszeń – spróbuj później',
};

// Wszystkie indeksowane adresy: strony z treścią (bez „Nie indeksuj”) i aktywne produkty
export async function allUrls(env: Env, noindex: Set<string>): Promise<string[]> {
  const products = await getCatalog(env).catch(() => []);
  return [...SEO_PAGES.filter((p) => !noindex.has(p.path)).map((p) => ORIGIN + p.path), ...products.map((p) => `${ORIGIN}/produkt/${p.id}/`)];
}

async function readSeoRaw(env: Env): Promise<any> {
  const [row] = await db(env).select<{ value: any }>('settings?select=value&key=eq.seo');
  return row?.value ?? {};
}

// Zgłoszenie adresów. Automatyczne zgłoszenia są pomijane, gdy IndexNow wyłączony albo bez automatu.
export async function submitIndexNow(env: Env, rawUrls: string[], by: string, auto = false): Promise<{ ok: boolean; skipped?: string; status?: number; count?: number; message: string }> {
  const seo = await readSeoRaw(env);
  const cfg = seo.indexnow || {};
  if (!cfg.enabled || !cfg.key) return { ok: false, skipped: 'off', message: 'IndexNow jest wyłączony.' };
  if (auto && cfg.auto === false) return { ok: false, skipped: 'auto-off', message: 'Automatyczne zgłoszenia są wyłączone.' };
  const urls = [...new Set(rawUrls.map((u) => { try { const x = new URL(u, ORIGIN); return x.hostname.replace(/^www\./, '') === SITE_HOST ? `${ORIGIN}${x.pathname}${x.search}` : ''; } catch { return ''; } }).filter(Boolean))].slice(0, 10_000);
  if (!urls.length) return { ok: false, message: 'Brak adresów can-c.pl do zgłoszenia.' };

  let status = 0; let message = '';
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: SITE_HOST, key: cfg.key, keyLocation: `${ORIGIN}/${cfg.key}.txt`, urlList: urls }),
      signal: AbortSignal.timeout(8000),
    });
    status = res.status;
    message = STATUS[status] || `Odpowiedź ${status}`;
  } catch (e) {
    message = 'Brak połączenia z IndexNow: ' + (e instanceof Error ? e.message : String(e));
  }
  const ok = status === 200 || status === 202;

  // Dziennik ostatnich 20 zgłoszeń (zapis „na świeżo”, żeby nie nadpisać zmian z innych działów)
  try {
    const fresh = await readSeoRaw(env);
    const entry: IndexNowLog = { at: new Date().toISOString(), count: urls.length, status, ok, by, auto, message };
    const log = [entry, ...((fresh.indexnow?.log as IndexNowLog[]) || [])].slice(0, 20);
    await db(env).upsert('settings', { key: 'seo', value: { ...fresh, indexnow: { ...(fresh.indexnow || {}), log } }, updated_at: new Date().toISOString() }, 'key', 'key');
    clearSeoCache();
  } catch (e) { console.error('IndexNow – dziennik: ' + (e instanceof Error ? e.message : String(e))); }
  if (!ok) console.error(`IndexNow: ${message}`);
  return { ok, status, count: urls.length, message };
}
