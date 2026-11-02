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
export const FURGONETKA_MAP_KEY = '6732987098093482766743909';
