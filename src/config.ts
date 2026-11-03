// Dane publiczne sklepu – jedno miejsce do uzupełnienia.
export const site = {
  email: '[adres e-mail sklepu]',
  phone: '[numer telefonu]',
  hours: '[pon.–pt., 9:00–16:00]',
  replyTime: '[w ciągu 24 h]',
  facebook: 'https://www.facebook.com/krople.canc',
  company: 'Colderro Ewa Zimna',
  address: '[adres siedziby], Wysoka',
  nip: '[NIP]',
  regon: '[REGON]',
  returnsUrl: 'https://furgonetka.pl/zwroty/8bed000b-1a32-4f06-a0d7-70626a8be40d',
};

// Klucz witryny Turnstile jest publiczny, więc może być w kodzie.
// Poniżej klucz testowy Cloudflare (zawsze przepuszcza). Podmień na własny z panelu Turnstile.
export const TURNSTILE_SITE_KEY = '1x00000000000000000000AA';

// Klucz mapy punktów Furgonetki (publiczny, działa tylko na domenach dodanych w panelu Furgonetki).
// Pobierz: furgonetka.pl/api/mapa/dostep → Dodaj klienta mapy. Puste = zamiast mapy pole do wpisania kodu.
export const FURGONETKA_MAP_KEY = '';

// ---------- Furgonetka: integracja własna ----------
// Adres panelu Furgonetki, w którym nadajesz przesyłki (zakładka ze sprzedażą / zamówieniami ze sklepów).
export const FURGONETKA_PANEL_URL = 'https://furgonetka.pl/konto';
// Domyślna paczka podpowiadana w Furgonetce (cm / kg) i waga jednej sztuki produktu.
export const PARCEL_DEFAULTS = { width: 20, height: 10, depth: 8, weightPerItem: 0.1 };
// Stawka VAT produktów (%) – SPRAWDŹ z księgowością, wpływa tylko na dane przekazywane Furgonetce.
export const PRODUCT_VAT_RATE = 23;
// Stałe numery produktów dla Furgonetki (wymaga liczb).
export const PRODUCT_NUMERIC_ID: Record<string, number> = {
  'krople-can-c': 1, 'krople-can-c-k9': 2, 'kapsulki-can-c-60': 3, 'kapsulki-can-c-90': 4,
};

export const SUPABASE_PUBLIC_URL = 'https://TWOJ-PROJEKT.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_4p0DWSrJeiV76iQpiNGOwQ_heZXZ1-I';