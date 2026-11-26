// Słownik tekstów interfejsu (teksty wpisane w kod). Treści z panelu (Strony, Produkty) mają osobne pola EN.
// Klucz → [polski, angielski]. Brak tłumaczenia = tekst polski.
import type { Lang } from '../lib/i18n';

const UI = {
  // Nagłówek
  'nav.drops': ['Krople', 'Drops'],
  'nav.capsules': ['Kapsułki', 'Capsules'],
  'nav.k9': ['Can-C K9', 'Can-C K9'],
  'nav.howto': ['Stosowanie', 'How to use'],
  'nav.faq': ['FAQ', 'FAQ'],
  'nav.contact': ['Kontakt', 'Contact'],
  'nav.menu': ['Menu sklepu', 'Shop menu'],
  'hd.account': ['Moje konto', 'My account'],
  'hd.cart': ['Koszyk', 'Cart'],
  'hd.home': ['Strona główna', 'Home'],
  'hd.openMenu': ['Otwórz menu', 'Open menu'],
  'hd.switch': ['English version', 'Wersja polska'],
} as const satisfies Record<string, readonly [string, string]>;

export type UiKey = keyof typeof UI;
export const t = (lang: Lang, key: UiKey): string => UI[key]?.[lang === 'en' ? 1 : 0] ?? UI[key]?.[0] ?? key;
