// Jedno źródło pytań: strona /faq/ pokazuje wszystkie, strona główna te z home: true.
// Akapity odpowiedzi rozdzielaj pustą linią (\n\n).

export type FaqCategory = 'produkt' | 'stosowanie' | 'zamowienia' | 'zwroty';

export const faqCategories: { id: FaqCategory; label: string }[] = [
  { id: 'produkt', label: 'Produkt' },
  { id: 'stosowanie', label: 'Stosowanie' },
  { id: 'zamowienia', label: 'Zamówienia i dostawa' },
  { id: 'zwroty', label: 'Płatności i zwroty' },
];

export const faqItems: { id: string; cat: FaqCategory; q: string; a: string; home?: boolean }[] = [
  { id: 'czym-sa', cat: 'produkt', home: true, q: 'Czym są krople Can-C?',
    a: 'To krople do oczu z N-acetylokarnozyną (NAC), formą karnozyny opracowaną do stosowania do oczu. Są produkowane w warunkach ISO i cGMP w licencjonowanym zakładzie okulistycznym i zatwierdzone przez Innovative Vision Products (IVP).\n\nKażde opakowanie zawiera dwie fiolki po 5 ml oraz ulotkę.' },
  { id: 'sklad', cat: 'produkt', q: 'Co zawierają krople?',
    a: 'Składniki aktywne: N-acetylokarnozyna 1,0%, gliceryna 1,0%, karboksymetyloceluloza sodowa 0,3%.\n\nSubstancje pomocnicze: sterylna woda (roztwór izotoniczny, pH 6,7–6,9), wodorowęglan potasu, kwas borowy oraz alkohol benzylowy jako łagodny środek konserwujący.' },
  { id: 'nac-vs-l', cat: 'produkt', home: true, q: 'Czym N-acetylokarnozyna różni się od L-karnozyny?',
    a: 'To spokrewnione, ale różne związki. Do stosowania do oczu przeznaczona jest wyłącznie N-acetylokarnozyna, która stopniowo przenika przez rogówkę. L-karnozyny ani innych form karnozyny nie należy aplikować do oczu.' },
  { id: 'k9', cat: 'produkt', q: 'Czy jest wersja dla psów?',
    a: 'Tak, krople Can-C K9 są przeznaczone dla psów. Kurację warto skonsultować z lekarzem weterynarii.' },
  { id: 'dawkowanie', cat: 'stosowanie', q: 'Jak dawkować krople?',
    a: '1–2 krople do oka dwa razy dziennie. Nie stosuj więcej niż 4 krople do oka dziennie.\n\nProfilaktycznie wystarczy 1 kropla raz dziennie z okresowymi przerwami.' },
  { id: 'kuracja', cat: 'stosowanie', q: 'Jak długo trwa kuracja?',
    a: 'Pierwsze efekty mogą pojawić się po miesiącu. Producent zaleca stosowanie przez co najmniej 3–5 miesięcy.' },
  { id: 'soczewki', cat: 'stosowanie', home: true, q: 'Czy mogę stosować krople przy soczewkach kontaktowych?',
    a: 'Tak, preparat mogą stosować osoby noszące soczewki kontaktowe, także miękkie.' },
  { id: 'opakowanie', cat: 'stosowanie', home: true, q: 'Na jak długo wystarcza jedno opakowanie?',
    a: 'Przy standardowym dawkowaniu około miesiąca.' },
  { id: 'dostawa', cat: 'zamowienia', q: 'Ile kosztuje dostawa?',
    a: 'Dostawa w Polsce jest darmowa: do Paczkomatu InPost lub kurierem DPD.' },
  { id: 'wysylka', cat: 'zamowienia', home: true, q: 'Kiedy wyślecie moje zamówienie?',
    a: '[Do uzupełnienia: czas realizacji]. Numer przesyłki dostaniesz e-mailem i zobaczysz w swoim koncie.' },
  { id: 'konto', cat: 'zamowienia', q: 'Czy muszę zakładać konto?',
    a: 'Nie. Możesz zamówić jako gość. Konto pozwala śledzić zamówienia, pobierać faktury i szybciej zamawiać ponownie.' },
  { id: 'platnosci', cat: 'zwroty', q: 'Jakie są formy płatności?',
    a: 'BLIK, szybki przelew (Przelewy24), karta płatnicza, Apple Pay i Google Pay.' },
  { id: 'faktura', cat: 'zwroty', q: 'Czy wystawiacie faktury?',
    a: 'Tak. Zaznacz w zamówieniu, że chcesz fakturę na firmę, i podaj NIP. Faktura będzie do pobrania w Twoim koncie.' },
  { id: 'zwrot', cat: 'zwroty', q: 'Jak zwrócić produkt?',
    a: 'Masz 14 dni na odstąpienie od umowy. Zgłoś zwrot w swoim koncie albo przez formularz szybkich zwrotów, wydrukuj etykietę i nadaj paczkę.\n\nZe względów higienicznych zwrotowi podlegają produkty w nienaruszonym opakowaniu.' },
];
