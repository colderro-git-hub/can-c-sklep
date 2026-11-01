// Dane tymczasowe. W kroku z Supabase te listy będą pobierane z bazy (panel admina).

export type Product = {
  slug: string;
  tag: string;
  name: string;
  desc: string;
  price: number | null; // brutto w zł; null = cena do uzupełnienia
  image?: string;       // ścieżka w /public/images
};

export const products: Product[] = [
  { slug: 'krople-can-c', tag: 'KROPLE', name: 'Krople Can-C 2 × 5 ml', desc: 'Oryginalne krople z N-acetylokarnozyną. Miesięczna kuracja.', price: 369 },
  { slug: 'krople-can-c-k9', tag: 'DLA PSA', name: 'Krople Can-C K9', desc: 'Wersja kropli przeznaczona dla psów.', price: null },
  { slug: 'kapsulki-can-c-60', tag: 'KAPSUŁKI', name: 'Kapsułki Can-C 60 szt.', desc: 'Uzupełnienie kuracji kroplami Can-C.', price: null },
  { slug: 'kapsulki-can-c-90', tag: 'KAPSUŁKI', name: 'Kapsułki Can-C 90 szt.', desc: 'Większe opakowanie na dłuższą kurację.', price: null },
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
  { quote: 'Brak konserwantów, długa data ważności po otwarciu, można stosować pod soczewki miękkie.', author: 'Marek' },
  { quote: 'Dobrze nawilżają zmęczone oczy. Łatwo się je aplikuje.', author: 'Wacław' },
  { quote: 'Bardzo dobre krople nawilżające dla osób pracujących długo przy komputerze.', author: 'Stały klient' },
];

export const faqs = [
  { q: 'Czym są krople Can-C?', a: 'To krople do oczu z N-acetylokarnozyną (NAC), formą karnozyny opracowaną do stosowania do oczu. Produkt jest zatwierdzony przez Innovative Vision Products (IVP).' },
  { q: 'Czym N-acetylokarnozyna różni się od L-karnozyny?', a: 'To spokrewnione, ale różne związki. Do stosowania do oczu przeznaczona jest wyłącznie N-acetylokarnozyna; innych form karnozyny nie należy aplikować do oczu.' },
  { q: 'Czy mogę stosować krople przy soczewkach?', a: 'Tak, preparat może być stosowany przez użytkowników soczewek kontaktowych.' },
  { q: 'Na jak długo wystarcza jedno opakowanie?', a: 'Jedno opakowanie (2 × 5 ml) to około miesiąca kuracji.' },
  { q: 'Jak szybko wysyłacie zamówienia?', a: '[Do uzupełnienia: czas realizacji i przewoźnicy]' },
];

const pln = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' });
export const formatPrice = (value: number | null) => (value === null ? '[CENA]' : pln.format(value));
