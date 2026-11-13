// Przekierowania 301/302 i dziennik 404 (panel: SEO → Przekierowania; tabele z migracji 017).
import type { Env } from './env';
import { db } from './supabase';

export type Redirect = { id: string; from_path: string; to_url: string; code: number };

// Klucz porównania: małe litery, odkodowane znaki, bez ukośnika na końcu (poza „/”), parametry - dokładnie jak podane
export function normPath(pathWithQuery: string): string {
  let [path, query = ''] = pathWithQuery.split(/\?(.*)/s);
  try { path = decodeURIComponent(path); } catch { /* zostaje jak jest */ }
  path = path.trim().toLowerCase().replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return query ? `${path}?${query}` : path;
}

let cache: { at: number; map: Map<string, Redirect> } | null = null;

export async function loadRedirects(env: Env): Promise<Map<string, Redirect>> {
  if (cache && Date.now() - cache.at < 60_000) return cache.map;
  try {
    const rows = await db(env).select<Redirect>('redirects?select=id,from_path,to_url,code&limit=10000');
    cache = { at: Date.now(), map: new Map(rows.map((r) => [normPath(r.from_path), r])) };
  } catch (e) {
    // Tabela jeszcze nie istnieje (przed migracją 017) albo baza niedostępna - sklep działa bez przekierowań
    console.error('Przekierowania: ' + (e instanceof Error ? e.message : String(e)));
    cache = { at: Date.now(), map: new Map() };
  }
  return cache.map;
}
export const clearRedirectsCache = () => { cache = null; };

// Najpierw adres z parametrami (stare linki WordPressa typu /?p=123), potem sama ścieżka
export async function matchRedirect(env: Env, pathname: string, search: string): Promise<{ r: Redirect; keepQuery: boolean } | null> {
  const map = await loadRedirects(env);
  if (!map.size) return null;
  if (search) {
    const withQuery = map.get(normPath(pathname + search));
    if (withQuery) return { r: withQuery, keepQuery: false };
  }
  const r = map.get(normPath(pathname));
  return r ? { r, keepQuery: true } : null;
}

// Docelowy adres: parametry z oryginalnego linku (np. utm_*) przenosimy, jeśli cel nie ma własnych
export function targetUrl(to: string, search: string, keepQuery: boolean): string {
  if (!keepQuery || !search || to.includes('?')) return to;
  const [base, hash = ''] = to.split('#');
  return `${base}${search}${hash ? '#' + hash : ''}`;
}

// Skanery i automaty (nie ma czego przekierowywać - nie zaśmiecamy dziennika)
const PROBE = /(\.(php\d?|aspx?|jsp|cgi|env|ini|sql|bak|old|swp|log|git|ds_store|yml|yaml|toml|config)$)|^\/(wp-admin|wp-login|wp-includes|wp-json|xmlrpc|cgi-bin|phpmyadmin|pma|vendor|\.git|\.env|\.aws|\.vscode|autodiscover|actuator|boaform|owa|ecp)(\/|$)|^\/(apple-touch-icon[^/]*|browserconfig\.xml|ads\.txt|app-ads\.txt)$/i;
export const isProbe = (path: string) => PROBE.test(path);

export async function logNotFound(env: Env, path: string, referrer: string | null, ua: string | null) {
  await db(env).rpc('log_not_found', { p_path: path, p_ref: referrer || null, p_ua: ua || null });
}
export async function countRedirectHit(env: Env, id: string) {
  await db(env).rpc('redirect_hit', { p_id: id });
}
