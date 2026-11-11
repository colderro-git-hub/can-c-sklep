// Promocje z bazy (tabela promotions) – krótka pamięć w izolacie, czyszczona po zapisie w panelu.
import type { Env } from './env';
import { db } from './supabase';
import { normalizePromotion, promoActive, type Promotion } from './promotions';

let cache: { at: number; rows: Promotion[] } | null = null;

// Wszystkie promocje (też wyłączone i przyszłe) – filtr aktywności robi silnik w chwili liczenia
export async function getPromotions(env: Env): Promise<Promotion[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.rows;
  try {
    const rows = await db(env).select<any>('promotions?select=*&order=sort_order.asc,created_at.asc');
    cache = { at: Date.now(), rows: rows.map(normalizePromotion) };
    return cache.rows;
  } catch (e) {
    // Brak tabeli (migracja 019 nie uruchomiona) albo błąd bazy – sklep działa bez promocji
    console.error('Promocje: ' + (e instanceof Error ? e.message : String(e)));
    return cache?.rows ?? [];
  }
}

// Tylko to, co klient może zobaczyć: aktywne teraz albo zaplanowane (bez nazw wewnętrznych i statystyk)
export async function getPublicPromotions(env: Env): Promise<Promotion[]> {
  const now = Date.now();
  return (await getPromotions(env))
    .filter((p) => p.active && (!p.ends_at || new Date(p.ends_at).getTime() > now))
    .map((p) => ({ ...p, name: p.label || p.name }))
    .filter((p) => promoActive(p, now) || (p.starts_at && new Date(p.starts_at).getTime() > now));
}

export const clearPromotionsCache = () => { cache = null; };
