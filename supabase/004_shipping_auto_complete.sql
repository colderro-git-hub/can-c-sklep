-- =====================================================================
-- Can-C: automatyczne „Zrealizowane” 14 dni po wysyłce (codziennie o 3:30)
-- Uruchom raz w Supabase: SQL Editor → New query → wklej → Run.
-- =====================================================================
select cron.schedule(
  'zrealizuj-po-wysylce',
  '30 3 * * *',
  $job$
    with c as (
      update public.orders
         set status = 'completed'
       where status = 'shipped'
         and shipped_at < now() - interval '14 days'
      returning id
    )
    insert into public.order_events (order_id, type, data)
    select id, 'auto_completed', '{"reason":"14 dni od wysyłki"}'::jsonb from c;
  $job$
);
