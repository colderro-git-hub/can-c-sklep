-- Krok 48: korespondencja – odbiór poczty kontakt@can-c.pl przez Resend (webhook) i formularz /kontakt.
-- Wątki i wiadomości; załączniki w prywatnym buckecie „mail” (dostęp tylko przez Workera, linki czasowe).

create table if not exists public.mail_threads (
  id              uuid primary key default gen_random_uuid(),
  subject         text not null default '',
  contact_email   text not null,                 -- druga strona rozmowy (klient)
  contact_name    text,
  customer_id     uuid references public.customers(id) on delete set null,
  order_number    bigint,                        -- numer zamówienia znaleziony w temacie/treści
  category        text not null default 'customer' check (category in ('customer', 'system', 'other')),
                  -- customer: rozmowy z klientami · system: powiadomienia (bank, P24, kurierzy) · other: inne adresy w domenie
  status          text not null default 'open' check (status in ('open', 'closed', 'spam')),
  unread          integer not null default 0,
  message_count   integer not null default 0,
  last_message_at timestamptz not null default now(),
  last_direction  text check (last_direction in ('in', 'out')),
  snippet         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists mail_threads_list_idx on public.mail_threads (category, status, last_message_at desc);
create index if not exists mail_threads_contact_idx on public.mail_threads (lower(contact_email), last_message_at desc);
alter table public.mail_threads enable row level security;

create table if not exists public.mail_messages (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid not null references public.mail_threads(id) on delete cascade,
  direction     text not null check (direction in ('in', 'out')),
  source        text not null check (source in ('resend', 'form', 'panel', 'import')),
  message_id    text,                            -- nagłówek Message-ID (łączenie w wątki)
  in_reply_to   text,
  refs          text[] not null default '{}',    -- nagłówek References
  resend_id     text unique,                     -- id odebranej wiadomości w Resend (idempotencja webhooka)
  from_email    text not null,
  from_name     text,
  to_emails     text[] not null default '{}',
  cc_emails     text[] not null default '{}',
  subject       text not null default '',
  text_body     text,
  html_body     text,
  snippet       text,
  attachments   jsonb not null default '[]',     -- [{ name, type, size, path?, resend_id?, inline?, cid? }]
  auth          jsonb,                           -- SPF / DKIM / DMARC z Resend
  sent_by       text,                            -- admin, który odpowiedział z panelu
  sent_at       timestamptz not null default now(),  -- data z nagłówka (odebrane) albo wysyłki
  created_at    timestamptz not null default now()
);
create unique index if not exists mail_messages_message_id_key on public.mail_messages (message_id) where message_id is not null;
create index if not exists mail_messages_thread_idx on public.mail_messages (thread_id, sent_at);
alter table public.mail_messages enable row level security;

-- Prywatny bucket na załączniki (bez dostępu publicznego; Worker wydaje linki czasowe)
insert into storage.buckets (id, name, public, file_size_limit)
values ('mail', 'mail', false, 26214400)
on conflict (id) do nothing;
