-- Krok 38: zwroty zamówień (status 'refunded' istnieje od 001_schema.sql).
-- Przywrócenie stanów magazynowych po zwrocie - odwrotność apply_order_stock(); wywoływana tylko z Workera (service_role).

create or replace function public.restore_order_stock(p_order uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.products p
     set stock = p.stock + i.qty_sum
    from (
      select product_id, sum(qty)::int as qty_sum
        from public.order_items
       where order_id = p_order and product_id is not null
       group by product_id
    ) i
   where p.id = i.product_id
     and p.stock is not null;
$$;

revoke execute on function public.restore_order_stock(uuid) from public, anon, authenticated;
grant execute on function public.restore_order_stock(uuid) to service_role;

-- Kwota zwrotu (grosze) - do statystyk; pełny zwrot = total
alter table public.orders add column if not exists refunded_amount int check (refunded_amount is null or refunded_amount >= 0);
alter table public.orders add column if not exists refunded_at timestamptz;
