// Szablony odpowiedzi w Korespondencji (panel: Korespondencja → Szablony). Zapis: settings „mail_templates”.
// Znaczniki wstawiane przy użyciu: {imie} {zamowienie} {status} {przesylka} {email} {czas_wysylki}
export type MailTemplate = { id: string; name: string; body: string };

export const DEFAULT_TEMPLATES: MailTemplate[] = [
  { id: 'wysylka', name: 'Kiedy wysyłka', body: 'Zamówienie {zamowienie} jest w realizacji (status: {status}). Wysyłamy {czas_wysylki}, a numer przesyłki prześlemy w osobnej wiadomości zaraz po nadaniu paczki.' },
  { id: 'przesylka', name: 'Numer przesyłki', body: 'Zamówienie {zamowienie} zostało nadane. Paczkę można śledzić tutaj: {przesylka}' },
  { id: 'stosowanie', name: 'Jak stosować krople', body: 'Krople zakrapiamy 2 krople do każdego oka 2 razy dziennie. Po zakropleniu warto zamknąć oko na około minutę i nie mrugać - wtedy krople zostają tam, gdzie powinny. Dokładna instrukcja ze zdjęciami: https://can-c.pl/stosowanie/\n\nPo otwarciu fiolkę należy zużyć w ciągu 30 dni.' },
  { id: 'zwrot', name: 'Zwrot / odstąpienie od umowy', body: 'Nieotwarte produkty można zwrócić w ciągu 14 dni od otrzymania paczki. Najprościej skorzystać z formularza: https://can-c.pl/odstapienie-od-umowy/ - po otrzymaniu zwrotu oddamy pieniądze w ciągu 14 dni, tą samą metodą płatności.' },
  { id: 'faktura', name: 'Faktura', body: 'Fakturę do zamówienia {zamowienie} wysyłamy w załączniku. Jeśli trzeba poprawić dane nabywcy, proszę odpisać na tę wiadomość z poprawnymi danymi i NIP.' },
  { id: 'opinia', name: 'Dziękujemy za opinię', body: 'Dziękujemy za wystawienie opinii - to dla nas bardzo ważne i pomaga innym klientom w wyborze.' },
];

const clean = (s: unknown, n: number) => String(s ?? '').replace(/\r/g, '').replace(/[\u2013\u2014]/g, '-').trim().slice(0, n);

// Walidacja listy z panelu
export function cleanTemplates(raw: unknown): MailTemplate[] | { error: string } {
  const list = Array.isArray(raw) ? raw.slice(0, 50) : [];
  const out: MailTemplate[] = [];
  for (const t of list as any[]) {
    const name = clean(t?.name, 60), body = clean(t?.body, 4000);
    if (!name && !body) continue;
    if (!name || !body) return { error: 'Każdy szablon musi mieć nazwę i treść.' };
    const id = /^[a-z0-9-]{1,40}$/.test(String(t?.id || '')) ? String(t.id) : `t${Date.now().toString(36)}${out.length}`;
    out.push({ id, name, body });
  }
  return out;
}
