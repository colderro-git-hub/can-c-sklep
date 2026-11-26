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
  'common.home': ['Strona główna', 'Home'],
  'common.crumbs': ['Okruszki', 'Breadcrumbs'],

  // Stopka
  'ft.shop': ['Sklep', 'Shop'],
  'ft.buying': ['Zakupy', 'Buying'],
  'ft.info': ['Informacje', 'Information'],
  'ft.drops': ['Krople Can-C', 'Can-C eye drops'],
  'ft.k9': ['Can-C K9 dla psa', 'Can-C K9 for dogs'],
  'ft.capsules': ['Kapsułki 60 i 90', 'Capsules 60 and 90'],
  'ft.account': ['Moje konto', 'My account'],
  'ft.delivery': ['Formy dostawy', 'Delivery'],
  'ft.payments': ['Formy płatności', 'Payment methods'],
  'ft.returns': ['Zwroty i reklamacje', 'Returns and complaints'],
  'ft.withdraw': ['Odstąp od umowy', 'Withdraw from purchase'],
  'ft.about': ['O nas', 'About us'],
  'ft.terms': ['Regulamin', 'Terms and conditions'],
  'ft.privacy': ['Polityka prywatności', 'Privacy policy'],
  'ft.contact': ['Kontakt', 'Contact'],
  'ft.methods': ['Metody płatności i dostawy', 'Payment and delivery methods'],
  'badge.card': ['Karta', 'Card'],
  'badge.locker': ['InPost Paczkomat', 'InPost Parcel Locker'],
  'badge.courier': ['Kurier', 'Courier'],

  // Dostępność
  'avail.in_stock': ['Dostępny', 'In stock'],
  'avail.out_of_stock': ['Chwilowo niedostępny', 'Temporarily unavailable'],
  'avail.preorder': ['Przedsprzedaż', 'Pre-order'],
  'avail.backorder': ['Na zamówienie', 'Made to order'],
  'badge.out_of_stock': ['Brak w magazynie', 'Out of stock'],

  // Karta produktu na liście
  'pc.photo': ['[zdjęcie produktu]', '[product photo]'],
  'pc.view': ['Zobacz', 'View'],
  'pc.add': ['Dodaj do koszyka', 'Add to cart'],
  'pc.viewProduct': ['Zobacz produkt', 'View product'],

  // Sklep
  'shop.title': ['Sklep', 'Shop'],
  'shop.lead': ['Oryginalne produkty Can-C. Wysyłamy za darmo do Paczkomatów i kurierem InPost.', 'Original Can-C products. Free delivery to InPost Parcel Lockers or by InPost courier.'],
  'shop.drops': ['Krople do oczu', 'Eye drops'],
  'shop.dropsLead': ['Krople Can-C z N-acetylokarnozyną dla ludzi i w wersji dla psów.', 'Can-C drops with N-acetylcarnosine, for people and in a version for dogs.'],
  'shop.capsules': ['Kapsułki', 'Capsules'],
  'shop.capsulesLead': ['Uzupełnienie kuracji kroplami.', 'A complement to using the drops.'],
  'shop.error': ['Nie udało się wczytać produktów. Odśwież stronę za chwilę.', 'We could not load the products. Please refresh the page in a moment.'],
  'shop.metaTitle': ['Sklep | Can-C', 'Shop | Can-C'],
  'shop.metaDesc': ['Wszystkie produkty Can-C: krople do oczu, krople dla psów i kapsułki. Darmowa dostawa w Polsce.', 'All Can-C products: eye drops, drops for dogs and capsules. Free delivery in Poland.'],

  // Strona główna
  'home.metaTitle': ['Krople do oczu Can-C z N-acetylokarnozyną', 'Can-C eye drops with N-acetylcarnosine'],
  'home.metaDesc': ['Oryginalne krople Can-C z N-acetylokarnozyną. Darmowa dostawa, szybka wysyłka.', 'Original Can-C eye drops with N-acetylcarnosine. Free delivery, fast dispatch.'],
  'home.slide': ['Slajd', 'Slide'],
  'home.pause': ['Zatrzymaj zmianę slajdów', 'Pause the slideshow'],
  'bundle.perUnit': ['za sztukę', 'per pack'],
  'bundle.save': ['Oszczędzasz', 'You save'],
  'bundle.regular': ['Cena regularna', 'Regular price'],
  'rv.avg': ['Średnia ocena', 'Average rating'],
  'rv.basedOn': ['na podstawie', 'based on'],
  'rv.prev': ['Poprzednia opinia', 'Previous review'],
  'rv.next': ['Następna opinia', 'Next review'],
  'faq.cat.product': ['Produkt', 'Product'],
  'faq.cat.use': ['Stosowanie', 'How to use'],
  'faq.cat.orders': ['Zamówienia i dostawa', 'Orders and delivery'],
  'faq.cat.returns': ['Płatności i zwroty', 'Payments and returns'],

  // 404
  'nf.metaTitle': ['Nie znaleziono strony | Can-C', 'Page not found | Can-C'],
  'nf.metaDesc': ['Ta strona nie istnieje albo została przeniesiona.', 'This page does not exist or has been moved.'],
  'nf.title1': ['Nie znaleźliśmy', 'We could not find'],
  'nf.title2': ['tej strony', 'this page'],
  'nf.lead': ['Adres mógł się zmienić po przeniesieniu sklepu albo zawiera literówkę. Zacznij od jednej z tych stron:', 'The address may have changed when we moved the shop, or it contains a typo. Start from one of these pages:'],
  'nf.products': ['Produkty', 'Products'],
  'nf.productsText': ['Krople Can-C, wersja dla psa i kapsułki', 'Can-C drops, the version for dogs and capsules'],
  'nf.howto': ['Stosowanie', 'How to use'],
  'nf.howtoText': ['Dawkowanie i zakraplanie krok po kroku', 'Dosage and applying the drops, step by step'],
  'nf.faqText': ['Odpowiedzi na najczęstsze pytania', 'Answers to the most common questions'],
  'nf.contact': ['Kontakt', 'Contact'],
  'nf.contactText': ['Napisz, jeśli szukasz czegoś konkretnego', 'Write to us if you are looking for something specific'],
} as const satisfies Record<string, readonly [string, string]>;

export type UiKey = keyof typeof UI;
export const t = (lang: Lang, key: UiKey): string => UI[key]?.[lang === 'en' ? 1 : 0] ?? UI[key]?.[0] ?? key;
