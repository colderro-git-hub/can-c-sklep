-- =====================================================================
-- Can-C: dane do faktury w profilu, kody rabatowe
-- Uruchom raz w Supabase: SQL Editor → New query → wklej → Run.
-- =====================================================================

-- Dane do faktury zapisane w profilu klienta { company, nip, street, postcode, city }
alter table public.customers add column if not exists billing jsonb;

-- ---------- Kody rabatowe ----------
create table if not exists public.discount_codes (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,30}$'),
  type               text not null check (type in ('percent', 'amount')),
  value              integer not null check (value > 0),           -- procent (1-100) albo kwota w groszach
  min_total          integer not null default 0 check (min_total >= 0),  -- minimalna wartość koszyka po rabacie zestawowym (grosze)
  starts_at          timestamptz,
  ends_at            timestamptz,
  max_uses           integer check (max_uses > 0),                 -- null = bez limitu
  once_per_customer  boolean not null default true,
  customer_id        uuid references public.customers (id) on delete cascade, -- null = kod ogólny
  active             boolean not null default true,
  used_count         integer not null default 0,
  description        text,
  created_at         timestamptz not null default now(),
  constraint discount_percent_range check (type <> 'percent' or value <= 100)
);
create index if not exists discount_codes_customer_idx on public.discount_codes (customer_id);

create table if not exists public.discount_code_uses (
  id           bigint generated always as identity primary key,
  code_id      uuid not null references public.discount_codes (id) on delete cascade,
  order_id     uuid not null unique references public.orders (id) on delete cascade,
  customer_id  uuid references public.customers (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists discount_code_uses_code_idx on public.discount_code_uses (code_id, customer_id);

-- Kod użyty w zamówieniu (rabat z kodu jest też wliczony w orders.discount)
alter table public.orders add column if not exists discount_code text;
alter table public.orders add column if not exists discount_code_amount integer not null default 0 check (discount_code_amount >= 0);

-- Tylko serwer (klucz secret) ma dostęp - brak polityk dla klientów
alter table public.discount_codes enable row level security;
alter table public.discount_code_uses enable row level security;

-- Zapis użycia kodu po opłaceniu zamówienia (wywołuje Worker po potwierdzeniu P24)
create or replace function public.redeem_discount(p_order uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text; v_customer uuid; v_code_id uuid;
begin
  select discount_code, customer_id into v_code, v_customer from public.orders where id = p_order;
  if v_code is null then return; end if;
  select id into v_code_id from public.discount_codes where code = v_code;
  if v_code_id is null then return; end if;
  insert into public.discount_code_uses (code_id, order_id, customer_id)
  values (v_code_id, p_order, v_customer)
  on conflict (order_id) do nothing;
  if found then
    update public.discount_codes set used_count = used_count + 1 where id = v_code_id;
  end if;
end $$;

revoke execute on function public.redeem_discount(uuid) from public, anon, authenticated;
grant execute on function public.redeem_discount(uuid) to service_role;
