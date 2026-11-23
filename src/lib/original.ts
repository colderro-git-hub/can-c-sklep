// „Produkt oryginalny”: treść dymka na karcie produktu (/admin → Strony → Karta produktu).
import type { Env } from './env';
import { getPageContent, getSection, visible } from './page-content';

export type OriginalInfo = {
  badge: string; title: string; lead: string; items: string[];
  image_url: string | null; image_alt: string; link_label: string; link_href: string; highlight_match: string;
};

const DEFAULTS: OriginalInfo & { products: string[] } = {
  products: ['krople-can-c'],
  badge: 'Produkt oryginalny',
  title: 'Produkt oryginalny',
  lead: 'Can-C sprzedajemy od 2013 roku. Każde opakowanie pochodzi bezpośrednio z oficjalnej dystrybucji.',
  items: ['Na pudełku jest hologram producenta', 'Opakowanie fabrycznie zamknięte, z numerem partii i datą ważności'],
  image_url: null, image_alt: 'Hologram na opakowaniu Can-C',
  link_label: 'Masz wątpliwości? Napisz do nas', link_href: '/kontakt/',
  highlight_match: 'Innovative Vision Products',
};

// null = dymek wyłączony albo produkt spoza listy
export async function getOriginalInfo(env: Env, productId: string): Promise<OriginalInfo | null> {
  const rows = await getPageContent(env, 'product').catch(() => []);
  const raw: any = getSection(rows, 'product.original') ?? DEFAULTS;
  if (!visible(raw)) return null;
  const list = (Array.isArray(raw.products) ? raw.products : []).map((x: unknown) => String(x).trim()).filter(Boolean);
  if (list.length && !list.includes(productId)) return null;
  return {
    badge: String(raw.badge || DEFAULTS.badge),
    title: String(raw.title || raw.h2 || DEFAULTS.title),
    lead: String(raw.lead ?? ''),
    items: (Array.isArray(raw.items) ? raw.items : []).map(String).filter(Boolean),
    image_url: raw.image_url || null,
    image_alt: String(raw.image_alt || DEFAULTS.image_alt),
    link_label: String(raw.link_label ?? ''),
    link_href: String(raw.link_href || '/kontakt/'),
    highlight_match: String(raw.highlight_match ?? DEFAULTS.highlight_match).trim(),
  };
}
