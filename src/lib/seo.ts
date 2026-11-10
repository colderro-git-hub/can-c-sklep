// SEO edytowane w panelu (zakładka SEO): nadpisania tytułu, opisu, obrazu OG i indeksowania dla stron
// oraz ustawienia udostępniania. Trzymane w settings (klucz 'seo'), bez osobnych tabel.
import type { Env } from './env';
import { db } from './supabase';

export type SeoPage = { title?: string; description?: string; ogImage?: string; noindex?: boolean };
export type SeoSettings = {
  pages: Record<string, SeoPage>;
  share: { ogImage?: string; siteName?: string; twitter?: string };
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
const EMPTY: SeoSettings = { pages: {}, share: {} };
let cache: { at: number; value: SeoSettings } | null = null;

export async function getSeo(env: Env): Promise<SeoSettings> {
  if (!env?.SUPABASE_URL) return EMPTY;
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  try {
    const [row] = await db(env).select<{ value: Partial<SeoSettings> }>('settings?select=value&key=eq.seo');
    const value: SeoSettings = { pages: row?.value?.pages ?? {}, share: row?.value?.share ?? {} };
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
