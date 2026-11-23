// Podsumowanie opinii do modułów (np. panel boczny FAQ): średnia, liczba i jeden krótki cytat.
// Cytat: najnowsza opinia 5★ o długości do 140 znaków, najlepiej ze zweryfikowanym zakupem,
// bez obietnic leczenia (zaćma, wzrok, leczenie, operacja…) - to treść publikowana przez sklep.
import type { Env } from './env';
import { db } from './supabase';
import { testReviewsFilter } from './catalog';

const RISKY = /(zaćm|zacm|katarakt|zmętn|wzrok|widzeni|lecz|operacj|choro|terapi|cud|magiczn|odzyska)/i;
let cache: { at: number; v: ReviewSummary | null } | null = null;

export type ReviewSummary = { avg: number; count: number; quote: { body: string; author: string; verified: boolean; product: string } | null };

export async function getReviewSummary(env: Env): Promise<ReviewSummary | null> {
  if (cache && Date.now() - cache.at < 300_000) return cache.v;
  try {
    const sb = db(env);
    const f = testReviewsFilter(env);
    const [all, recent] = await Promise.all([
      sb.select<{ rating: number }>(`reviews?select=rating&status=eq.approved${f}&limit=10000`),
      sb.select<any>(`reviews?select=author_name,body,rating,verified_purchase,product_id,created_at&status=eq.approved&rating=eq.5${f}&order=created_at.desc&limit=60`),
    ]);
    if (!all.length) { cache = { at: Date.now(), v: null }; return null; }
    const avg = Math.round((all.reduce((s, r) => s + r.rating, 0) / all.length) * 10) / 10;
    const ok = recent.filter((r: any) => r.body && r.body.length >= 30 && r.body.length <= 140 && !RISKY.test(r.body));
    const pick = ok.find((r: any) => r.verified_purchase) ?? ok[0] ?? null;
    const v: ReviewSummary = {
      avg, count: all.length,
      quote: pick ? { body: String(pick.body).trim(), author: String(pick.author_name || 'Klient').split(/\s+/).slice(0, 2).join(' '), verified: Boolean(pick.verified_purchase), product: pick.product_id } : null,
    };
    cache = { at: Date.now(), v };
    return v;
  } catch (e) {
    console.error('Podsumowanie opinii: ' + (e instanceof Error ? e.message : String(e)));
    return null;
  }
}
