// Automat przypomnień o końcu kuracji + podpisane linki „wypisz się”.
import type { Env } from './env';
import { db } from './supabase';
import { sendMail } from './mail';
import { getSite } from './site-settings';
import { treatmentReminderHtml } from './email-templates';

export const AUTOMATION_DEFAULTS = {
  enabled: false,          // automat wyłączony, dopóki nie włączysz go w panelu
  daysBefore: 7,           // ile dni przed końcem zapasu wysłać przypomnienie
  regularCodePercent: 10,  // rabat dla stałych klientów (2+ zamówienia); 0 = bez kodu
  codeValidDays: 14,
  maxPerRun: 50,           // limit maili na jedno uruchomienie
};
export type AutomationSettings = typeof AUTOMATION_DEFAULTS;

export async function getAutomationSettings(env: Env): Promise<AutomationSettings> {
  try {
    const [row] = await db(env).select<{ value: Partial<AutomationSettings> }>('settings?select=value&key=eq.automations');
    return { ...AUTOMATION_DEFAULTS, ...(row?.value ?? {}) };
  } catch { return AUTOMATION_DEFAULTS; }
}

// ---------- Podpis linku wypisania (HMAC-SHA256) ----------
async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
// Podpis dowolnych danych (np. link potwierdzenia newslettera)
export const signToken = (env: Env, data: string) => hmac(env.CRON_SECRET || '', data);
export const unsubscribeToken = (env: Env, customerId: string) => hmac(env.CRON_SECRET || '', `unsub:${customerId}`);
export async function unsubscribeUrl(env: Env, origin: string, customerId: string) {
  return `${origin}/api/wypisz?c=${customerId}&t=${await unsubscribeToken(env, customerId)}`;
}

type Candidate = { id: string; email: string; first_name: string | null; orders_count: number; last_order_packs: number; treatment_end_at: string };

// Kto dziś dostałby przypomnienie (bez wysyłki)
export async function findCandidates(env: Env, s: AutomationSettings) {
  const sb = db(env);
  const now = Date.now();
  const from = new Date(now - 14 * 864e5).toISOString();               // nie starsze niż 2 tygodnie po końcu
  const to = new Date(now + s.daysBefore * 864e5).toISOString();        // koniec w ciągu X dni
  const rows = await sb.select<Candidate & { id: string }>(
    `customer_stats?select=id,email,first_name,orders_count,last_order_packs,treatment_end_at` +
      `&marketing_consent=is.true&treatment_end_at=gte.${encodeURIComponent(from)}&treatment_end_at=lte.${encodeURIComponent(to)}&order=treatment_end_at.asc&limit=500`,
  );
  if (!rows.length) return [];
  // Ostatnie opłacone zamówienie każdego kandydata i czy przypomnienie już wysłano
  const ids = rows.map((r) => r.id).join(',');
  const lastOrders = await sb.select<{ id: string; customer_id: string; created_at: string }>(
    `orders?select=id,customer_id,created_at&customer_id=in.(${ids})&status=in.(paid,packing,shipped,completed)&order=created_at.desc&limit=2000`,
  );
  const lastByCustomer = new Map<string, string>();
  for (const o of lastOrders) if (!lastByCustomer.has(o.customer_id)) lastByCustomer.set(o.customer_id, o.id);
  const sent = await sb.select<{ customer_id: string; order_id: string }>(`reminders?select=customer_id,order_id&customer_id=in.(${ids})&kind=eq.treatment`);
  const sentSet = new Set(sent.map((r) => `${r.customer_id}:${r.order_id}`));
  return rows
    .map((r) => ({ ...r, order_id: lastByCustomer.get(r.id)! }))
    .filter((r) => r.order_id && !sentSet.has(`${r.id}:${r.order_id}`));
}

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (name: string | null) => {
  const base = String(name || 'KURACJA').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/gi, 'L').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10) || 'KURACJA';
  return `${base}-${Array.from(crypto.getRandomValues(new Uint8Array(4)), (x) => alphabet[x % alphabet.length]).join('')}`;
};

// Wysyłka przypomnień
export async function runTreatmentReminders(env: Env, origin: string, opts: { force?: boolean } = {}) {
  const s = await getAutomationSettings(env);
  if (!s.enabled && !opts.force) return { sent: 0, skipped: 'Automat jest wyłączony.' };
  const sb = db(env);
  const site = await getSite(env);
  const list = (await findCandidates(env, s)).slice(0, s.maxPerRun);
  let sent = 0;
  const errors: string[] = [];

  for (const c of list) {
    try {
      // Rezerwujemy wpis przed wysyłką - chroni przed podwójnym mailem przy równoległym uruchomieniu
      const [reserved] = await sb.insert<{ id: number }>('reminders', { customer_id: c.id, order_id: c.order_id, kind: 'treatment' }, 'id').catch(() => [] as any);
      if (!reserved) continue;

      let code: string | null = null;
      if (s.regularCodePercent > 0 && c.orders_count >= 2) {
        code = randomCode(c.first_name);
        const ends_at = new Date(Date.now() + s.codeValidDays * 864e5).toISOString();
        await sb.insert('discount_codes', { code, type: 'percent', value: s.regularCodePercent, max_uses: 1, once_per_customer: true, customer_id: c.id, ends_at, description: 'Rabat na kolejną kurację' }, 'id');
        await sb.update(`reminders?id=eq.${reserved.id}`, { code }, 'id');
      }

      const days = Math.round((new Date(c.treatment_end_at).getTime() - Date.now()) / 864e5);
      const unsub = await unsubscribeUrl(env, origin, c.id);
      // „Zamów ponownie jednym kliknięciem”: koszyk z produktami z ostatniego zamówienia (+ kod, jeśli jest)
      const lastItems = await sb.select<{ product_id: string | null; qty: number }>(`order_items?select=product_id,qty&order_id=eq.${c.order_id}`).catch(() => []);
      const merged = new Map<string, number>();
      for (const i of lastItems) if (i.product_id) merged.set(i.product_id, (merged.get(i.product_id) ?? 0) + i.qty);
      if (!merged.size) merged.set('krople-can-c', c.last_order_packs >= 4 ? 4 : 2);
      const reorderUrl = `${origin}/koszyk/?dodaj=${[...merged].map(([slug, q]) => `${slug}:${q}`).join(',')}${code ? `&kod=${code}` : ''}&utm_source=przypomnienie&utm_medium=email&utm_campaign=koniec-kuracji`;
      await sendMail(env, {
        to: c.email,
        replyTo: env.CONTACT_TO?.split(',')[0]?.trim(),
        subject: days > 0 ? `Kończy Ci się zapas kropli Can-C` : `Czas na kolejne opakowanie kropli Can-C`,
        headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        html: treatmentReminderHtml({ site, origin, firstName: c.first_name, days, packs: c.last_order_packs, code, pct: s.regularCodePercent, validDays: s.codeValidDays, orderUrl: reorderUrl, unsubscribe: unsub }),
        text: [
          `Dzień dobry${c.first_name ? ` ${c.first_name}` : ''},`, '',
          days > 0
            ? `według naszych wyliczeń zapas kropli z ostatniego zamówienia (${c.last_order_packs} op.) skończy się za około ${days} ${days === 1 ? 'dzień' : 'dni'}.`
            : `według naszych wyliczeń zapas kropli z ostatniego zamówienia (${c.last_order_packs} op.) właśnie się skończył.`,
          'Żeby nie przerywać kuracji, zamów kolejne opakowania z wyprzedzeniem - wysyłamy ' + site.shippingTime + ', dostawa jest bezpłatna.', '',
          code ? `Dla stałych klientów mamy rabat ${s.regularCodePercent}% - Twój kod: ${code} (ważny ${s.codeValidDays} dni).` : '',
          code ? '' : '',
          `Zamów ponownie (ten sam zestaw${code ? ' z kodem' : ''}): ${reorderUrl}`, '',
          'Dłuższa kuracja = niższa cena za opakowanie (rabaty liczą się same w koszyku).', '',
          `Zespół Can-C · ${site.email}`, '',
          `Nie chcesz takich przypomnień? Wypisz się: ${unsub}`,
        ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n'),
      });
      sent++;
    } catch (e) {
      errors.push(`${c.email}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errors.length) console.error('Przypomnienia - błędy: ' + errors.join(' | '));
  console.log(`Przypomnienia o kuracji: wysłano ${sent} z ${list.length}`);
  return { sent, candidates: list.length, errors: errors.length };
}
