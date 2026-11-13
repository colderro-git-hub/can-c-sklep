-- Krok 43, część 1 z 2: nowy status zamówienia „Kompletowanie” (packing).
-- Uruchom OSOBNO, przed 020b - Postgres nie pozwala użyć nowej wartości enum w tej samej transakcji.
alter type public.order_status add value if not exists 'packing' after 'paid';
