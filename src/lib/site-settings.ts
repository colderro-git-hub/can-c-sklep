// Dane sklepu (kontakt, firma) – z bazy, z zapasem w src/config.ts.
import type { Env } from './env';
import { db } from './supabase';
import { site as defaults } from '../config';

export type Site = typeof defaults;
export const SITE_KEYS = ['email', 'phone', 'hours', 'replyTime', 'facebook', 'company', 'address', 'nip', 'regon', 'returnsUrl'] as const;

let cache: { at: number; value: Site } | null = null;

export async function getSite(env: Env): Promise<Site> {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  try {
    const [row] = await db(env).select<{ value: Partial<Site> }>('settings?select=value&key=eq.site');
    const value = { ...defaults, ...(row?.value ?? {}) } as Site;
    cache = { at: Date.now(), value };
    return value;
  } catch (e) {
    console.error('Ustawienia: ' + (e instanceof Error ? e.message : String(e)));
    return defaults;
  }
}

export const clearSiteCache = () => { cache = null; };
