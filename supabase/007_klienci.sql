-- =====================================================================
-- Can-C: widok klientów ze statystykami (panel admina → Klienci)
-- Uruchom raz w Supabase: SQL Editor → New query → wklej → Run.
-- =====================================================================
create or replace view public.customer_stats
with (security_invoker = true)   -- obowiązują reguły RLS tabel źródłowych
as
select
  c.id,
  c.email,
  c.first_name,
  c.last_name,
  nullif(trim(concat_ws(' ', c.first_name, c.last_name)), '') as full_name,
  c.phone,
  c.created_at,
  c.source,
  c.marketing_consent,
  (c.user_id is not null) as has_account,
  coalesce(c.default_address ->> 'city', last_addr.addr ->> 'city') as city,
  coalesce(c.default_address ->> 'postcode', last_addr.addr ->> 'postcode') as postcode,
  coalesce(c.default_address ->> 'country', last_addr.addr ->> 'country', 'PL') as country,
  count(o.id) filter (where o.status in ('paid', 'shipped', 'completed')) as orders_count,
  coalesce(sum(o.total) filter (where o.status in ('paid', 'shipped', 'completed')), 0)::bigint as total_spent,
  max(o.created_at) as last_order_at,
  greatest(c.updated_at, max(o.created_at)) as last_active_at
from public.customers c
left join public.orders o on o.customer_id = c.id
left join lateral (
  select coalesce(
           case when o2.shipping_address ? 'city' then o2.shipping_address end,
           case when o2.billing ? 'city' then o2.billing end
         ) as addr
    from public.orders o2
   where o2.customer_id = c.id
     and (o2.shipping_address ? 'city' or o2.billing ? 'city')
   order by o2.created_at desc
   limit 1
) last_addr on true
group by c.id, last_addr.addr;

-- Widok tylko dla serwera (klucz secret); klienci i goście nie mają do niego dostępu
revoke all on public.customer_stats from anon, authenticated;

create index if not exists orders_discount_code_idx on public.orders (discount_code) where discount_code is not null;
