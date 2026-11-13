import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { runTreatmentReminders } from '../../../lib/automations';
import { runReviewRequests } from '../../../lib/review-requests';

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
    return json(200, { ...treatment, reviews });
  } catch (e) {
    console.error('Cron przypomnienia: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'error' });
  }
};
