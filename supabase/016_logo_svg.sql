-- 016: logo sklepu (nagłówek i stopka) – dopuszczenie SVG w buckecie zdjęć „products”.
-- Adresy logo trzymamy w settings.site (logoHeader, logoFooter) – bez zmian w tabelach.
-- Pliki SVG są sprawdzane w /api/admin/upload (bez skryptów i zdarzeń JavaScript) i trafiają do folderu logo/.
update storage.buckets
set allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'image/svg+xml']
where id = 'products';
