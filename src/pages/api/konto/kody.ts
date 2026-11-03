import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireCustomer } from '../../../lib/user-auth';

export const prerender = false;

// Kody rabatowe dostępne dla klienta: przypisane do niego oraz ogólne oznaczone jako widoczne na koncie
export const GET: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const c = await requireCustomer(request, env);
  if (!c) return json(401, { error: 'Zaloguj się ponownie.' });
  try {
    const sb = db(env);
    const now = new Date().toISOString();
    const rows = await sb.select<any>(
      `discount_codes?select=id,code,type,value,min_total,ends_at,max_uses,used_count,once_per_customer,description,customer_id` +
        `&active=eq.true&and=(` +
        `or(customer_id.eq.${c.id},and(customer_id.is.null,description.not.is.null)),` +
        `or(ends_at.is.null,ends_at.gt.${encodeURIComponent(`"${now}"`)}),` +
        `or(starts_at.is.null,starts_at.lte.${encodeURIComponent(`"${now}"`)}))`,
    );
    const uses = await sb.select<{ code_id: string }>(`discount_code_uses?select=code_id&customer_id=eq.${c.id}`);
    const usedIds = new Set(uses.map((u) => u.code_id));
    const out = rows
      .filter((r) => (r.max_uses === null || r.used_count < r.max_uses) && !(r.once_per_customer && usedIds.has(r.id)))
      .map(({ code, type, value, min_total, ends_at, description, customer_id }) => ({ code, type, value, min_total, ends_at, description, personal: Boolean(customer_id) }));
    return json(200, { codes: out });
  } catch (e) {
    console.error('Kody klienta: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd serwera.' });
  }
};
