// Treści edytowalne stron frontendu (CMS).
// Pobiera z tabeli page_content i cache'uje w pamięci izolatu przez 60 s.
import type { Env } from './env';
import { db } from './supabase';

export type PageKey = 'home' | 'faq' | 'about' | 'how_to_use' | 'footer';

type Row = { key: string; page: string; section: string; sort_order: number; data: Record<string, unknown> };

const cache = new Map<PageKey, { at: number; rows: Row[] }>();
const TTL = 60_000;

export async function getPageContent(env: Env, page: PageKey): Promise<Row[]> {
  const hit = cache.get(page);
  if (hit && Date.now() - hit.at < TTL) return hit.rows;
  try {
    const rows = await db(env).select<Row>(
      `page_content?select=key,page,section,sort_order,data&page=eq.${page}&order=sort_order.asc`,
    );
    cache.set(page, { at: Date.now(), rows });
    return rows;
  } catch (e) {
    console.error(`page_content(${page}): ${e instanceof Error ? e.message : String(e)}`);
    return hit?.rows ?? []; // stary cache albo puste przy zimnym starcie
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
