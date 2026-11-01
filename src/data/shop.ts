import { faqItems } from './faq';

// Dane tymczasowe. W kroku z Supabase te listy będą pobierane z bazy (panel admina).

export type Product = {
  slug: string;
  tag: string;
  name: string;
  desc: string;
  price: number | null;   // brutto w zł; null = cena do uzupełnienia
  image?: string;         // ścieżka w /public/images
  bundles?: boolean;      // czy działają rabaty za 2 i 4 szt.
  size: string;           // pojemność / ilość
  about: string;          // opis na karcie produktu
  usage: string;          // stosowanie
  ingredients: string;    // skład
  related?: string;       // slug produktu „często kupowane razem”
};

export const products: Product[] = [
  {
    slug: 'krople-can-c', tag: 'KROPLE', name: 'Krople Can-C 2 × 5 ml', price: 369, bundles: true, size: '2 × 5 ml',
    desc: 'Oryginalne krople z N-acetylokarnozyną. Miesięczna kuracja.',
    about: 'Can-C to pierwsze krople do oczu zawierające N-acetylokarnozynę (NAC). Produkt musiał spełnić kryteria Innovative Vision Products (IVP); na oryginalnym opakowaniu znajdziesz ich oznaczenie. [Opis do weryfikacji pod kątem dopuszczalnych oświadczeń zdrowotnych]',
    usage: '[Dawkowanie i sposób aplikacji – przenieść ze strony /stosowanie, zgodnie z ulotką producenta]',
    ingredients: '[Pełny skład z ulotki producenta]',
    related: 'kapsulki-can-c-60',
  },
  {
    slug: 'krople-can-c-k9', tag: 'DLA PSA', name: 'Krople Can-C K9', price: null, bundles: true, size: '[pojemność]',
    desc: 'Wersja kropli przeznaczona dla psów.',
    about: 'Krople z N-acetylokarnozyną w wersji dla psów. Kurację warto skonsultować z lekarzem weterynarii. [Opis do uzupełnienia]',
    usage: '[Dawkowanie dla psów – zgodnie z ulotką producenta]',
    ingredients: '[Pełny skład z ulotki producenta]',
  },
  {
    slug: 'kapsulki-can-c-60', tag: 'KAPSUŁKI', name: 'Kapsułki Can-C 60 szt.', price: null, size: '60 kapsułek',
    desc: 'Uzupełnienie kuracji kroplami Can-C.',
    about: '[Opis kapsułek Can-C Plus i ich roli w kuracji]', usage: '[Dawkowanie]', ingredients: '[Skład]',
    related: 'krople-can-c',
  },
  {
    slug: 'kapsulki-can-c-90', tag: 'KAPSUŁKI', name: 'Kapsułki Can-C 90 szt.', price: null, size: '90 kapsułek',
    desc: 'Większe opakowanie na dłuższą kurację.',
    about: '[Opis kapsułek Can-C Plus i ich roli w kuracji]', usage: '[Dawkowanie]', ingredients: '[Skład]',
    related: 'krople-can-c',
  },
];

export const bundles = [
  { qty: 1, label: '1 opakowanie', months: '1 miesiąc kuracji', discount: 0 },
  { qty: 2, label: '2 opakowania', months: '2 miesiące kuracji', discount: 0.08, featured: true },
  { qty: 4, label: '4 opakowania', months: '4 miesiące kuracji', discount: 0.10 },
];

export const features = [
  { title: 'Unikalna formuła', text: 'N-acetylokarnozyna to forma karnozyny, która była przedmiotem badań klinicznych nad zdrowiem oczu.' },
  { title: 'Oryginał zatwierdzony przez IVP', text: 'Sprawdź oznaczenie Innovative Vision Products na opakowaniu. Sprzedajemy wyłącznie oryginalne krople.' },
  { title: 'Przy soczewkach kontaktowych', text: 'Preparat mogą stosować osoby noszące soczewki kontaktowe.' },
  { title: 'Komfort przy pracy z ekranem', text: 'Wsparcie dla oczu zmęczonych wielogodzinną pracą przy komputerze.' },
];

export const reviews = [
  { quote: 'Używam tych kropli od lat i są dla mnie niezawodne.', author: 'Miranda Sz.' },
  { quote: 'Dobrze nawilżają zmęczone oczy. Łatwo się je aplikuje.', author: 'Wacław' },
  { quote: 'Bardzo dobre krople nawilżające dla osób pracujących długo przy komputerze.', author: 'Stały klient' },
];

export const faqs = faqItems.filter((f) => f.home).map(({ q, a }) => ({ q, a }));

// Rabat zależy od liczby sztuk – ta sama funkcja posłuży później do liczenia ceny po stronie serwera
export const discountFor = (qty: number, product: Product) =>
  !product.bundles ? 0 : qty >= 4 ? 0.10 : qty >= 2 ? 0.08 : 0;

export const lineTotal = (product: Product, qty: number) =>
  product.price === null ? null : Math.round(product.price * qty * (1 - discountFor(qty, product)) * 100) / 100;

const pln = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });
export const formatPrice = (value: number | null) => (value === null ? '[CENA]' : pln.format(value));
