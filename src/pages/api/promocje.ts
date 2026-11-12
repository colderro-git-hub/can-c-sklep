import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/env';
import { getPublicPromotions } from '../../lib/promotions-db';

export const prerender = false;

// Aktywne promocje dla koszyka i formularza zamówienia (podgląd ceny – kwotę do zapłaty i tak liczy serwer)
export const GET: APIRoute = async ({ locals }) => {
  const rows = await getPublicPromotions(await getEnv(locals)).catch(() => []);
  const body = rows.map(({ id, name, label, kind, active, starts_at, ends_at, product_ids, combined, tiers, items, type, value, max_sets, with_codes, sort_order, code }) =>
    ({ code, id, name, label, kind, active, starts_at, ends_at, product_ids, combined, tiers, items, type, value, max_sets, with_codes, sort_order }));
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' } });
};
