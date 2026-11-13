-- Krok 44: newsletter - zapis z obowiązkową zgodą (double opt-in), dziennik zgód, kampanie e-mail z panelu.
-- Subskrybenci to wiersze w customers (marketing_consent = true); osoby bez zamówień mają source = 'newsletter'.

-- Dziennik zgód marketingowych (dowód zgody: kiedy, skąd, jaka treść, skrót IP)
create table if not exists public.consent_log (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  customer_id uuid references public.customers(id) on delete set null,
  action      text not null check (action in ('requested', 'confirmed', 'granted', 'withdrawn')),
  source      text not null,             -- newsletter | checkout | panel | wypisanie z maila
  consent_text text,
  ip_hash     text,                      -- SHA-256 adresu IP (bez przechowywania samego IP)
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists consent_log_email_idx on public.consent_log (lower(email), created_at desc);
alter table public.consent_log enable row level security;

-- Kampanie (kreator w panelu: Automaty → Newsletter)
create table if not exists public.newsletter_campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                         -- nazwa wewnętrzna (też utm_campaign)
  subject     text not null default '',
  preheader   text not null default '',
  blocks      jsonb not null default '[]',           -- [{ type: heading|text|image|button|products|code|divider, ... }]
  audience    text not null default 'all' check (audience in ('all', 'buyers', 'no_orders', 'inactive_90')),
  status      text not null default 'draft' check (status in ('draft', 'sending', 'sent')),
  recipients  integer not null default 0,
  sent_count  integer not null default 0,
  failed_count integer not null default 0,
  started_at  timestamptz,
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text,
  updated_by  text
);
alter table public.newsletter_campaigns enable row level security;

-- Kolejka wysyłki: jeden wiersz na odbiorcę (wysyłka w paczkach, można wznowić)
create table if not exists public.newsletter_sends (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.newsletter_campaigns(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  email       text not null,
  first_name  text,
  status      text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  error       text,
  claimed_at  timestamptz,               -- początek wysyłki wiersza (wykrywanie przerwanych paczek)
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  unique (campaign_id, email)
);
create index if not exists newsletter_sends_queue_idx on public.newsletter_sends (campaign_id, status);
alter table public.newsletter_sends enable row level security;
