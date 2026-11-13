// Panel admina (/admin) - logika podzielona na moduły według zakładek.
// Kolejność importów = kolejność z dawnego jednego skryptu; każdy moduł przy załadowaniu rejestruje
// swoje zdarzenia, a „ui” na końcu uruchamia start panelu.
//
//   core                 formatowanie, api(), toast(), $(), wspólne stałe (statusy, etykiety)
//   orders               lista zamówień, zaznaczanie zbiorcze, szczegóły zamówienia, szuflada (drawer)
//   products             produkty: lista, edytor, zdjęcia
//   reviews              opinie: moderacja, edycja
//   mail                 podpis w korespondencji, zakładka Korespondencja
//   automations-reviews  automat „Prośba o opinię”, podzakładki Automatów
//   newsletter           kampanie newslettera (kreator, wysyłka)
//   promotions           promocje automatyczne (rabaty ilościowe i zestawy)
//   codes                kody rabatowe
//   customers            klienci
//   navigation           przejścia między widokami (otwieranie kart z innych zakładek)
//   new-order            ręczne zamówienie
//   automations          przypomnienia o kuracji
//   pages                Strony (CMS)
//   analytics            Analityka (dashboard + GA4)
//   settings             Ustawienia sklepu (logo, favicon, podpis…)
//   seo                  SEO
//   redirects            przekierowania i dziennik 404
//   ui                   zdarzenia interfejsu i start panelu
import './core';
import './orders';
import './products';
import './reviews';
import './mail';
import './automations-reviews';
import './newsletter';
import './promotions';
import './codes';
import './customers';
import './navigation';
import './new-order';
import './automations';
import './pages';
import './analytics';
import './settings';
import './seo';
import './redirects';
import './ui';
