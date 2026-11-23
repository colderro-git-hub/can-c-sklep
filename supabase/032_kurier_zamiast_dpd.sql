-- Dostawa: Paczkomaty i Kurier InPost (bez DPD) w treściach zapisanych w bazie: strony, FAQ, stopka, ustawienia.
update public.page_content
   set data = replace(replace(replace(replace(data::text,
         'Kurier DPD', 'Kurier'), 'kurierem DPD', 'kurierem InPost'), 'kurier DPD', 'kurier InPost'), 'InPost i DPD', 'Paczkomat i kurier')::jsonb
 where data::text ~ 'DPD';

update public.settings
   set value = replace(replace(replace(value::text, 'Kurier DPD', 'Kurier'), 'kurierem DPD', 'kurierem InPost'), 'kurier DPD', 'kurier InPost')::jsonb
 where key in ('site', 'seo') and value::text ~ 'DPD';

-- Do sprawdzenia ręcznie: inne wzmianki o DPD w treściach (np. w opisach produktów)
select 'page_content' as gdzie, key as klucz from public.page_content where data::text ~ 'DPD'
union all
select 'products', id from public.products where concat_ws(' ', short_description, description, how_to_use, lead_time) ~ 'DPD';
