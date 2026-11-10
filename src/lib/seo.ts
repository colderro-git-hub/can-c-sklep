// SEO edytowane w panelu (zakładka SEO): nadpisania tytułu, opisu, obrazu OG i indeksowania dla stron
// oraz ustawienia udostępniania. Trzymane w settings (klucz 'seo'), bez osobnych tabel.
import type { Env } from './env';
import { db } from './supabase';

export type SeoPage = { title?: string; description?: string; ogImage?: string; noindex?: boolean };
export type SeoOrg = {
  name?: string; legalName?: string; description?: string; logo?: string; sameAs?: string[];
  street?: string; postcode?: string; city?: string; foundingDate?: string; breadcrumbs?: boolean;
};
export type SeoSettings = {
  pages: Record<string, SeoPage>;
  share: { ogImage?: string; siteName?: string; twitter?: string };
  org: SeoOrg;
  ai: { block?: string[] };
  llms: { enabled?: boolean; summary?: string; extra?: string };
};

// Strony z treścią, którymi zarządza zakładka SEO → Strony. Domyślne tytuły i opisy = wartości z kodu stron
// (używane, gdy w panelu pole jest puste). Produkty mają własne pola SEO w zakładce Produkty.
export const SEO_PAGES: { path: string; label: string; title: string; description: string }[] = [
  { path: "/", label: "Strona główna", title: "Krople do oczu Can-C z N-acetylokarnozyną", description: "Oryginalne krople Can-C z N-acetylokarnozyną. Darmowa dostawa, szybka wysyłka." },
  { path: "/sklep/", label: "Sklep", title: "Sklep | Can-C", description: "Wszystkie produkty Can-C: krople do oczu, krople dla psów i kapsułki. Darmowa dostawa w Polsce." },
  { path: "/stosowanie/", label: "Stosowanie", title: "Jak stosować krople Can-C | Dawkowanie i aplikacja", description: "Dawkowanie kropli Can-C, otwieranie fiolki i prawidłowe zakraplanie krok po kroku. Sprawdź, ile opakowań potrzebujesz na kurację." },
  { path: "/faq/", label: "FAQ", title: "FAQ: najczęstsze pytania o krople Can-C", description: "Skład, dawkowanie, soczewki kontaktowe, dostawa, płatności i zwroty. Odpowiedzi na najczęstsze pytania o krople Can-C." },
  { path: "/kontakt/", label: "Kontakt", title: "Kontakt | Can-C", description: "Kontakt z obsługą klienta sklepu Can-C: pytania o produkty, zamówienia, zwroty i współpracę." },
  { path: "/o-nas/", label: "O nas", title: "O nas | Can-C", description: "Sklep can-c.pl prowadzi firma Colderro Ewa Zimna. Sprzedajemy oryginalne krople Can-C od 2013 roku." },
  { path: "/regulamin/", label: "Regulamin", title: "Regulamin | Can-C", description: "Regulamin sklepu internetowego can-c.pl: zamówienia, płatności, dostawa, zwroty, reklamacje i konto klienta." },
  { path: "/polityka-prywatnosci/", label: "Polityka prywatności", title: "Polityka prywatności | Can-C", description: "Polityka prywatności i plików cookies sklepu can-c.pl: jakie dane zbieramy, w jakim celu, komu je powierzamy i jakie masz prawa." },
  { path: "/formy-dostawy/", label: "Formy dostawy", title: "Formy dostawy | Can-C", description: "Darmowa dostawa w Polsce: InPost Paczkomat 24/7 i kurier DPD. Czas realizacji i śledzenie przesyłek w sklepie Can-C." },
  { path: "/formy-platnosci/", label: "Formy płatności", title: "Formy płatności | Can-C", description: "Płatności w sklepie Can-C: BLIK, szybki przelew, karta płatnicza, Apple Pay i Google Pay przez Przelewy24." },
  { path: "/odstapienie-od-umowy/", label: "Zwroty i reklamacje", title: "Zwroty i reklamacje | Can-C", description: "Odstąpienie od umowy w 14 dni, zwrot produktu i reklamacje w sklepie Can-C. Formularz odstąpienia online." },
];

export const SEO_LIMITS = { title: 60, description: 155 };
const EMPTY: SeoSettings = { pages: {}, share: {}, org: {}, ai: {}, llms: {} };
let cache: { at: number; value: SeoSettings } | null = null;

export async function getSeo(env: Env): Promise<SeoSettings> {
  if (!env?.SUPABASE_URL) return EMPTY;
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  try {
    const [row] = await db(env).select<{ value: Partial<SeoSettings> }>('settings?select=value&key=eq.seo');
    const v = row?.value ?? {};
    const value: SeoSettings = { pages: v.pages ?? {}, share: v.share ?? {}, org: v.org ?? {}, ai: v.ai ?? {}, llms: v.llms ?? {} };
    cache = { at: Date.now(), value };
    return value;
  } catch (e) {
    console.error('SEO: ' + (e instanceof Error ? e.message : String(e)));
    return EMPTY;
  }
}
export const clearSeoCache = () => { cache = null; };

// Normalizacja ścieżki do klucza rejestru: zawsze z ukośnikiem na końcu
export const seoPath = (pathname: string) => (pathname.endsWith('/') ? pathname : pathname + '/');

// ---------- Dane firmy (etap 2) ----------
const ORIGIN = 'https://can-c.pl';
type SiteLike = { company?: string; address?: string; nip?: string; email?: string; phone?: string; facebook?: string; logoHeader?: string };
// Pole „do uzupełnienia” z konfiguracji (np. „[numer telefonu]”) nie trafia do danych strukturalnych
const real = (v?: string) => (v && !/^\s*\[.*\]\s*$/.test(v) ? v.trim() : '');

// „ul. Parkowa 31B, 52-200 Wysoka” → ulica, kod, miasto
export function splitAddress(address = '') {
  const m = address.match(/^(.*?),\s*(\d{2}-\d{3})\s+(.+)$/);
  return m ? { street: m[1].trim(), postcode: m[2], city: m[3].trim() } : { street: address.trim(), postcode: '', city: '' };
}

// Wartości efektywne: panel SEO → Ustawienia sklepu → domyślne
export function orgData(seo: SeoSettings, site: SiteLike) {
  const o = seo.org || {};
  const a = splitAddress(site.address);
  const sameAs = [...(o.sameAs || []), real(site.facebook)].filter((u, i, arr) => u && arr.indexOf(u) === i);
  return {
    name: o.name || seo.share.siteName || 'Can-C',
    legalName: o.legalName || real(site.company),
    description: o.description || '',
    logo: o.logo || site.logoHeader || '',
    sameAs,
    street: o.street || a.street, postcode: o.postcode || a.postcode, city: o.city || a.city,
    email: real(site.email), phone: real(site.phone), taxID: real(site.nip),
    foundingDate: o.foundingDate || '',
    breadcrumbs: o.breadcrumbs !== false,
  };
}

// Organization (OnlineStore) + WebSite – na stronie głównej i „O nas”
export function orgJsonLd(seo: SeoSettings, site: SiteLike) {
  const d = orgData(seo, site);
  const org: Record<string, unknown> = {
    '@type': 'OnlineStore', '@id': `${ORIGIN}/#organization`, name: d.name, url: `${ORIGIN}/`,
    ...(d.legalName && { legalName: d.legalName }),
    ...(d.description && { description: d.description }),
    ...(d.logo && { logo: { '@type': 'ImageObject', url: d.logo }, image: d.logo }),
    ...(d.sameAs.length && { sameAs: d.sameAs }),
    ...((d.street || d.city) && { address: { '@type': 'PostalAddress', streetAddress: d.street, postalCode: d.postcode, addressLocality: d.city, addressCountry: 'PL' } }),
    ...(d.email && { email: d.email }),
    ...(d.phone && { telephone: d.phone }),
    ...(d.taxID && { taxID: d.taxID, vatID: `PL${d.taxID.replace(/\D/g, '')}` }),
    ...(d.foundingDate && { foundingDate: d.foundingDate }),
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer service', areaServed: 'PL', availableLanguage: ['pl'], ...(d.email && { email: d.email }), ...(d.phone && { telephone: d.phone }) },
  };
  const website = { '@type': 'WebSite', '@id': `${ORIGIN}/#website`, name: d.name, url: `${ORIGIN}/`, inLanguage: 'pl-PL', publisher: { '@id': `${ORIGIN}/#organization` } };
  return { '@context': 'https://schema.org', '@graph': [org, website] };
}

// Okruszki: Strona główna › … ; ścieżki z ukośnikiem na końcu
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${ORIGIN}${it.path}` })),
  };
}
