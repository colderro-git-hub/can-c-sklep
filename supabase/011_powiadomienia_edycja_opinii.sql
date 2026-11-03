-- =====================================================================
-- Can-C: „Powiadom mnie o dostępności”, edycja opinii w panelu
-- Uruchom raz w Supabase: SQL Editor → New query → wklej → Run.
-- =====================================================================
create table if not exists public.stock_notifications (
  id           uuid primary key default gen_random_uuid(),
  product_id   text not null references public.products (id) on delete cascade,
  email        text not null check (email = lower(email)),
  created_at   timestamptz not null default now(),
  notified_at  timestamptz
);
-- jedna aktywna prośba na e-mail i produkt
create unique index if not exists stock_notifications_active_uq
  on public.stock_notifications (product_id, email) where notified_at is null;
alter table public.stock_notifications enable row level security;

-- Edycja opinii: zapamiętujemy oryginalną treść i kto poprawiał
alter table public.reviews
  add column if not exists original_body text,
  add column if not exists edited_at     timestamptz,
  add column if not exists edited_by     text;
