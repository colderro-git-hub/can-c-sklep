-- =====================================================================
-- Can-C krok 24: sekcja „Korzyści" na stronie głównej.
-- Uruchom w Supabase SQL Editor przed wdrożeniem kodu.
-- =====================================================================
insert into public.page_content (key, page, section, sort_order, data) values
('home.benefits', 'home', 'benefits', 15, '{
  "kicker": "DLACZEGO KROPLE CAN-C?",
  "h2": "Korzyści używania kropli Can-C",
  "items": [
    "Zmniejszają występowanie i rozwój zaćmy starczej.",
    "Pomagają obniżyć ciśnienie wewnątrzgałkowe związane z jaskrą.",
    "Korzystne przy dyskomforcie noszenia soczewek kontaktowych.",
    "Pomagają osobom cierpiącym na starczowzroczność.",
    "Pomagają przy walce z chorobami rogówki.",
    "Walka z przemęczeniem oczu.",
    "Łagodzą efekt zespołu suchego oka.",
    "Zwalczają zmętnienia i uszkodzenia ciała szklistego.",
    "Poprawiają funkcję starzejącego się oka.",
    "Łagodzą efekt zmęczenia wzroku podczas pracy przed komputerem.",
    "Przywracają ostrość widzenia."
  ],
  "cta_label": "Jak używać kropli Can-C",
  "cta_href": "/stosowanie/",
  "image_url": null,
  "image_alt": "Oko — korzyści stosowania kropli Can-C"
}'::jsonb)
on conflict (key) do nothing;
