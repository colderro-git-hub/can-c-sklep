-- Punkt 7: sekcja „Oryginalny produkt” na karcie produktu (edycja: /admin → Strony → Karta produktu).
-- Sprawdź punkty listy - mają odpowiadać temu, co faktycznie jest na opakowaniu.
insert into public.page_content (key, page, section, sort_order, data) values
('product.original', 'product', 'original', 10, '{
  "products": ["krople-can-c"],
  "badge": "Oryginalny produkt",
  "h2": "Kupujesz oryginalne krople Can-C",
  "lead": "Can-C sprzedajemy od 2013 roku. Każde opakowanie pochodzi bezpośrednio z oficjalnej dystrybucji i ma oznaczenie zatwierdzenia Innovative Vision Products (IVP).",
  "items": [
    "Na pudełku jest oznaczenie zatwierdzenia przez IVP",
    "Opakowanie fabrycznie zamknięte, z numerem partii i datą ważności",
    "W zestawie 2 fiolki po 5 ml",
    "Do każdego zamówienia wystawiamy paragon albo fakturę"
  ],
  "image_url": null,
  "image_alt": "Opakowanie kropli Can-C z oznaczeniem IVP",
  "link_label": "Masz wątpliwości? Napisz do nas",
  "link_href": "/kontakt/"
}'::jsonb)
on conflict (key) do nothing;
