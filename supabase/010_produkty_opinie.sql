-- =====================================================================
-- Can-C: pełne dane produktów, historia cen (Omnibus), zdjęcia, opinie
-- Uruchom raz w Supabase: SQL Editor → New query → wklej → Run.
-- =====================================================================

-- ---------- Produkty: nowe pola ----------
alter table public.products
  add column if not exists vat_rate            integer not null default 23 check (vat_rate in (0, 5, 8, 23)),
  add column if not exists sale_price          integer check (sale_price >= 0),          -- cena promocyjna (grosze)
  add column if not exists sale_start          timestamptz,
  add column if not exists sale_end            timestamptz,
  add column if not exists short_description   text,
  add column if not exists description         text,                                      -- opis długi (prosty Markdown)
  add column if not exists highlights          text[] not null default '{}',              -- wyróżniki (punkty)
  add column if not exists seo_title           text,
  add column if not exists seo_description     text,
  add column if not exists tags                text[] not null default '{}',
  add column if not exists images              jsonb not null default '[]',               -- [{ url, alt }], pierwsze = główne
  add column if not exists brand               text not null default 'Can-C',
  add column if not exists mpn                 text,
  add column if not exists google_category     text,                                      -- np. 491 albo pełna ścieżka kategorii Google
  add column if not exists condition           text not null default 'new' check (condition in ('new', 'refurbished', 'used')),
  add column if not exists availability        text check (availability in ('in_stock', 'out_of_stock', 'preorder', 'backorder')), -- null = według stanu
  add column if not exists unit_value          numeric(10, 2),                            -- cena jednostkowa: ilość w opakowaniu (np. 10)
  add column if not exists unit_measure        text check (unit_measure in ('ml', 'l', 'g', 'kg', 'szt')),
  add column if not exists weight_g            integer check (weight_g >= 0),
  add column if not exists related_ids         text[] not null default '{}',
  add column if not exists sort_order          integer not null default 0,
  add column if not exists low_stock_alert     integer not null default 5,
  add column if not exists subtitle            text;                                      -- np. „2 × 5 ml”

-- Dotychczasowe produkty mają stan 0 – żeby nie zablokować sprzedaży, dostępność ustawiamy ręcznie na „dostępny”.
-- Po wpisaniu prawdziwych stanów w panelu przełącz dostępność na „według stanu magazynowego”.
update public.products set availability = 'in_stock' where availability is null and stock = 0;

-- Treści przeniesione z dotychczasowego kodu sklepu
update public.products set subtitle = '2 × 5 ml', unit_value = 10, unit_measure = 'ml',
  short_description = coalesce(short_description, 'Oryginalne krople z N-acetylokarnozyną. Miesięczna kuracja.'),
  highlights = case when highlights = '{}' then array['Zatwierdzone przez Innovative Vision Products (IVP)', 'Można stosować przy soczewkach kontaktowych', 'Jedno opakowanie to około miesiąca kuracji'] else highlights end,
  google_category = coalesce(google_category, '491')
 where id = 'krople-can-c';
update public.products set short_description = coalesce(short_description, 'Wersja kropli przeznaczona dla psów.') where id = 'krople-can-c-k9';
update public.products set subtitle = coalesce(subtitle, '60 kapsułek'), unit_value = 60, unit_measure = 'szt', short_description = coalesce(short_description, 'Uzupełnienie kuracji kroplami Can-C.') where id = 'kapsulki-can-c-60';
update public.products set subtitle = coalesce(subtitle, '90 kapsułek'), unit_value = 90, unit_measure = 'szt', short_description = coalesce(short_description, 'Większe opakowanie na dłuższą kurację.') where id = 'kapsulki-can-c-90';

-- ---------- Historia cen ----------
create table if not exists public.price_history (
  id          bigint generated always as identity primary key,
  product_id  text not null references public.products (id) on delete cascade,
  price       integer,            -- cena regularna
  sale_price  integer,            -- cena promocyjna, jeśli była
  changed_at  timestamptz not null default now()
);
create index if not exists price_history_product_idx on public.price_history (product_id, changed_at desc);

create or replace function public.log_price_change()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT'
     or new.price is distinct from old.price
     or new.sale_price is distinct from old.sale_price
     or new.sale_start is distinct from old.sale_start
     or new.sale_end is distinct from old.sale_end then
    insert into public.price_history (product_id, price, sale_price) values (new.id, new.price, new.sale_price);
  end if;
  return new;
end $$;
drop trigger if exists products_price_log on public.products;
create trigger products_price_log after insert or update on public.products
  for each row execute function public.log_price_change();

-- Stan początkowy historii dla istniejących produktów
insert into public.price_history (product_id, price, sale_price, changed_at)
select id, price, sale_price, now() - interval '31 days' from public.products p
 where not exists (select 1 from public.price_history h where h.product_id = p.id);

-- Najniższa cena z 30 dni (Omnibus).
-- Gdy trwa promocja: najniższa cena obowiązująca w 30 dniach PRZED jej wprowadzeniem.
-- Bez promocji: najniższa cena z ostatnich 30 dni (informacyjnie).
drop function if exists public.lowest_price_30d(text, timestamptz);
drop function if exists public.lowest_price_30d(text, timestamptz);
create or replace function public.lowest_price_30d(p_product text)
returns integer language sql stable as $$
  with cur as (select sale_price from public.products where id = p_product),
  last_other as (
    select max(changed_at) as t from public.price_history h, cur
     where h.product_id = p_product and h.sale_price is distinct from cur.sale_price
  ),
  start as (
    select case when (select sale_price from cur) is null then now()
           else coalesce((select min(changed_at) from public.price_history h, cur, last_other
                           where h.product_id = p_product and h.sale_price = cur.sale_price
                             and h.changed_at > coalesce(last_other.t, '-infinity')), now())
           end as t
  ),
  h as (
    select price, sale_price, changed_at,
           lead(changed_at) over (order by changed_at) as until
      from public.price_history where product_id = p_product
  )
  select min(coalesce(least(h.price, h.sale_price), h.price))
    from h, start
   where h.changed_at < start.t
     and coalesce(h.until, 'infinity') > start.t - interval '30 days';
$$;

-- ---------- Opinie ----------
create table if not exists public.reviews (
  id                 uuid primary key default gen_random_uuid(),
  product_id         text not null references public.products (id) on delete cascade,
  customer_id        uuid references public.customers (id) on delete set null,
  author_name        text not null check (length(author_name) between 2 and 60),
  email              text,
  rating             integer not null check (rating between 1 and 5),
  title              text,
  body               text not null check (length(body) between 10 and 3000),
  status             text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  verified_purchase  boolean not null default false,
  reply              text,                       -- odpowiedź sklepu
  source             text not null default 'shop',
  created_at         timestamptz not null default now(),
  moderated_at       timestamptz,
  moderated_by       text
);
create index if not exists reviews_product_idx on public.reviews (product_id, status, created_at desc);
alter table public.reviews enable row level security;
alter table public.price_history enable row level security;

-- Zatwierdzone opinie są publiczne (bez e-maila – czytamy je przez serwer i tak, ale na wszelki wypadek)
drop policy if exists "opinie zatwierdzone" on public.reviews;
create policy "opinie zatwierdzone" on public.reviews for select to anon, authenticated using (status = 'approved');
revoke select (email, customer_id) on public.reviews from anon, authenticated;

-- ---------- Zdjęcia: publiczny magazyn plików ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;
