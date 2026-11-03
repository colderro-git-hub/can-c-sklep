-- =====================================================================
-- Can-C: notatki o klientach, dane do segmentów i sortowania w panelu
-- Uruchom raz w Supabase: SQL Editor → New query → wklej → Run.
-- =====================================================================
alter table public.customers add column if not exists admin_note text;

drop view if exists public.customer_stats;
create view public.customer_stats
with (security_invoker = true)
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
  coalesce(round(avg(o.total) filter (where o.status in ('paid', 'shipped', 'completed'))), 0)::bigint as avg_order,
  max(o.created_at) filter (where o.status in ('paid', 'shipped', 'completed')) as last_order_at,
  greatest(c.updated_at, max(o.created_at)) as last_active_at,
  c.admin_note,
  last_paid.packs as last_order_packs,
  -- przewidywany koniec kuracji: ok. 3 dni dostawy + 30 dni na opakowanie kropli
  case when last_paid.packs > 0
       then last_paid.paid_on + make_interval(days => 3 + 30 * last_paid.packs)
  end as treatment_end_at
from public.customers c
left join public.orders o on o.customer_id = c.id
left join lateral (
  select coalesce(
           case when o2.shipping_address ? 'city' then o2.shipping_address end,
           case when o2.billing ? 'city' then o2.billing end
         ) as addr
    from public.orders o2
   where o2.customer_id = c.id and (o2.shipping_address ? 'city' or o2.billing ? 'city')
   order by o2.created_at desc
   limit 1
) last_addr on true
left join lateral (
  select coalesce(o3.paid_at, o3.created_at) as paid_on,
         (select coalesce(sum(i.qty), 0) from public.order_items i where i.order_id = o3.id and i.product_id = 'krople-can-c')::int as packs
    from public.orders o3
   where o3.customer_id = c.id and o3.status in ('paid', 'shipped', 'completed')
   order by o3.created_at desc
   limit 1
) last_paid on true
group by c.id, last_addr.addr, last_paid.paid_on, last_paid.packs;

revoke all on public.customer_stats from anon, authenticated;
