import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';
import { getAutomationSettings, findCandidates, runTreatmentReminders, AUTOMATION_DEFAULTS } from '../../../lib/automations';
import { getReviewRequestSettings, findReviewCandidates, runReviewRequests, REVIEW_REQUEST_DEFAULTS } from '../../../lib/review-requests';

export const prerender = false;

// Ustawienia automatu + podgląd, kto dziś dostałby przypomnienie + historia wysyłek
export const GET: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  try {
    const settings = await getAutomationSettings(env);
    const candidates = await findCandidates(env, settings);
    const history = await db(env).select('reminders?select=sent_at,code,customers(email,first_name,last_name)&kind=eq.treatment&order=sent_at.desc&limit=30');
    // Prośby o opinię
    const rs = await getReviewRequestSettings(env);
    const rc = await findReviewCandidates(env, rs).catch(() => []);
    const rHistory = await db(env).select<any>('reminders?select=sent_at,order_id,customers(email,first_name,last_name)&kind=eq.review&order=sent_at.desc&limit=30').catch(() => []);
    const rStats = await db(env).select<any>('reviews?select=id,status&verified_purchase=is.true&source=eq.shop&limit=10000').catch(() => []);
    return json(200, {
      settings, candidates: candidates.slice(0, 100), total: candidates.length, history, cronReady: Boolean(env.CRON_SECRET && env.CRON_SECRET.length >= 24),
      reviews: {
        settings: rs, total: rc.length, history: rHistory,
        candidates: rc.slice(0, 50).map((o) => ({ number: o.number, email: o.email, shipped_at: o.shipped_at, items: o.order_items.map((i) => i.name) })),
        stats: { sentTotal: rHistory.length, verifiedReviews: rStats.length, pending: rStats.filter((r: any) => r.status === 'pending').length },
      },
    });
  } catch (e) {
    console.error('Admin automaty: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd. Czy uruchomiono skrypt 009_automaty_zamowienia_reczne.sql?' });
  }
};

// { action: 'save', ...ustawienia } | { action: 'run' } - wysłanie teraz
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  try {
    if (b.action === 'reviews_save') {
      const n = (v: unknown, min: number, max: number, d: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d; };
      const value = {
        enabled: b.enabled === true,
        daysAfter: n(b.daysAfter, 3, 60, REVIEW_REQUEST_DEFAULTS.daysAfter),
        consentOnly: b.consentOnly !== false,
        maxPerRun: n(b.maxPerRun, 1, 200, REVIEW_REQUEST_DEFAULTS.maxPerRun),
      };
      await db(env).upsert('settings', { key: 'review_requests', value, updated_at: new Date().toISOString(), updated_by: admin }, 'key', 'key');
      return json(200, { settings: value });
    }
    if (b.action === 'reviews_run') {
      const r = await runReviewRequests(env, new URL(request.url).origin, { force: true });
      console.log(`Admin ${admin} uruchomił prośby o opinię ręcznie`);
      return json(200, r);
    }
    if (b.action === 'run') {
      if (!env.CRON_SECRET) return json(422, { error: 'Brak sekretu CRON_SECRET - potrzebny do linków „wypisz się”.' });
      const r = await runTreatmentReminders(env, new URL(request.url).origin, { force: true });
      console.log(`Admin ${admin} uruchomił przypomnienia ręcznie`);
      return json(200, r);
    }
    const n = (v: unknown, min: number, max: number, d: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : d; };
    const value = {
      enabled: b.enabled === true,
      daysBefore: n(b.daysBefore, 1, 30, AUTOMATION_DEFAULTS.daysBefore),
      regularCodePercent: n(b.regularCodePercent, 0, 50, AUTOMATION_DEFAULTS.regularCodePercent),
      codeValidDays: n(b.codeValidDays, 1, 90, AUTOMATION_DEFAULTS.codeValidDays),
      maxPerRun: n(b.maxPerRun, 1, 200, AUTOMATION_DEFAULTS.maxPerRun),
    };
    await db(env).upsert('settings', { key: 'automations', value, updated_at: new Date().toISOString(), updated_by: admin }, 'key', 'key');
    return json(200, { settings: value });
  } catch (e) {
    console.error('Admin automaty zapis: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd zapisu.' });
  }
};
