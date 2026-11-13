-- Sekcja „Dlaczego Can-C” (mozaika): 4 punkty jako osobne pola + teksty bez obietnic leczenia.
-- Zachowuje zdjęcie, rozmiary i widoczność ustawione w panelu.
update public.page_content
   set data = (data - 'features') || jsonb_build_object(
     'h2', 'Dlaczego | krople Can-C',
     'lead', 'Can-C sprzedajemy od 2013 roku. Oto, co wyróżnia te krople.',
     'link_label', coalesce(data->>'link_label', 'Przeczytaj, jak stosować'),
     'link_href', coalesce(data->>'link_href', '/stosowanie/'),
     'p1_title', 'Formuła z N-acetylokarnozyną',
     'p1_text', 'NAC to przeciwutleniacz, który pomaga chronić tkanki oka przed stresem oksydacyjnym. Krople dodatkowo nawilżają i łagodzą uczucie suchości.',
     'p2_title', 'Prosty skład',
     'p2_text', 'N-acetylokarnozyna, gliceryna i karboksymetyloceluloza sodowa - to, co nawilża i chroni powierzchnię oka.',
     'p3_title', 'Oryginał zatwierdzony przez IVP',
     'p3_text', 'Sprzedajemy wyłącznie oryginalne krople z oficjalnej dystrybucji, z oznaczeniem Innovative Vision Products na opakowaniu.',
     'p4_title', 'Także przy soczewkach',
     'p4_text', 'Krople można stosować przy soczewkach kontaktowych. Sprawdzają się też przy pracy przy komputerze i w klimatyzowanych pomieszczeniach.'
   ),
       updated_at = now(), updated_by = 'mozaika „Dlaczego Can-C”'
 where key = 'home.why';
