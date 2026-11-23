-- „Produkt oryginalny” jako dymek (zamiast dużej sekcji): etykieta, tytuł i ikona przy wyróżniku.
-- Zachowuje zdjęcie, punkty, link i listę produktów ustawione w panelu.
update public.page_content
   set data = (data - 'h2') || jsonb_build_object(
     'badge', 'Produkt oryginalny',
     'title', 'Produkt oryginalny',
     'highlight_match', coalesce(data->>'highlight_match', 'Innovative Vision Products')
   ),
       updated_at = now(), updated_by = 'dymek „Produkt oryginalny”'
 where key = 'product.original';
