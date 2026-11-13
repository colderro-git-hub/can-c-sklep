-- =====================================================================
-- Can-C: źródło ruchu zamówienia (UTM, kanał, urządzenie)
-- Uruchom raz w Supabase: SQL Editor → New query → wklej → Run.
-- Wypełniane przy imporcie z WooCommerce (Order Attribution),
-- a w nowym sklepie przy składaniu zamówienia - do analizy kanałów i kampanii PPC.
-- =====================================================================
alter table public.orders add column if not exists attribution jsonb;

create index if not exists orders_attribution_source_idx
  on public.orders ((attribution ->> 'utm_source'));
