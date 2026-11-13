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

// Boty AI (stan: 2026). „search” - wyszukiwarki i asystenci, którzy pobierają stronę, żeby odpowiedzieć i zacytować źródło.
// „training” - zbieranie treści do trenowania modeli. Google AI Overviews i Copilot korzystają z Googlebota i Bingbota,
// więc nie da się ich wyłączyć osobno bez wypadnięcia z wyszukiwarki - nie ma ich na liście.
export const AI_BOTS: { id: string; group: 'search' | 'training'; owner: string; note: string }[] = [
  { id: 'OAI-SearchBot', group: 'search', owner: 'OpenAI', note: 'wyszukiwarka ChatGPT' },
  { id: 'ChatGPT-User', group: 'search', owner: 'OpenAI', note: 'ChatGPT otwiera stronę na prośbę użytkownika' },
  { id: 'PerplexityBot', group: 'search', owner: 'Perplexity', note: 'indeks wyszukiwarki Perplexity' },
  { id: 'Perplexity-User', group: 'search', owner: 'Perplexity', note: 'Perplexity otwiera stronę na prośbę użytkownika' },
  { id: 'Claude-SearchBot', group: 'search', owner: 'Anthropic', note: 'wyszukiwanie w Claude' },
  { id: 'Claude-User', group: 'search', owner: 'Anthropic', note: 'Claude otwiera stronę na prośbę użytkownika' },
  { id: 'DuckAssistBot', group: 'search', owner: 'DuckDuckGo', note: 'odpowiedzi AI w DuckDuckGo' },
  { id: 'GPTBot', group: 'training', owner: 'OpenAI', note: 'trening modeli GPT' },
  { id: 'ClaudeBot', group: 'training', owner: 'Anthropic', note: 'trening modeli Claude' },
  { id: 'Google-Extended', group: 'training', owner: 'Google', note: 'trening i odpowiedzi Gemini; nie wpływa na wyszukiwarkę Google' },
  { id: 'Applebot-Extended', group: 'training', owner: 'Apple', note: 'trening Apple Intelligence; nie wpływa na Siri i Spotlight' },
  { id: 'meta-externalagent', group: 'training', owner: 'Meta', note: 'trening Meta AI' },
  { id: 'CCBot', group: 'training', owner: 'Common Crawl', note: 'otwarte archiwum stron używane do trenowania wielu modeli' },
  { id: 'Amazonbot', group: 'training', owner: 'Amazon', note: 'Alexa i modele Amazona' },
  { id: 'Bytespider', group: 'training', owner: 'ByteDance', note: 'modele ByteDance (TikTok); znany z ignorowania robots.txt' },
];
export const AI_BOT_IDS = new Set(AI_BOTS.map((b) => b.id));

// Reguły dla zablokowanych botów AI (dopisywane do robots.txt)
export function aiRules(blocked: string[]) {
  const list = blocked.filter((id) => AI_BOT_IDS.has(id));
  if (!list.length) return '';
  return '# Boty AI zablokowane w panelu (SEO → Roboty i AI)\n' + list.map((id) => `User-agent: ${id}\nDisallow: /`).join('\n\n');
}

// Treść dla wyszukiwarek: własna albo domyślna + reguły botów AI, zawsze z mapą strony
export function renderRobots(custom: string, origin: string, blockedAi: string[] = []) {
  const ai = aiRules(blockedAi);
  const body = [(custom || defaultRobots()).replace(/\r/g, '').trim(), ai].filter(Boolean).join('\n\n');
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
