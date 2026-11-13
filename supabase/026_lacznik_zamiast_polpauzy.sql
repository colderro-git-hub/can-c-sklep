-- Zasada sklepu: w tekstach tylko zwykły łącznik „-” (bez półpauzy „–” i pauzy „—”).
-- Zamienia znaki w treściach już zapisanych w bazie. Sklep i tak zamienia je przy wyświetlaniu,
-- ale dzięki temu w panelu też widać „-”. Opinie klientów zostają bez zmian (to ich słowa; na stronie i tak wyświetlą się z „-”).

update public.page_content
   set data = replace(replace(data::text, '–', '-'), '—', '-')::jsonb
 where data::text ~ '[–—]';

update public.products
   set name = replace(replace(name, '–', '-'), '—', '-'),
       subtitle = replace(replace(subtitle, '–', '-'), '—', '-'),
       short_description = replace(replace(short_description, '–', '-'), '—', '-'),
       description = replace(replace(description, '–', '-'), '—', '-'),
       how_to_use = replace(replace(how_to_use, '–', '-'), '—', '-'),
       seo_title = replace(replace(seo_title, '–', '-'), '—', '-'),
       seo_description = replace(replace(seo_description, '–', '-'), '—', '-'),
       lead_time = replace(replace(lead_time, '–', '-'), '—', '-'),
       highlights = (select coalesce(array_agg(replace(replace(h, '–', '-'), '—', '-') order by o), '{}') from unnest(highlights) with ordinality as t(h, o))
 where concat_ws(' ', name, subtitle, short_description, description, how_to_use, seo_title, seo_description, lead_time, array_to_string(highlights, ' ')) ~ '[–—]';

update public.settings
   set value = replace(replace(value::text, '–', '-'), '—', '-')::jsonb
 where key in ('site', 'seo') and value::text ~ '[–—]';

update public.promotions
   set name = replace(replace(name, '–', '-'), '—', '-'), label = replace(replace(label, '–', '-'), '—', '-')
 where concat_ws(' ', name, label) ~ '[–—]';
