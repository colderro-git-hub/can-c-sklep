-- Punkt 11: dziennik błędów + alerty e-mail (podgląd: /admin → Ustawienia sklepu → Błędy systemu).
create table if not exists public.error_log (
  id           uuid primary key default gen_random_uuid(),
  fingerprint  text not null unique,           -- obszar + treść bez liczb i identyfikatorów (grupowanie powtórzeń)
  area         text not null,                  -- np. „P24”, „E-mail do klienta”, „HTTP 500”
  message      text not null,                  -- ostatnia treść błędu
  critical     boolean not null default false, -- wysyłany alert e-mail
  count        integer not null default 1,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  notified_at  timestamptz,
  resolved_at  timestamptz                      -- „przejrzane” w panelu; nowe wystąpienie zeruje
);
create index if not exists error_log_last_idx on public.error_log (last_seen desc);
alter table public.error_log enable row level security;
