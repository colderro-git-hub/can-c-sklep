-- =====================================================================
-- Can-C: ustawienia sklepu edytowane w panelu admina (dane firmy, kontakt)
-- Uruchom raz w Supabase: SQL Editor → New query → wklej → Run.
-- =====================================================================
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
-- Dostęp wyłącznie przez serwer (klucz secret); strona pobiera dane przez /api/ustawienia
alter table public.settings enable row level security;
