// /llms.txt (llmstxt.org): zwięzły opis sklepu dla modeli językowych (ChatGPT, Claude, Perplexity).
// Generowany z katalogu, ustawień sklepu i rejestru stron; w panelu (SEO → Roboty i AI) można dodać opis i własną sekcję.
import type { Env } from './env';
import { getCatalog, AVAIL_LABEL } from './catalog';
import { getSite } from './site-settings';
import { getSeo, orgData, SEO_PAGES } from './seo';

const ORIGIN = 'https://can-c.pl';
const zl = (g: number | null | undefined) => (g == null ? 'cena do ustalenia' : (g / 100).toFixed(2).replace('.', ',') + ' zł');
const line = (s: string) => s.replace(/\s+/g, ' ').trim();

export async function buildLlms(env: Env): Promise<{ enabled: boolean; text: string }> {
  const [seo, site, catalog] = await Promise.all([getSeo(env), getSite(env), getCatalog(env).catch(() => [])]);
  const o = orgData(seo, site as any);
  const cfg = seo.llms || {};
  const summary = line(cfg.summary || o.description ||
    `Oficjalny sklep internetowy z oryginalnymi kroplami do oczu Can-C z N-acetylokarnozyną (NAC), wersją dla psów (Can-C K9) i kapsułkami. Sprzedaż i wysyłka w Polsce.`);

  const out: string[] = [`# ${o.name}`, '', `> ${summary}`, ''];
  out.push(
    `- Sprzedawca: ${[o.legalName, [o.street, [o.postcode, o.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ')}${o.taxID ? `, NIP ${o.taxID}` : ''}`,
    `- Kontakt: ${[o.email, o.phone].filter(Boolean).join(', ') || `${ORIGIN}/kontakt/`}`,
    `- Dostawa: darmowa w Polsce - InPost Paczkomat 24/7 i kurier DPD${(site as any).shippingTime ? `; wysyłka ${line((site as any).shippingTime)}` : ''}`,
    '- Płatności: BLIK, szybki przelew, karta (Przelewy24) oraz przelew tradycyjny',
    '- Zwroty: 14 dni na odstąpienie od umowy (nieotwarte opakowanie)',
    '- Ceny: w złotych, brutto (z VAT); rabat 8% przy 2 i 10% przy 4 opakowaniach kropli',
    '',
  );

  const active = catalog.filter((p) => p.active !== false);
  if (active.length) {
    out.push('## Produkty', '');
    for (const p of active) {
      const desc = line(p.short_description || p.subtitle || '');
      out.push(`- [${p.name}](${ORIGIN}/produkt/${p.id}/): ${zl(p.current)}, ${AVAIL_LABEL[p.avail].toLowerCase()}${desc ? `. ${desc}` : ''}`);
    }
    out.push('');
  }

  const pick = (path: string) => SEO_PAGES.find((x) => x.path === path);
  const info = ['/stosowanie/', '/faq/', '/formy-dostawy/', '/formy-platnosci/', '/odstapienie-od-umowy/', '/kontakt/', '/o-nas/'].map(pick).filter(Boolean);
  const own = (path: string) => seo.pages[path] || {};
  out.push('## Informacje', '');
  for (const p of info) out.push(`- [${p!.label}](${ORIGIN}${p!.path}): ${line(own(p!.path).description || p!.description)}`);
  out.push('');

  const extra = (cfg.extra || '').replace(/\r/g, '').trim();
  if (extra) out.push(extra, '');

  out.push('## Optional', '', `- [Regulamin](${ORIGIN}/regulamin/): zasady zakupów, dostawy, zwrotów i reklamacji`, `- [Polityka prywatności](${ORIGIN}/polityka-prywatnosci/)`, '');
  return { enabled: cfg.enabled !== false, text: out.join('\n') };
}
