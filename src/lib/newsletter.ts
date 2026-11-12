// Newsletter: zapis z obowiązkową zgodą (double opt-in), dziennik zgód i kampanie e-mail z panelu.
import type { Env } from './env';
import type { db as dbFn } from './supabase';
import type { Site } from './site-settings';
import { signToken } from './automations';
import { layout, h1, p, button, codeBox, esc } from './email-templates';
import { getCatalog } from './catalog';

type Sb = ReturnType<typeof dbFn>;

// ---------- Zgoda ----------
// Treść zgody pokazywana przy formularzu i zapisywana w dzienniku (dowód, na co klient się zgodził)
export const consentText = (company: string) =>
  `Wyrażam zgodę na otrzymywanie od ${company} informacji handlowych (newslettera, promocji i kodów rabatowych) na podany adres e-mail. ` +
  'Zgodę mogę wycofać w każdej chwili – link „wypisz się” jest w każdej wiadomości.';

export const normEmail = (raw: unknown) => String(raw ?? '').trim().toLowerCase().slice(0, 200);

export async function ipHash(ip: string | null | undefined) {
  if (!ip) return null;
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`can-c:${ip}`));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export async function logConsent(sb: Sb, e: { email: string; customer_id?: string | null; action: 'requested' | 'confirmed' | 'granted' | 'withdrawn'; source: string; consent_text?: string | null; ip?: string | null; user_agent?: string | null }) {
  try {
    await sb.insert('consent_log', {
      email: e.email, customer_id: e.customer_id ?? null, action: e.action, source: e.source,
      consent_text: e.consent_text ?? null, ip_hash: await ipHash(e.ip), user_agent: e.user_agent ? e.user_agent.slice(0, 300) : null,
    }, 'id');
  } catch (err) {
    // Brak tabeli (migracja 021) nie może blokować zapisu ani zamówienia
    console.error('Dziennik zgód: ' + (err instanceof Error ? err.message : String(err)));
  }
}

// Zapis zgody na kliencie: istniejący klient dostaje zgodę, nowy adres – wiersz klienta ze źródłem „newsletter”
export async function grantConsent(sb: Sb, email: string, source: string): Promise<string> {
  const now = new Date().toISOString();
  const [c] = await sb.select<{ id: string }>(`customers?select=id&email=eq.${encodeURIComponent(email)}`);
  if (c) {
    await sb.update(`customers?id=eq.${c.id}`, { marketing_consent: true, consent_at: now, consent_source: source }, 'id');
    return c.id;
  }
  const [n] = await sb.insert<{ id: string }>('customers', { email, marketing_consent: true, consent_at: now, consent_source: source, source: 'newsletter' }, 'id');
  return n.id;
}

// ---------- Link potwierdzenia (double opt-in), ważny 7 dni ----------
const CONFIRM_DAYS = 7;
export async function confirmUrl(env: Env, origin: string, email: string) {
  const ts = Math.floor(Date.now() / 1000);
  const t = await signToken(env, `nl:${email}:${ts}`);
  return `${origin}/api/newsletter/potwierdz?e=${encodeURIComponent(email)}&ts=${ts}&t=${t}`;
}
export async function verifyConfirm(env: Env, email: string, ts: string, t: string) {
  const n = Number(ts);
  if (!env.CRON_SECRET || !Number.isInteger(n) || Date.now() / 1000 - n > CONFIRM_DAYS * 86400 || n > Date.now() / 1000 + 60) return false;
  return t === (await signToken(env, `nl:${email}:${n}`));
}

export function newsletterConfirmHtml(o: { site: Site; origin: string; url: string }) {
  return layout({
    site: o.site, origin: o.origin, preheader: 'Potwierdź zapis na newsletter Can-C jednym kliknięciem.',
    body: [
      h1('Potwierdź zapis na newsletter'),
      p('Dziękujemy za zapis! Kliknij przycisk, aby potwierdzić adres e-mail i zgodę na otrzymywanie informacji o promocjach i nowościach.'),
      button(o.url, 'Potwierdzam zapis'),
      p(`Link jest ważny przez ${CONFIRM_DAYS} dni. Jeśli to nie Ty zapisałeś ten adres, zignoruj wiadomość – bez potwierdzenia nie wyślemy żadnego newslettera.`, { muted: true, size: 14 }),
    ].join(''),
  });
}

// ---------- Odbiorcy kampanii ----------
export const AUDIENCES: Record<string, string> = {
  all: 'Wszyscy ze zgodą marketingową',
  buyers: 'Klienci, którzy kupili (ze zgodą)',
  no_orders: 'Bez zamówień – tylko zapisani na newsletter (ze zgodą)',
  inactive_90: 'Bez zakupu od 90 dni (ze zgodą)',
};
export function audiencePath(audience: string) {
  const base = 'customer_stats?select=id,email,first_name,orders_count,last_order_at&marketing_consent=is.true';
  if (audience === 'buyers') return `${base}&orders_count=gt.0`;
  if (audience === 'no_orders') return `${base}&orders_count=eq.0`;
  if (audience === 'inactive_90') return `${base}&orders_count=gt.0&last_order_at=lt.${encodeURIComponent(new Date(Date.now() - 90 * 864e5).toISOString())}`;
  return base;
}

// ---------- Bloki kampanii ----------
export type Block =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; alt?: string; href?: string }
  | { type: 'button'; label: string; url: string }
  | { type: 'products'; ids: string[] }
  | { type: 'code'; code: string; caption?: string }
  | { type: 'divider' };
export type Campaign = { name: string; subject: string; preheader: string; blocks: Block[] };

const INK = '#141C2B', MUTED = '#545D6E', LINE = '#DCE2EC', IMAGE_BG = '#D3DAE6', ACCENT_TEXT = '#107571', ACCENT = '#169089';
const FONT = "Poppins, Arial, 'Helvetica Neue', Helvetica, sans-serif";
const safeUrl = (u: string) => (/^(https?:\/\/|mailto:)/i.test(u) || u.startsWith('/') ? u : '');

// Walidacja bloków z panelu → bezpieczna lista albo komunikat błędu
export function cleanBlocks(raw: unknown): { blocks: Block[] } | { error: string } {
  const list = Array.isArray(raw) ? raw.slice(0, 40) : [];
  const out: Block[] = [];
  const s = (x: unknown, n: number) => String(x ?? '').replace(/\r/g, '').trim().slice(0, n);
  for (const b of list as any[]) {
    switch (b?.type) {
      case 'heading': { const text = s(b.text, 150); if (text) out.push({ type: 'heading', text }); break; }
      case 'text': { const text = s(b.text, 4000); if (text) out.push({ type: 'text', text }); break; }
      case 'image': {
        const url = s(b.url, 600);
        if (!url) break;
        if (!/^https:\/\//.test(url)) return { error: 'Obraz: podaj adres https (najlepiej wgraj plik przyciskiem).' };
        out.push({ type: 'image', url, alt: s(b.alt, 150), href: safeUrl(s(b.href, 600)) || undefined });
        break;
      }
      case 'button': {
        const label = s(b.label, 60), url = safeUrl(s(b.url, 600));
        if (!label || !url) return { error: 'Przycisk: podaj tekst i adres (https://… albo /ścieżka).' };
        out.push({ type: 'button', label, url });
        break;
      }
      case 'products': { const ids = (Array.isArray(b.ids) ? b.ids : []).map((x: unknown) => s(x, 80)).filter(Boolean).slice(0, 6); if (ids.length) out.push({ type: 'products', ids }); break; }
      case 'code': { const code = s(b.code, 30).toUpperCase(); if (code) out.push({ type: 'code', code, caption: s(b.caption, 150) }); break; }
      case 'divider': out.push({ type: 'divider' }); break;
    }
  }
  return { blocks: out };
}

// Link do sklepu → z parametrami UTM (GA4 policzy wejścia i sprzedaż z kampanii)
function utm(url: string, origin: string, campaign: string) {
  let u: URL;
  try { u = new URL(url, origin); } catch { return url; }
  if (u.origin !== new URL(origin).origin) return u.toString();
  u.searchParams.set('utm_source', 'newsletter');
  u.searchParams.set('utm_medium', 'email');
  u.searchParams.set('utm_campaign', campaign);
  return u.toString();
}
export const campaignSlug = (name: string) =>
  name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/gi, 'l').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'newsletter';

// Prosty markdown w blokach tekstu: **pogrubienie**, *kursywa*, [link](https://…), listy „- ”, akapity
function mdToEmail(text: string, link: (u: string) => string) {
  const inline = (t: string) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:500;">$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
      const u = safeUrl(href.replace(/&amp;/g, '&'));
      return u ? `<a href="${esc(link(u))}" style="color:${ACCENT_TEXT};">${label}</a>` : label;
    });
  return text.split(/\n{2,}/).map((para) => {
    const lines = para.split('\n');
    if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
      return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">${lines.map((l) =>
        `<tr><td valign="top" style="padding:0 10px 6px 0;font-family:${FONT};font-size:16px;line-height:1.55;color:${ACCENT};">•</td><td style="padding:0 0 6px;font-family:${FONT};font-size:16px;line-height:1.55;font-weight:300;color:${INK};">${inline(l.replace(/^\s*[-•]\s+/, ''))}</td></tr>`).join('')}</table>`;
    }
    return p(lines.map(inline).join('<br>'));
  }).join('');
}

type ProductCard = { id: string; name: string; price: string; old: string | null; image: string | null };

// Przygotowanie kampanii raz (produkty z katalogu), potem szybkie renderowanie dla każdego odbiorcy
export async function prepareCampaign(env: Env, site: Site, origin: string, c: Campaign) {
  const ids = [...new Set(c.blocks.flatMap((b) => (b.type === 'products' ? b.ids : [])))];
  const cards = new Map<string, ProductCard>();
  if (ids.length) {
    const fmt = (g: number) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(g / 100);
    for (const p of await getCatalog(env).catch(() => [])) {
      if (!ids.includes(p.id) || p.current === null) continue;
      const img = p.images[0]?.url || null;
      cards.set(p.id, { id: p.id, name: p.name, price: fmt(p.current), old: p.onSale && p.price ? fmt(p.price) : null, image: img }); // WebP: Gmail i Apple Mail tak, Outlook na Windows pokaże puste pole
    }
  }
  const slug = campaignSlug(c.name || c.subject);
  const link = (u: string) => utm(u, origin, slug);

  return (r: { firstName?: string | null; unsubscribe?: string }) => {
    const name = (r.firstName || '').trim();
    // {imie} → imię odbiorcy; bez imienia znika razem ze spacją przed nim („Dzień dobry {imie},” → „Dzień dobry,”)
    const personal = (t: string) => t.replace(/\s?\{imie\}/gi, name ? ` ${name}` : '').replace(/^\s+/, '');
    const parts: string[] = [];
    const textParts: string[] = [];
    for (const b of c.blocks) {
      if (b.type === 'heading') { parts.push(h1(personal(b.text))); textParts.push(personal(b.text).toUpperCase()); }
      if (b.type === 'text') { parts.push(mdToEmail(personal(b.text), link)); textParts.push(personal(b.text).replace(/\*\*|\*/g, '').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, l, h) => `${l} (${link(h)})`)); }
      if (b.type === 'image') {
        const img = `<img src="${esc(b.url)}" alt="${esc(b.alt || '')}" width="520" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:16px;">`;
        parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td>${b.href ? `<a href="${esc(link(b.href))}">${img}</a>` : img}</td></tr></table>`);
      }
      if (b.type === 'button') { parts.push(button(link(b.url), b.label)); textParts.push(`${b.label}: ${link(b.url)}`); }
      if (b.type === 'divider') { parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 26px;"><tr><td style="border-top:1px solid ${LINE};font-size:0;line-height:0;">&nbsp;</td></tr></table>`); textParts.push('—'); }
      if (b.type === 'code') { parts.push(codeBox(b.code, b.caption || 'Wpisz kod przy zamówieniu')); textParts.push(`Kod: ${b.code}${b.caption ? ` – ${b.caption}` : ''}`); }
      if (b.type === 'products') {
        const list = b.ids.map((id) => cards.get(id)).filter(Boolean) as ProductCard[];
        parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">${list.map((x) => {
          const href = link(`${origin}/produkt/${x.id}/`);
          return `<tr><td style="padding:0 0 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${LINE};border-radius:16px;"><tr>
            <td width="112" valign="middle" style="padding:14px;">${x.image ? `<a href="${esc(href)}"><img src="${esc(x.image)}" alt="${esc(x.name)}" width="96" height="96" style="display:block;width:96px;height:96px;object-fit:cover;border-radius:12px;background:${IMAGE_BG};border:0;"></a>` : ''}</td>
            <td valign="middle" style="padding:14px 14px 14px 0;font-family:${FONT};">
              <a href="${esc(href)}" style="font-size:17px;line-height:1.35;font-weight:400;color:${INK};text-decoration:none;">${esc(x.name)}</a>
              <div style="margin-top:6px;font-size:16px;font-weight:500;color:${INK};">${esc(x.price)}${x.old ? ` <s style="font-weight:300;color:${MUTED};font-size:14px;">${esc(x.old)}</s>` : ''}</div>
              <a href="${esc(href)}" style="display:inline-block;margin-top:8px;font-size:14px;color:${ACCENT_TEXT};">Zobacz produkt →</a>
            </td></tr></table></td></tr>`;
        }).join('')}</table>`);
        list.forEach((x) => textParts.push(`${x.name} – ${x.price}: ${link(`${origin}/produkt/${x.id}/`)}`));
      }
    }
    const html = layout({
      site, origin, preheader: c.preheader || c.subject, body: parts.join(''),
      unsubscribe: r.unsubscribe, reason: 'Otrzymujesz tę wiadomość, bo wyraziłeś zgodę na informacje handlowe od Can-C.',
    });
    const text = [...textParts, '', '—', `${site.company} · ${site.email}`, r.unsubscribe ? `Wypisz się: ${r.unsubscribe}` : ''].join('\n\n').replace(/\n{3,}/g, '\n\n');
    return { html, text };
  };
}
