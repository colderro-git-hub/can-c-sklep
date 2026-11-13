-- =====================================================================
-- Can-C: stany magazynowe i automatyczne anulowanie nieopłaconych zamówień
-- Uruchom raz w Supabase: SQL Editor → New query → wklej → Run.
-- =====================================================================

-- Zmniejszenie stanów po opłaceniu zamówienia (wywołuje Worker po potwierdzeniu P24).
-- Stan nie spada poniżej zera, a brak towaru nie blokuje sprzedaży - to tylko ewidencja.
create or replace function public.apply_order_stock(p_order uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.products p
     set stock = greatest(p.stock - i.qty_sum, 0)
    from (
      select product_id, sum(qty)::int as qty_sum
        from public.order_items
       where order_id = p_order and product_id is not null
       group by product_id
    ) i
   where p.id = i.product_id;
$$;

revoke execute on function public.apply_order_stock(uuid) from public, anon, authenticated;
grant execute on function public.apply_order_stock(uuid) to service_role;

-- Automatyczne anulowanie zamówień nieopłaconych przez 24 godziny (co godzinę).
create extension if not exists pg_cron;

select cron.schedule(
  'anuluj-nieoplacone',
  '15 * * * *',
  $job$
    with c as (
      update public.orders
         set status = 'cancelled'
       where status = 'pending_payment'
         and created_at < now() - interval '24 hours'
      returning id
    )
    insert into public.order_events (order_id, type, data)
    select id, 'auto_cancelled', '{"reason":"brak płatności w 24 h"}'::jsonb from c;
  $job$
);
