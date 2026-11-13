// Dane sklepu (kontakt, firma) i treści edytowane w panelu - z bazy, z zapasem w src/config.ts.
import type { Env } from './env';
import { db } from './supabase';
import { site as configSite } from '../config';

// Treści, których nie ma w config.ts - wartości domyślne
export const CONTENT_DEFAULTS = {
  gtmId: '',             // GTM-XXXXXXX; puste = analityka wyłączona
  promo1: 'Darmowa dostawa w Polsce',
  promo2: 'Do 10% rabatu przy 2 i 4 opakowaniach',
  promo3: 'Płatność BLIK i Przelewy24',
  shippingTime: 'w ciągu 1 dnia roboczego',
  noticeEnabled: '',      // 'true' = komunikat włączony
  noticeText: '',
  noticeFrom: '',         // ISO, puste = od razu
  noticeTo: '',           // ISO, puste = bez końca
};

// Logo jako obraz (adres w Supabase Storage); puste = logo tekstowe. Zapisywane osobną akcją w panelu.
// Favicon: osobno dla jasnego i ciemnego motywu przeglądarki + ikona Apple (ekran główny iPhone'a); serwowane przez /favicon/*.
// mailLogo: PNG/JPG do maili (SVG nie działa w Gmailu i Outlooku) - podpis w korespondencji i nagłówek maili sklepu.
export const LOGO_DEFAULTS = { logoHeader: '', logoFooter: '', faviconLight: '', faviconDark: '', faviconApple: '', mailLogo: '' };
export const LOGO_KEYS = Object.keys(LOGO_DEFAULTS) as (keyof typeof LOGO_DEFAULTS)[];

// Podpis pod odpowiedziami z panelu (Korespondencja): **pogrubienie**, [tekst](https://…), {email}, {company}
export const SIGNATURE_DEFAULTS = {
  mailSignature: 'Pozdrawiamy\n**Zespół Can-C**\n{email} · [can-c.pl](https://can-c.pl)',
  mailSignatureLogo: '', // 'true' = logo do maili nad podpisem
};

const defaults = { ...configSite, ...CONTENT_DEFAULTS, ...LOGO_DEFAULTS, ...SIGNATURE_DEFAULTS };
export type Site = typeof defaults & { noticeActive?: boolean };
export const SITE_KEYS = ['email', 'phone', 'hours', 'replyTime', 'facebook', 'company', 'address', 'nip', 'regon', 'returnsUrl'] as const;
export const CONTENT_KEYS = Object.keys(CONTENT_DEFAULTS) as (keyof typeof CONTENT_DEFAULTS)[];

let cache: { at: number; value: Site } | null = null;

// Komunikat jest aktywny, gdy włączony, ma treść i bieżąca chwila mieści się w przedziale dat
export function isNoticeActive(s: Partial<Site>, now = Date.now()) {
  if (s.noticeEnabled !== 'true' || !s.noticeText) return false;
  if (s.noticeFrom && new Date(s.noticeFrom).getTime() > now) return false;
  if (s.noticeTo && new Date(s.noticeTo).getTime() < now) return false;
  return true;
}

export async function getSite(env: Env): Promise<Site> {
  if (cache && Date.now() - cache.at < 60_000) return { ...cache.value, noticeActive: isNoticeActive(cache.value) };
  try {
    const [row] = await db(env).select<{ value: Partial<Site> }>('settings?select=value&key=eq.site');
    const value = { ...defaults, ...(row?.value ?? {}) } as Site;
    cache = { at: Date.now(), value };
    return { ...value, noticeActive: isNoticeActive(value) };
  } catch (e) {
    console.error('Ustawienia: ' + (e instanceof Error ? e.message : String(e)));
    return { ...defaults, noticeActive: false };
  }
}

export const clearSiteCache = () => { cache = null; };
