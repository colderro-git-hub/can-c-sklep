-- =====================================================================
-- Can-C krok 23: tabela page_content – CMS dla stron frontendu.
-- Uruchom raz w Supabase SQL Editor przed wdrożeniem kodu.
-- =====================================================================

create table if not exists public.page_content (
  key        text primary key,         -- np. 'home.hero', 'faq.1', 'footer.links'
  page       text not null,            -- 'home' | 'about' | 'how_to_use' | 'faq' | 'footer'
  section    text not null,            -- 'hero' | 'why' | 'reviews' | 'k9' | 'faq' | 'about' | ...
  sort_order int  not null default 0,
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.page_content is 'Treści edytowalne stron frontendu (CMS). Każdy wiersz = jedna sekcja lub element.';

-- RLS: odczyt publiczny, zapis tylko przez Worker kluczem secret
alter table public.page_content enable row level security;
create policy "public read"  on public.page_content for select using (true);
-- INSERT/UPDATE/DELETE tylko przez service_role (Worker)

-- Indeks do listowania po stronie
create index if not exists page_content_page_idx on public.page_content (page, sort_order);

-- ----------------------------------------------------------------
-- Dane startowe – przepisane z kodu, gotowe do edycji w panelu
-- ----------------------------------------------------------------

insert into public.page_content (key, page, section, sort_order, data) values

-- ===== STRONA GŁÓWNA =====
('home.hero', 'home', 'hero', 10, '{
  "kicker": "Oryginalne krople zatwierdzone przez IVP",
  "h1": "Krople do oczu Can-C z N-acetylokarnozyną",
  "lead": "Codzienne wsparcie dla zmęczonych oczu. Można stosować przy soczewkach kontaktowych. Jedno opakowanie to miesięczna kuracja.",
  "cta_primary_label": "Zamów krople",
  "cta_primary_href": "/produkt/krople-can-c/",
  "cta_secondary_label": "Jak stosować",
  "cta_secondary_href": "/stosowanie/",
  "trust": ["Darmowa dostawa InPost i kurier", "BLIK, Przelewy24, karta", "Zwrot do 14 dni"],
  "image_url": null,
  "image_alt": "Krople Can-C 2 × 5 ml"
}'::jsonb),

('home.why', 'home', 'why', 20, '{
  "h2": "Dlaczego krople Can-C",
  "lead": "Pierwsze krople na świecie z N-acetylokarnozyną, badane i zatwierdzone przez Innovative Vision Products.",
  "link_label": "Przeczytaj, jak stosować",
  "link_href": "/stosowanie/",
  "features": [
    {"title": "Unikalna formuła", "text": "N-acetylokarnozyna to forma karnozyny, która była przedmiotem badań klinicznych nad zdrowiem oczu."},
    {"title": "Oryginał zatwierdzony przez IVP", "text": "Sprawdź oznaczenie Innovative Vision Products na opakowaniu. Sprzedajemy wyłącznie oryginalne krople."},
    {"title": "Przy soczewkach kontaktowych", "text": "Preparat mogą stosować osoby noszące soczewki kontaktowe."},
    {"title": "Bezpieczny skład", "text": "Bez agresywnych konserwantów. Skonsultuj stosowanie z okulistą, jeśli masz zdiagnozowaną chorobę oczu."}
  ]
}'::jsonb),

('home.reviews', 'home', 'reviews', 30, '{
  "h2": "Opinie klientów",
  "items": [
    {"quote": "Używam tych kropli od lat i są dla mnie niezawodne.", "author": "Miranda Sz."},
    {"quote": "Dobrze nawilżają zmęczone oczy. Łatwo się je aplikuje.", "author": "Wacław"},
    {"quote": "Bardzo dobre krople nawilżające dla osób pracujących długo przy komputerze.", "author": "Stały klient"}
  ]
}'::jsonb),

('home.k9', 'home', 'k9', 40, '{
  "tag": "DLA PSA",
  "h2": "Krople Can-C K9 z N-acetylokarnozyną",
  "lead": "Wersja dla psów. Wielu właścicieli stosuje je profilaktycznie u ras podatnych na problemy z oczami. Skonsultuj kurację z lekarzem weterynarii.",
  "cta_label": "Zobacz Can-C K9",
  "cta_href": "/produkt/krople-can-c-k9/",
  "image_url": null,
  "image_alt": "Pies + krople Can-C K9"
}'::jsonb),

-- ===== FAQ =====
('faq.czym-sa', 'faq', 'item', 10, '{"cat":"produkt","home":true,"q":"Czym są krople Can-C?","a":"To krople do oczu z N-acetylokarnozyną (NAC), formą karnozyny opracowaną do stosowania do oczu. Są produkowane w warunkach ISO i cGMP w licencjonowanym zakładzie okulistycznym i zatwierdzone przez Innovative Vision Products (IVP).\n\nKażde opakowanie zawiera dwie fiolki po 5 ml oraz ulotkę."}'::jsonb),
('faq.sklad', 'faq', 'item', 20, '{"cat":"produkt","home":false,"q":"Co zawierają krople?","a":"Składniki aktywne: N-acetylokarnozyna 1,0%, gliceryna 1,0%, karboksymetyloceluloza sodowa 0,3%.\n\nSubstancje pomocnicze: sterylna woda (roztwór izotoniczny, pH 6,7–6,9), wodorowęglan potasu, kwas borowy oraz alkohol benzylowy jako łagodny środek konserwujący."}'::jsonb),
('faq.nac-vs-l', 'faq', 'item', 30, '{"cat":"produkt","home":true,"q":"Czym N-acetylokarnozyna różni się od L-karnozyny?","a":"To spokrewnione, ale różne związki. Do stosowania do oczu przeznaczona jest wyłącznie N-acetylokarnozyna, która stopniowo przenika przez rogówkę. L-karnozyny ani innych form karnozyny nie należy aplikować do oczu."}'::jsonb),
('faq.k9', 'faq', 'item', 40, '{"cat":"produkt","home":false,"q":"Czy jest wersja dla psów?","a":"Tak, krople Can-C K9 są przeznaczone dla psów. Kurację warto skonsultować z lekarzem weterynarii."}'::jsonb),
('faq.dawkowanie', 'faq', 'item', 50, '{"cat":"stosowanie","home":false,"q":"Jak dawkować krople?","a":"1–2 krople do oka dwa razy dziennie. Nie stosuj więcej niż 4 krople do oka dziennie.\n\nProfilaktycznie wystarczy 1 kropla raz dziennie z okresowymi przerwami."}'::jsonb),
('faq.kuracja', 'faq', 'item', 60, '{"cat":"stosowanie","home":false,"q":"Jak długo trwa kuracja?","a":"Pierwsze efekty mogą pojawić się po miesiącu. Producent zaleca stosowanie przez co najmniej 3–5 miesięcy."}'::jsonb),
('faq.soczewki', 'faq', 'item', 70, '{"cat":"stosowanie","home":true,"q":"Czy mogę stosować krople przy soczewkach kontaktowych?","a":"Tak, preparat mogą stosować osoby noszące soczewki kontaktowe, także miękkie."}'::jsonb),
('faq.opakowanie', 'faq', 'item', 80, '{"cat":"stosowanie","home":true,"q":"Na jak długo wystarcza jedno opakowanie?","a":"Przy standardowym dawkowaniu około miesiąca."}'::jsonb),
('faq.dostawa', 'faq', 'item', 90, '{"cat":"zamowienia","home":false,"q":"Ile kosztuje dostawa?","a":"Dostawa w Polsce jest darmowa: do Paczkomatu InPost lub kurierem DPD."}'::jsonb),
('faq.wysylka', 'faq', 'item', 100, '{"cat":"zamowienia","home":true,"q":"Kiedy wyślecie moje zamówienie?","a":"Zamówienia opłacone w dni robocze wysyłamy {shippingTime}. Numer przesyłki dostaniesz e-mailem i zobaczysz w swoim koncie."}'::jsonb),
('faq.konto', 'faq', 'item', 110, '{"cat":"zamowienia","home":false,"q":"Czy muszę zakładać konto?","a":"Nie. Możesz zamówić jako gość. Konto pozwala śledzić zamówienia, pobierać faktury i szybciej zamawiać ponownie."}'::jsonb),
('faq.platnosci', 'faq', 'item', 120, '{"cat":"zwroty","home":false,"q":"Jakie są formy płatności?","a":"BLIK, szybki przelew (Przelewy24), karta płatnicza, Apple Pay i Google Pay."}'::jsonb),
('faq.faktura', 'faq', 'item', 130, '{"cat":"zwroty","home":false,"q":"Czy wystawiacie faktury?","a":"Tak. Zaznacz w zamówieniu, że chcesz fakturę na firmę, i podaj NIP. Faktura będzie do pobrania w Twoim koncie."}'::jsonb),
('faq.zwrot', 'faq', 'item', 140, '{"cat":"zwroty","home":false,"q":"Jak zwrócić produkt?","a":"Masz 14 dni na odstąpienie od umowy. Zgłoś zwrot w swoim koncie albo przez formularz szybkich zwrotów, wydrukuj etykietę i nadaj paczkę.\n\nZe względów higienicznych zwrotowi podlegają produkty w nienaruszonym opakowaniu."}'::jsonb),

-- ===== O NAS =====
('about.intro', 'about', 'intro', 10, '{
  "lead": "Oryginalne krople Can-C sprzedajemy od 2013 roku. Stawiamy na sprawdzone produkty, szybką wysyłkę i obsługę, z którą łatwo się porozumieć."
}'::jsonb),

('about.who', 'about', 'who', 20, '{
  "h2": "Kim jesteśmy",
  "paragraphs": [
    "Sklep can-c.pl prowadzi firma {company}. Od początku sprzedajemy wyłącznie oryginalne produkty renomowanych producentów z branży optycznej – w tym krople Can-C zatwierdzone przez Innovative Vision Products (IVP).",
    "Wszystkie zamówienia realizujemy przez sklep internetowy. Nie prowadzimy sprzedaży stacjonarnej."
  ]
}'::jsonb),

('about.promise', 'about', 'promise', 30, '{
  "h2": "Na co możesz liczyć",
  "items": [
    "Oryginalne produkty z pewnego źródła.",
    "Darmowa dostawa w Polsce i szybka wysyłka.",
    "Rabaty przy zakupie zestawów na dłuższą kurację.",
    "Konto z historią zamówień i ponownym zamówieniem jednym kliknięciem.",
    "Kontakt z człowiekiem: {hours}."
  ]
}'::jsonb),

-- ===== STOSOWANIE =====
('how_to_use.intro', 'how_to_use', 'intro', 10, '{
  "h1": "Jak stosować krople Can-C",
  "lead": "Pierwsze efekty mogą pojawić się po miesiącu. Producent zaleca kurację trwającą co najmniej 3–5 miesięcy."
}'::jsonb),

('how_to_use.dosage', 'how_to_use', 'dosage', 20, '{
  "h2": "Dawkowanie",
  "note": "Krople Can-C nie zastępują leczenia. Jeśli masz zdiagnozowaną chorobę oczu, przed rozpoczęciem kuracji porozmawiaj z okulistą.",
  "doses": [
    {"num": "1–2", "title": "krople do oka, dwa razy dziennie", "desc": "Standardowe dawkowanie w trakcie kuracji."},
    {"num": "4",   "title": "krople do oka dziennie to maksimum", "desc": "Większa dawka nie daje dodatkowych korzyści. Nie przekraczaj jej."},
    {"num": "1",   "title": "kropla raz dziennie, profilaktycznie", "desc": "Po zakończeniu kuracji, z okresowymi przerwami."}
  ]
}'::jsonb),

('how_to_use.opening', 'how_to_use', 'opening', 30, '{
  "h2": "Otwieranie fiolki",
  "lead": "Fiolka jest fabrycznie zamknięta. Przy pierwszym użyciu przebijasz ją kolcem w nakrętce.",
  "steps": [
    "Zdejmij dolny pierścień zabezpieczający.",
    "Dokręć nakrętkę zgodnie z ruchem wskazówek zegara. Kolec w nakrętce przebije dyszę.",
    "Odkręć nakrętkę w przeciwnym kierunku i zdejmij ją.",
    "Delikatnie naciśnij fiolkę, aby wydobyć kroplę. Po użyciu załóż nakrętkę."
  ]
}'::jsonb),

('how_to_use.applying', 'how_to_use', 'applying', 40, '{
  "h2": "Zakraplanie",
  "steps": [
    {"title": "Odchyl głowę do tyłu", "desc": "Patrz w górę. Przy problemach z szyją połóż się lub usiądź w fotelu z odchylanym oparciem."},
    {"title": "Zakroplij jedną kroplę", "desc": "Nie dotykaj końcówką fiolki oka ani rzęs."},
    {"title": "Powoli zamknij oko", "desc": "Zamknij je delikatnie, bez zaciskania powiek."},
    {"title": "Odczekaj 60 sekund", "desc": "Nie mrugaj i nie otwieraj oka. W tym czasie kropla wchłania się w tkankę."},
    {"title": "Powtórz przy drugiej kropli", "desc": "Jeśli stosujesz dwie krople, powtórz całą procedurę."}
  ]
}'::jsonb),

-- ===== STOPKA =====
('footer.columns', 'footer', 'columns', 10, '{
  "columns": [
    {"title": "Sklep", "links": [
      {"href": "/produkt/krople-can-c/", "label": "Krople Can-C"},
      {"href": "/produkt/krople-can-c-k9/", "label": "Can-C K9 dla psa"},
      {"href": "/#produkty", "label": "Kapsułki 60 i 90"},
      {"href": "/konto/", "label": "Moje konto"}
    ]},
    {"title": "Zakupy", "links": [
      {"href": "/formy-dostawy/", "label": "Formy dostawy"},
      {"href": "/formy-platnosci/", "label": "Formy płatności"},
      {"href": "/odstapienie-od-umowy/", "label": "Zwroty i reklamacje"},
      {"href": "/odstapienie-od-umowy/#odstapienie", "label": "Odstąp od umowy"}
    ]},
    {"title": "Informacje", "links": [
      {"href": "/o-nas/", "label": "O nas"},
      {"href": "/regulamin/", "label": "Regulamin"},
      {"href": "/polityka-prywatnosci/", "label": "Polityka prywatności"},
      {"href": "/kontakt/", "label": "Kontakt"}
    ]}
  ]
}'::jsonb),

('footer.badges', 'footer', 'badges', 20, '{
  "items": ["BLIK", "Przelewy24", "Karta", "InPost Paczkomat", "Kurier DPD"]
}'::jsonb)

on conflict (key) do nothing;
