-- =====================================================================
-- Can-C krok 20: sekcja „Stosowanie” i termin realizacji na produkcie,
-- szybsza lista użyć kodów rabatowych.
-- Uruchom raz w Supabase PRZED wdrożeniem kodu: SQL Editor → New query → wklej → Run.
-- (Nowy kod odczytuje te kolumny - bez nich strony produktów zwrócą błąd).
-- =====================================================================

alter table public.products
  add column if not exists how_to_use text,   -- markdown, sekcja „Stosowanie” na stronie produktu
  add column if not exists lead_time text;   -- np. „w ciągu 3 dni roboczych”; puste = czas wysyłki z ustawień sklepu

comment on column public.products.how_to_use is 'Sekcja „Stosowanie” (markdown). Puste = sekcja ukryta.';
comment on column public.products.lead_time is 'Termin realizacji dla produktu. Puste = settings.site.shippingTime.';

-- Lista „kto użył kodu” w panelu filtruje zamówienia po discount_code
create index if not exists orders_discount_code_idx
  on public.orders (discount_code, created_at desc)
  where discount_code is not null;

-- robots.txt edytowany w panelu trzymamy w settings pod kluczem 'robots' - bez zmian w schemacie.
