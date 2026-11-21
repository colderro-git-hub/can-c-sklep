-- Karuzela w hero: sekcja na slajdy 2-4 (edycja: /admin → Strony → Strona główna → „Hero - kolejne slajdy”).
-- Bez wypełnionych slajdów hero działa jak dotąd (jeden slajd).
insert into public.page_content (key, page, section, sort_order, data) values
('home.hero_slides', 'home', 'hero_slides', 6, '{ "interval": "10" }'::jsonb)
on conflict (key) do nothing;
