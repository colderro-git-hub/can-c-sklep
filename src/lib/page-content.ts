// Treści edytowalne stron frontendu (CMS).
// Pobiera z tabeli page_content i cache'uje w pamięci izolatu przez 60 s.
import type { Env } from './env';
import { db } from './supabase';

export type PageKey = 'home' | 'faq' | 'about' | 'how_to_use' | 'footer' | 'product';

type Row = { key: string; page: string; section: string; sort_order: number; data: Record<string, unknown>; en?: boolean };

// Wersja angielska sekcji to osobny wiersz „<klucz>@en”. Puste pola EN = tekst polski;
// widoczność (__hidden), rozmiary (__sizes), liczby i przełączniki zawsze z wersji polskiej.
export const EN_SUFFIX = '@en';
const filled = (v: unknown) => (typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.some((x) => (typeof x === 'string' ? x.trim() !== '' : x != null)) : false);
export function mergeEn(pl: Record<string, unknown>, en: Record<string, unknown> | undefined) {
  if (!en) return pl;
  const out: Record<string, unknown> = { ...pl };
  for (const [k, v] of Object.entries(en)) if (!k.startsWith('__') && filled(v)) out[k] = v;
  return out;
}
function forLang(rows: Row[], lang: 'pl' | 'en'): Row[] {
  const base = rows.filter((r) => !r.key.endsWith(EN_SUFFIX));
  if (lang !== 'en') return base;
  const en = new Map(rows.filter((r) => r.key.endsWith(EN_SUFFIX)).map((r) => [r.key.slice(0, -EN_SUFFIX.length), r.data]));
  return base.map((r) => (en.has(r.key) ? { ...r, data: mergeEn(r.data, en.get(r.key)), en: true } : r));
}

const cache = new Map<PageKey, { at: number; rows: Row[] }>();
const TTL = 60_000;

export async function getPageContent(env: Env, page: PageKey, lang: 'pl' | 'en' = 'pl'): Promise<Row[]> {
  // Bez SUPABASE_URL nie ma sensu próbować - zwracamy puste (strony użyją fallbacku z kodu)
  if (!env?.SUPABASE_URL) return forLang(cache.get(page)?.rows ?? [], lang);
  const hit = cache.get(page);
  if (hit && Date.now() - hit.at < TTL) return forLang(hit.rows, lang);
  try {
    const rows = await db(env).select<Row>(
      `page_content?select=key,page,section,sort_order,data&page=eq.${page}&order=sort_order.asc`,
    );
    cache.set(page, { at: Date.now(), rows });
    return forLang(rows, lang);
  } catch (e) {
    console.error(`page_content(${page}): ${e instanceof Error ? e.message : String(e)}`);
    return forLang(hit?.rows ?? [], lang); // stary cache albo puste przy zimnym starcie
  }
}

// Pojedynczy wiersz po kluczu
export function getSection<T = Record<string, unknown>>(rows: Row[], key: string): T | null {
  const row = rows.find((r) => r.key === key);
  return row ? (row.data as T) : null;
}

// Wszystkie wiersze o danym section, posortowane
export function getSections<T = Record<string, unknown>>(rows: Row[], section: string): T[] {
  return rows.filter((r) => r.section === section).map((r) => r.data as T);
}

export function clearPageCache(page?: PageKey) {
  if (page) cache.delete(page);
  else cache.clear();
}

// Tokeny {company}, {hours}, {email} itp. zastępowane danymi sklepu
export function applyTokens(text: string, tokens: Record<string, string>): string {
  return Object.entries(tokens).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, v), text);
}

// ---------- Ustawienia sekcji z panelu (/admin → Strony) ----------
// data.__hidden = true → sekcja wyłączona; data.__sizes = { pole: px } → własny rozmiar tekstu.
export const visible = (data: unknown) => !(data && typeof data === 'object' && (data as any).__hidden === true);

// Styl rozmiaru tekstu dla pola. Duże rozmiary (nagłówki) skalują się z szerokością ekranu,
// żeby na telefonie nie rozsadzały układu: clamp(min, vw, wartość z panelu).
export function fs(data: unknown, field: string, extra = ''): string | undefined {
  const n = Number((data as any)?.__sizes?.[field]);
  const own = !n || n < 8 || n > 200
    ? ''
    : n >= 28
      ? `font-size:clamp(${Math.round(Math.max(22, n * 0.5))}px,${(n / 14.4).toFixed(2)}vw,${n}px);line-height:1.12`
      : `font-size:${n}px;line-height:1.55`;
  const style = [extra.replace(/;\s*$/, ''), own].filter(Boolean).join(';');
  return style || undefined;
}
