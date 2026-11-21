import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { runTreatmentReminders } from '../../../lib/automations';
import { runReviewRequests } from '../../../lib/review-requests';
import { syncIfirma } from '../../../lib/ifirma';
import { purgeOldSpam } from '../../../lib/mailbox';
import { db } from '../../../lib/supabase';

export const prerender = false;

// Wywoływane codziennie przez Supabase pg_cron (pg_net) z nagłówkiem Authorization: Bearer CRON_SECRET
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const secret = env.CRON_SECRET || '';
  const got = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (secret.length < 24 || got !== secret) return json(401, { error: 'Unauthorized' });
  try {
    const origin = new URL(request.url).origin;
    // Jeden codzienny cron: przypomnienia o kuracji + prośby o opinię (każdy automat ma własny włącznik w panelu)
    const treatment = await runTreatmentReminders(env, origin);
    const reviews = await runReviewRequests(env, origin).catch((e) => ({ sent: 0, error: e instanceof Error ? e.message : String(e) }));
    // ifirma: dosłanie brakujących i zmian zrobionych przez bazę (automatyczne anulowanie, „zrealizowane”)
    const ifirma = await syncIfirma(env, db(env), { days: 30, by: 'cron' }).catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
    // Porządki: spam starszy niż 30 dni, przejrzane błędy starsze niż 30 dni, wszystkie błędy starsze niż 90 dni
    const sb = db(env);
    const spam = await purgeOldSpam(env, sb, 30).catch((e) => { console.error('Poczta: czyszczenie spamu - ' + (e instanceof Error ? e.message : String(e))); return 0; });
    const d30 = new Date(Date.now() - 30 * 864e5).toISOString(), d90 = new Date(Date.now() - 90 * 864e5).toISOString();
    await sb.remove(`error_log?resolved_at=lt.${encodeURIComponent(d30)}`).catch(() => {});
    await sb.remove(`error_log?last_seen=lt.${encodeURIComponent(d90)}`).catch(() => {});
    return json(200, { ...treatment, reviews, ifirma, spamDeleted: spam });
  } catch (e) {
    console.error('Cron przypomnienia: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'error' });
  }
};
