-- Dodaj pola image_url do sekcji opening i applying (każdy krok z obrazkiem)
-- Uruchom w Supabase SQL Editor.

-- opening: każdy krok dostaje image_url (tablica 4 URLi)
update public.page_content
set data = data || '{"step_images": [null, null, null, null]}'::jsonb
where key = 'how_to_use.opening'
  and not (data ? 'step_images');

-- applying: jedno zdjęcie przy sekcji zakraplania
update public.page_content
set data = data || '{"image_url": null, "image_alt": "Zakraplanie kropli Can-C"}'::jsonb
where key = 'how_to_use.applying'
  and not (data ? 'image_url');
