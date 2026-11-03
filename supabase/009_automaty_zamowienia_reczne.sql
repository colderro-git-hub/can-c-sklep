-- =====================================================================
-- Can-C: automat przypomnień o końcu kuracji, zamówienia dodawane ręcznie
-- Uruchom raz w Supabase: SQL Editor → New query → wklej → Run.
-- PRZED uruchomieniem podmień w dolnej części: ADRES_SKLEPU i TWOJ_CRON_SECRET.
-- =====================================================================

-- Wysłane przypomnienia (jedno na klienta i jego ostatnie zamówienie)
create table if not exists public.reminders (
  id           bigint generated always as identity primary key,
  customer_id  uuid not null references public.customers (id) on delete cascade,
  order_id     uuid not null references public.orders (id) on delete cascade,
  kind         text not null default 'treatment',
  code         text,
  sent_at      timestamptz not null default now(),
  unique (customer_id, order_id, kind)
);
alter table public.reminders enable row level security;

-- Zamówienia z panelu (np. z linkiem do płatności) anulujemy dopiero po 7 dniach, pozostałe po 24 h
select cron.schedule(
  'anuluj-nieoplacone',
  '15 * * * *',
  $job$
    with c as (
      update public.orders
         set status = 'cancelled'
       where status = 'pending_payment'
         and created_at < now() - case when source = 'admin' then interval '7 days' else interval '24 hours' end
      returning id
    )
    insert into public.order_events (order_id, type, data)
    select id, 'auto_cancelled', '{"reason":"brak płatności"}'::jsonb from c;
  $job$
);

-- Codzienne wywołanie automatu przypomnień (8:00 czasu polskiego ≈ 7:00 UTC zimą)
create extension if not exists pg_net;

select cron.schedule(
  'przypomnienia-kuracja',
  '0 7 * * *',
  $job$
    select net.http_post(
      url := 'https://ADRES_SKLEPU/api/cron/przypomnienia',
      headers := jsonb_build_object('Authorization', 'Bearer TWOJ_CRON_SECRET', 'Content-Type', 'application/json'),
      body := '{}'::jsonb
    );
  $job$
);
