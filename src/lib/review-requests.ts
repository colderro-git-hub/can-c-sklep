// Automat „Prośba o opinię”: kilka dni po wysyłce mail z gwiazdkami przy każdym produkcie z zamówienia.
// Link zawiera podpis (HMAC) zamówienia i produktu - formularz oznacza opinię jako „Zweryfikowany zakup”.
import type { Env } from './env';
import { db } from './supabase';
import { sendMail } from './mail';
import { getSite } from './site-settings';
import { signToken, unsubscribeUrl } from './automations';
import { reviewRequestHtml } from './email-templates';

export const REVIEW_REQUEST_DEFAULTS = {
  enabled: false,     // wyłączony, dopóki nie włączysz w panelu
  daysAfter: 10,      // ile dni po wysyłce
  consentOnly: true,  // tylko klienci ze zgodą marketingową (bezpieczniej prawnie)
  maxPerRun: 50,
};
export type ReviewRequestSettings = typeof REVIEW_REQUEST_DEFAULTS;

export async function getReviewRequestSettings(env: Env): Promise<ReviewRequestSettings> {
  try {
    const [row] = await db(env).select<{ value: Partial<ReviewRequestSettings> }>('settings?select=value&key=eq.review_requests');
    return { ...REVIEW_REQUEST_DEFAULTS, ...(row?.value ?? {}) };
  } catch { return REVIEW_REQUEST_DEFAULTS; }
}

export const reviewToken = (env: Env, orderId: string, productId: string) => signToken(env, `review:${orderId}:${productId}`);
export async function verifyReviewToken(env: Env, orderId: string, productId: string, token: string) {
  return Boolean(env.CRON_SECRET && token && token === (await reviewToken(env, orderId, productId)));
}

type Cand = {
  id: string; number: number; email: string; customer_id: string; shipped_at: string;
  customers: { first_name: string | null; marketing_consent: boolean } | null;
  order_items: { product_id: string | null; name: string }[];
};

// Zamówienia wysłane X dni temu (okno 14 dni), bez wysłanej prośby, z produktami jeszcze nieocenionymi przez klienta
export async function findReviewCandidates(env: Env, s: ReviewRequestSettings) {
  const sb = db(env);
  const to = new Date(Date.now() - s.daysAfter * 864e5).toISOString();
  const from = new Date(Date.now() - (s.daysAfter + 14) * 864e5).toISOString();
  const rows = await sb.select<Cand>(
    `orders?select=id,number,email,customer_id,shipped_at,customers(first_name,marketing_consent),order_items(product_id,name)` +
      `&status=in.(shipped,completed)&source=in.(shop,admin)&customer_id=not.is.null` +
      `&shipped_at=gte.${encodeURIComponent(from)}&shipped_at=lte.${encodeURIComponent(to)}&order=shipped_at.asc&limit=500`,
  );
  const list = rows.filter((r) => !s.consentOnly || r.customers?.marketing_consent);
  if (!list.length) return [];
  const ids = [...new Set(list.map((r) => r.customer_id))].join(',');
  const [sent, reviewed] = await Promise.all([
    sb.select<{ order_id: string }>(`reminders?select=order_id&kind=eq.review&customer_id=in.(${ids})`),
    sb.select<{ customer_id: string; product_id: string }>(`reviews?select=customer_id,product_id&customer_id=in.(${ids})`),
  ]);
  const sentSet = new Set(sent.map((x) => x.order_id));
  const done = new Set(reviewed.map((x) => `${x.customer_id}:${x.product_id}`));
  return list
    .filter((r) => !sentSet.has(r.id))
    .map((r) => ({ ...r, order_items: [...new Map(r.order_items.filter((i) => i.product_id && !done.has(`${r.customer_id}:${i.product_id}`)).map((i) => [i.product_id, i])).values()] }))
    .filter((r) => r.order_items.length > 0);
}

export async function runReviewRequests(env: Env, origin: string, opts: { force?: boolean } = {}) {
  const s = await getReviewRequestSettings(env);
  if (!s.enabled && !opts.force) return { sent: 0, skipped: 'Automat jest wyłączony.' };
  if (!env.CRON_SECRET) return { sent: 0, skipped: 'Brak CRON_SECRET (podpis linków).' };
  const sb = db(env);
  const site = await getSite(env);
  const list = (await findReviewCandidates(env, s)).slice(0, s.maxPerRun);
  let sent = 0;
  const errors: string[] = [];
  for (const o of list) {
    try {
      // Rezerwacja przed wysyłką - bez podwójnych maili przy równoległym uruchomieniu
      const [reserved] = await sb.insert<{ id: number }>('reminders', { customer_id: o.customer_id, order_id: o.id, kind: 'review' }, 'id').catch(() => [] as any);
      if (!reserved) continue;
      const items = await Promise.all(o.order_items.map(async (i) => {
        const t = await reviewToken(env, o.id, i.product_id!);
        return { name: i.name, links: [1, 2, 3, 4, 5].map((n) => `${origin}/produkt/${i.product_id}/?o=${o.id}&t=${t}&ocena=${n}#opinia`) };
      }));
      const unsub = o.customers?.marketing_consent ? await unsubscribeUrl(env, origin, o.customer_id) : undefined;
      const firstName = o.customers?.first_name || null;
      await sendMail(env, {
        to: o.email,
        replyTo: env.CONTACT_TO?.split(',')[0]?.trim(),
        subject: 'Jak sprawdzają się krople Can-C? Oceń zakup',
        ...(unsub ? { headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
        html: reviewRequestHtml({ site, origin, firstName, number: o.number, items, unsubscribe: unsub }),
        text: [
          firstName ? `Dzień dobry ${firstName},` : 'Dzień dobry,', '',
          `dziękujemy za zamówienie nr ${o.number}. Jeśli masz chwilę, oceń produkty - opinie osób, które naprawdę kupiły, najbardziej pomagają innym.`, '',
          ...items.map((i) => `${i.name}: ${i.links[4].replace(/&ocena=5/, '')}`), '',
          'Opinia pojawi się po sprawdzeniu i dostanie oznaczenie „Zweryfikowany zakup”.', '',
          `Zespół Can-C · ${site.email}`,
          ...(unsub ? ['', `Nie chcesz takich wiadomości? Wypisz się: ${unsub}`] : []),
        ].join('\n'),
      });
      sent++;
    } catch (e) {
      errors.push(`${o.email}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errors.length) console.error('Prośby o opinię - błędy: ' + errors.join(' | '));
  console.log(`Prośby o opinię: wysłano ${sent} z ${list.length}`);
  return { sent, candidates: list.length, errors: errors.length };
}
