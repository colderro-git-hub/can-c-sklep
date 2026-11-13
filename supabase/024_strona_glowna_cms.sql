-- Krok 56: edycja wszystkich tekstów strony głównej w /admin → Strony.
-- Nowe sekcje (tylko gdy ich nie ma) + uzupełnienie hero i opinii o nowe pola (istniejące wartości zostają).

insert into public.page_content (key, page, section, sort_order, data) values
('home.products', 'home', 'products', 12, '{
  "h2": "Produkty",
  "lead": "Krople do oczu, kapsułki i wersja dla psa. Wszystkie wysyłamy za darmo w ciągu 1 dnia roboczego.",
  "link_label": "Zobacz wszystkie",
  "link_href": "/sklep/"
}'::jsonb),
('home.bundles', 'home', 'bundles', 17, '{
  "h2": "Kupuj więcej, | płać mniej",
  "lead": "Jedno opakowanie wystarcza na około miesiąc. Dłuższa kuracja to niższa cena za sztukę, a dostawa zawsze jest darmowa.",
  "badge": "Polecany",
  "perks": ["Darmowa dostawa"],
  "button": "Wybierz zestaw"
}'::jsonb),
('home.faq', 'home', 'faq', 50, '{
  "h2": "Najczęstsze | pytania",
  "link_label": "Wszystkie pytania",
  "link_href": "/faq/"
}'::jsonb),
('home.newsletter', 'home', 'newsletter', 60, '{
  "h2": "Rabaty i nowości | na Twój e-mail",
  "text": "Zapisz się na newsletter - jako pierwszy dowiesz się o promocjach i dostaniesz kody rabatowe dla subskrybentów. Bez spamu, wypisujesz się jednym kliknięciem."
}'::jsonb)
on conflict (key) do nothing;

-- Hero: H1 w dwóch liniach (znak |) i boksy pod banerem - tylko gdy pól jeszcze nie ma
update public.page_content
   set data = (data - 'trust') || jsonb_build_object(
         'h1', case when coalesce(data->>'h1', '') in ('', 'Krople do oczu Can-C z N-acetylokarnozyną')
                    then 'Krople do oczu Can-C | z N-acetylokarnozyną' else data->>'h1' end,
         'trust_boxes', '["0 zł | InPost i DPD", "14 dni | Na zwrot", "BLIK | Przelewy24, karta"]'::jsonb)
 where key = 'home.hero' and not (data ? 'trust_boxes');

-- Opinie: tekst i przycisk karty „Napisz opinię”
update public.page_content
   set data = jsonb_build_object(
         'cta_text', 'Kupiłeś Can-C? Podziel się wrażeniami.',
         'cta_label', 'Napisz opinię',
         'cta_href', '/produkt/krople-can-c/#opinia'
       ) || data
 where key = 'home.reviews' and not (data ? 'cta_text');
