-- Krok 40: promocje automatyczne - rabaty ilościowe i zestawowe (panel: Kody rabatowe → Promocje).
-- Zastępują zaszyty w kodzie rabat −8% (2 szt.) / −10% (4 szt.) - ten sam rabat zakładamy niżej jako pierwszą promocję.

create table if not exists public.promotions (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                     -- nazwa w panelu
  label       text,                              -- nazwa dla klienta (puste = name)
  kind        text not null check (kind in ('quantity', 'bundle')),
  active      boolean not null default true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  -- rabat ilościowy
  product_ids text[] not null default '{}',
  combined    boolean not null default false,    -- sumuj sztuki różnych produktów z listy
  tiers       jsonb not null default '[]',       -- [{ "min": 2, "type": "percent"|"amount", "value": 8 }] (amount: grosze za sztukę)
  -- zestaw
  items       jsonb not null default '[]',       -- [{ "product_id": "krople-can-c", "qty": 1 }]
  type        text not null default 'percent' check (type in ('percent', 'amount')),
  value       integer not null default 0,        -- % albo grosze za komplet
  max_sets    integer check (max_sets is null or max_sets > 0),
  with_codes  boolean not null default true,     -- łączy się z kodami rabatowymi
  sort_order  integer not null default 0,
  description text,                              -- notatka wewnętrzna
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  text,
  updated_by  text
);
alter table public.promotions enable row level security;  -- odczyt i zapis tylko przez Workera (klucz secret)

-- Promocje naliczone w zamówieniu (do statystyk: użycia, klienci, przychód)
create table if not exists public.order_promotions (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  promotion_id uuid references public.promotions(id) on delete set null,
  name         text not null,
  kind         text not null,
  amount       integer not null check (amount >= 0),
  created_at   timestamptz not null default now(),
  unique (order_id, promotion_id)
);
create index if not exists order_promotions_promotion_idx on public.order_promotions (promotion_id);
alter table public.order_promotions enable row level security;

-- Dotychczasowy rabat za zestaw jako promocja (tylko przy pierwszym uruchomieniu)
insert into public.promotions (name, label, kind, product_ids, tiers, sort_order, description)
select 'Rabat za zestaw (2 i 4 opakowania)', 'Rabat za zestaw', 'quantity',
       coalesce(array_agg(id order by id), '{}'),
       '[{"min":2,"type":"percent","value":8},{"min":4,"type":"percent","value":10}]'::jsonb,
       10, 'Przeniesione z kodu sklepu (krok 40).'
  from public.products
 where bundles = true
having not exists (select 1 from public.promotions);
