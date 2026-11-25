-- Opinie na stronie głównej (nowy układ): nagłówek w dwóch liniach, tekst pod nagłówkiem, miejsce na zdjęcie.
-- Opinie pobierają się same z bazy; dawne pola (cta_text, items) nie są już używane.
update public.page_content
   set data = (data - 'cta_text' - 'items') || jsonb_build_object(
     'h2', case when coalesce(data->>'h2', '') in ('', 'Opinie klientów') then 'Opinie | naszych klientów' else data->>'h2' end,
     'lead', coalesce(data->>'lead', 'Can-C kupują u nas od 2013 roku. Oto, co piszą po zakupie.')
   )
 where key = 'home.reviews';
