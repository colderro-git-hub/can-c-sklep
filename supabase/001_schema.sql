-- =====================================================================
-- Can-C: struktura bazy sklepu (Supabase / PostgreSQL)
-- Uruchom raz w Supabase: SQL Editor → New query → wklej → Run.
--
-- Zasady bezpieczeństwa:
--  • Wszystkie kwoty w groszach (integer), tak samo jak w API Przelewy24.
--  • Zapis do tabel robi wyłącznie Worker kluczem service_role (omija RLS).
--  • Przeglądarka (klucz anon) może czytać tylko aktywne produkty,
--    a zalogowany klient tylko własne dane i zamówienia.
-- =====================================================================

-- ---------- Typy ----------
create type public.order_status as enum (
  'pending_payment',  -- utworzone, czeka na płatność
  'paid',             -- opłacone i potwierdzone w P24
  'on_hold',          -- wstrzymane (np. wyjaśnienie)
  'shipped',          -- nadane
  'completed',        -- zrealizowane / doręczone
  'cancelled',        -- anulowane
  'refunded',         -- zwrot środków
  'failed'            -- płatność nieudana
);

-- ---------- Wspólna funkcja: automatyczne updated_at ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- Produkty (źródło prawdy dla cen) ----------
create table public.products (
  id            text primary key,                 -- slug, np. 'krople-can-c'
  name          text not null,
  price         integer check (price >= 0),        -- brutto w groszach; null = niedostępny do zakupu
  bundles       boolean not null default false,    -- rabaty 8% od 2 szt., 10% od 4 szt.
  stock         integer not null default 0 check (stock >= 0),
  active        boolean not null default true,
  ean           text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger products_updated before update on public.products
  for each row execute function public.set_updated_at();

insert into public.products (id, name, price, bundles, stock) values
  ('krople-can-c',      'Krople Can-C 2 × 5 ml',   36900, true,  0),
  ('krople-can-c-k9',   'Krople Can-C K9',         null,  true,  0),
  ('kapsulki-can-c-60', 'Kapsułki Can-C 60 szt.',  null,  false, 0),
  ('kapsulki-can-c-90', 'Kapsułki Can-C 90 szt.',  null,  false, 0);

-- ---------- Klienci ----------
-- Klient istnieje także bez konta (zakupy jako gość, import z WooCommerce).
-- user_id wypełnia się dopiero, gdy klient potwierdzi e-mail w Supabase Auth.
create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null unique check (email = lower(email)),
  first_name         text,
  last_name          text,
  phone              text,
  default_address    jsonb,                        -- { street, postcode, city, country }
  default_locker     text,                          -- kod Paczkomatu InPost
  user_id            uuid unique references auth.users (id) on delete set null,
  marketing_consent  boolean not null default false,
  consent_at         timestamptz,
  consent_source     text,                          -- np. 'checkout', 'newsletter', 'woocommerce'
  source             text not null default 'shop',  -- 'shop' | 'woocommerce'
  wc_customer_id     integer unique,                -- identyfikator z WooCommerce (import)
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------- Zamówienia ----------
-- Numeracja kontynuuje WooCommerce: po imporcie ustawimy licznik na ostatni numer + 1.
create sequence public.order_number_seq start 20000;

create table public.orders (
  id                uuid primary key default gen_random_uuid(),  -- = sessionId w Przelewy24
  number            bigint not null unique default nextval('public.order_number_seq'),
  customer_id       uuid references public.customers (id) on delete set null,
  email             text not null check (email = lower(email)),
  status            public.order_status not null default 'pending_payment',

  subtotal          integer not null check (subtotal >= 0),      -- suma przed rabatem
  discount          integer not null default 0 check (discount >= 0),
  shipping_cost     integer not null default 0 check (shipping_cost >= 0),
  total             integer not null check (total >= 0),         -- do zapłaty
  currency          text not null default 'PLN',

  shipping_method   text,            -- 'inpost_locker' | 'dpd' | inne z importu
  shipping_point    text,            -- kod Paczkomatu
  shipping_address  jsonb,           -- { name, street, postcode, city, country, phone }
  billing           jsonb,           -- { company, nip, street, postcode, city } gdy faktura
  wants_invoice     boolean not null default false,
  customer_note     text,

  payment_provider  text,            -- 'przelewy24' | z importu
  p24_order_id      bigint unique,   -- orderId nadany przez P24 po płatności
  paid_at           timestamptz,

  carrier           text,
  tracking_number   text,
  shipped_at        timestamptz,

  source            text not null default 'shop',  -- 'shop' | 'woocommerce'
  wc_order_id       integer unique,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint orders_amounts_check check (total = subtotal - discount + shipping_cost)
);
create index orders_customer_idx on public.orders (customer_id);
create index orders_email_idx on public.orders (email);
create index orders_status_idx on public.orders (status);
create trigger orders_updated before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------- Pozycje zamówienia ----------
-- Nazwa i ceny są zapisane w chwili zakupu, więc późniejsza zmiana cennika nie zmienia historii.
create table public.order_items (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  product_id  text references public.products (id) on delete set null,  -- null dla nieistniejących już produktów z importu
  name        text not null,
  qty         integer not null check (qty > 0),
  unit_price  integer not null check (unit_price >= 0),
  discount    integer not null default 0 check (discount >= 0),
  total       integer not null check (total >= 0)
);
create index order_items_order_idx on public.order_items (order_id);

-- ---------- Dziennik zdarzeń (płatności, zmiany statusu) ----------
-- Tu trafiają m.in. surowe powiadomienia z P24 – przydatne przy reklamacjach i księgowości.
create table public.order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders (id) on delete cascade,
  type        text not null,          -- np. 'created', 'p24_notification', 'p24_verified', 'status_change'
  data        jsonb,
  created_at  timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.products     enable row level security;
alter table public.customers    enable row level security;
alter table public.orders       enable row level security;
alter table public.order_items  enable row level security;
alter table public.order_events enable row level security;  -- brak polityk = tylko serwer

-- Produkty: każdy może czytać aktywne
create policy "produkty publiczne" on public.products
  for select to anon, authenticated using (active);

-- Klient: tylko własny profil
create policy "własny profil" on public.customers
  for select to authenticated using (user_id = auth.uid());

-- Zamówienia: tylko własne
create policy "własne zamówienia" on public.orders
  for select to authenticated using (
    customer_id in (select c.id from public.customers c where c.user_id = auth.uid())
  );

-- Pozycje: tylko z własnych zamówień
create policy "pozycje własnych zamówień" on public.order_items
  for select to authenticated using (
    order_id in (
      select o.id from public.orders o
      join public.customers c on c.id = o.customer_id
      where c.user_id = auth.uid()
    )
  );

-- =====================================================================
-- Łączenie konta z historią zakupów
-- Gdy klient POTWIERDZI e-mail (link z maila), jego konto zostaje połączone
-- z rekordem klienta o tym samym adresie – razem z zamówieniami z importu
-- i zakupami jako gość. Przed potwierdzeniem nikt nie zobaczy cudzych zamówień.
-- =====================================================================
create or replace function public.link_customer_to_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is not null
     and (tg_op = 'INSERT' or old.email_confirmed_at is null) then

    update public.customers
       set user_id = new.id
     where email = lower(new.email)
       and user_id is null;

    if not found then
      insert into public.customers (email, user_id, source)
      values (lower(new.email), new.id, 'shop')
      on conflict (email) do nothing;
    end if;
  end if;
  return new;
end $$;

create trigger on_auth_user_confirmed
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.link_customer_to_user();
