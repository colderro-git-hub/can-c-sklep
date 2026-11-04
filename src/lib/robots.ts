// robots.txt: domyślna treść, własna treść z panelu (settings.robots) i walidacja.
import type { Env } from './env';
import { db } from './supabase';

export const ROBOTS_MAX = 5000;

export const defaultRobots = () =>
  ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /konto', 'Disallow: /koszyk', 'Disallow: /zamowienie'].join('\n');

let cache: { at: number; text: string } | null = null;

// Własna treść z panelu albo '' (= domyślna)
export async function getCustomRobots(env: Env): Promise<string> {
  if (cache && Date.now() - cache.at < 60_000) return cache.text;
  try {
    const [row] = await db(env).select<{ value: { text?: string } }>('settings?select=value&key=eq.robots');
    const text = String(row?.value?.text || '').trim();
    cache = { at: Date.now(), text };
    return text;
  } catch (e) {
    console.error('robots.txt: ' + (e instanceof Error ? e.message : String(e)));
    return '';
  }
}
export const clearRobotsCache = () => { cache = null; };

// Treść dla wyszukiwarek: własna albo domyślna, zawsze z mapą strony
export function renderRobots(custom: string, origin: string) {
  const body = (custom || defaultRobots()).replace(/\r/g, '').trim();
  const withSitemap = /^\s*sitemap\s*:/im.test(body) ? body : `${body}\n\nSitemap: ${origin}/sitemap.xml`;
  return withSitemap + '\n';
}

// Każda linia: pusta, komentarz albo „Pole: wartość”. Zwraca numery błędnych linii.
export function invalidRobotsLines(text: string) {
  return text.replace(/\r/g, '').split('\n')
    .map((l, i) => ({ l: l.trim(), n: i + 1 }))
    .filter(({ l }) => l && !l.startsWith('#') && !/^[A-Za-z][A-Za-z-]*\s*:/.test(l))
    .map(({ n }) => n);
}
