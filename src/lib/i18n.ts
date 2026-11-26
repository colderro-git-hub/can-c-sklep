// Wersja językowa sklepu: polska pod obecnymi adresami, angielska pod /en/.
// Strony angielskie to te same strony (middleware przepisuje /en/... na adres polski i ustawia locals.lang = 'en'),
// więc każda strona ma jeden plik - teksty zależne od języka pochodzą ze słownika (src/i18n/) albo z panelu.
export type Lang = 'pl' | 'en';
export const LANGS: Lang[] = ['pl', 'en'];

// Adres polski → angielski (stałe strony). Produkty: /produkt/<slug>/ ↔ /en/product/<slug>/
const PATHS: [string, string][] = [
  ['/', '/en/'],
  ['/sklep/', '/en/shop/'],
  ['/stosowanie/', '/en/how-to-use/'],
  ['/faq/', '/en/faq/'],
  ['/kontakt/', '/en/contact/'],
  ['/o-nas/', '/en/about/'],
  ['/koszyk/', '/en/cart/'],
  ['/zamowienie/dziekujemy/', '/en/checkout/thank-you/'],
  ['/zamowienie/', '/en/checkout/'],
  ['/konto/', '/en/account/'],
  ['/regulamin/', '/en/terms/'],
  ['/polityka-prywatnosci/', '/en/privacy-policy/'],
  ['/formy-dostawy/', '/en/delivery/'],
  ['/formy-platnosci/', '/en/payment-methods/'],
  ['/odstapienie-od-umowy/', '/en/withdrawal/'],
  ['/newsletter/', '/en/newsletter/'],
  ['/wypisano/', '/en/unsubscribed/'],
];
const PL_TO_EN = new Map(PATHS);
const EN_TO_PL = new Map(PATHS.map(([pl, en]) => [en, pl]));

const withSlash = (p: string) => (p.endsWith('/') ? p : `${p}/`);

// Adres angielski → polski (do przepisania w middleware); null = nieznany adres
export function enToPl(path: string): string | null {
  const p = withSlash(path);
  if (EN_TO_PL.has(p)) return EN_TO_PL.get(p)!;
  const m = p.match(/^\/en\/product\/([a-z0-9-]+)\/$/);
  if (m) return `/produkt/${m[1]}/`;
  return null;
}

// Adres polski → angielski (przełącznik języka, linki); nieznane = strona główna EN
export function plToEn(path: string): string {
  const p = withSlash(path);
  if (PL_TO_EN.has(p)) return PL_TO_EN.get(p)!;
  const m = p.match(/^\/produkt\/([a-z0-9-]+)\/$/);
  if (m) return `/en/product/${m[1]}/`;
  return '/en/';
}

// Link w danym języku: href polski (np. „/sklep/”, „/produkt/x/#opinie”) → odpowiednik w języku strony
export function href(lang: Lang, plHref: string): string {
  if (lang === 'pl' || !plHref.startsWith('/') || plHref.startsWith('/api/')) return plHref;
  const [path, rest = ''] = plHref.split(/(?=[?#])/);
  const known = PL_TO_EN.has(withSlash(path)) || /^\/produkt\/[a-z0-9-]+\/?$/.test(path);
  return known ? plToEn(path) + rest : plHref;
}

// Adres polski bieżącej strony (dla /en/... wyliczony z adresu angielskiego - niezależnie od tego, co pokazuje Astro.url)
export function plPathOf(locals: unknown, urlPath: string): string {
  const en = (locals as any)?.enPath as string | undefined;
  return (en && enToPl(en)) || urlPath;
}

// Język bieżącego żądania (ustawia middleware dla adresów /en/)
export const langOf = (locals: unknown): Lang => ((locals as any)?.lang === 'en' ? 'en' : 'pl');

// Cena w groszach w formacie języka: PL „369,00 zł”, EN „PLN 369.00”
const fmt = {
  pl: new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }),
  en: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'PLN', currencyDisplay: 'code' }),
};
export const price = (lang: Lang, grosze: number | null) => (grosze === null ? '-' : fmt[lang].format(grosze / 100));
