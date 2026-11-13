// Polska typografia w HTML: bez „wiszących” jednoliterowych słów na końcu wiersza i bez łamania wyrazów z łącznikiem.
//  • po a, i, o, u, w, z (też wielkimi) zwykła spacja → twarda (U+00A0), więc spójnik przechodzi do nowego wiersza razem ze słowem,
//  • spacja przed półpauzą/pauzą „ - ” → twarda (myślnik nie zaczyna wiersza),
//  • wyrazy z łącznikiem (Can-C, e-mail, biało-czerwony) → <span class="nowrap">, przeglądarka nie łamie ich za łącznikiem.
// Zmieniamy wyłącznie tekst między znacznikami; atrybuty, skrypty, style, kod i pola formularzy zostają nietknięte.

const NBSP = '\u00A0';
// Elementy, których treści nie ruszamy wcale
const RAW = new Set(['script', 'style', 'textarea', 'pre', 'code', 'svg', 'math', 'noscript', 'xmp', 'iframe']);
// Elementy, w których nie wolno wstawić znacznika <span> (tylko twarde spacje)
const TEXT_ONLY = new Set(['title', 'option']);

// Bez flagi „u” i bez lookbehind - te wyrażenia działają na każdej stronie, więc liczy się szybkość (limit CPU Workera)
const ORPHAN = /(^|[\s(„"'«-])([aiouwz])[ \t\r\n]+(?=\S)/gi;
// Myślnik w zdaniu („ - ”): twarda spacja przed nim, żeby nie zaczynał wiersza
const DASH = /[ \t\r\n]+(-)(?=\s)/g;
// Zasada sklepu: w tekstach tylko zwykły łącznik „-” (półpauza i pauza zamieniane przy wyświetlaniu)
const LONG_DASH = /[\u2013\u2014]/g;
const W = 'A-Za-z0-9\\u00C0-\\u024F';
const HYPHENATED = new RegExp(`[${W}]+(?:-[${W}]+)+`, 'g');
const HAS_ORPHAN = /(?:^|\s)[aiouwz]\s/i;

export type TypoOptions = { nowrap?: string }; // znacznik otwierający dla wyrazów z łącznikiem (domyślnie klasa .nowrap)

export function typoText(text: string, opts: TypoOptions & { spans?: boolean } = {}): string {
  if (!text.trim()) return text;
  let t = text;
  // Dwa przebiegi: „a w domu” - drugi spójnik stoi tuż za twardą spacją wstawioną w pierwszym
  if (HAS_ORPHAN.test(t)) t = t.replace(ORPHAN, `$1$2${NBSP}`).replace(ORPHAN, `$1$2${NBSP}`);
  if (t.includes('\u2013') || t.includes('\u2014')) t = t.replace(LONG_DASH, '-');
  if (t.includes(' -')) t = t.replace(DASH, `${NBSP}$1`);
  if (opts.spans !== false && t.includes('-')) {
    const open = opts.nowrap ?? '<span class="nowrap">';
    const wrapped = t.replace(HYPHENATED, (w) => `${open}${w}</span>`);
    // Cały tekst w jednym <span>: w kontenerach flex (przyciski, tagi, etykiety) każdy element potomny
    // staje się osobnym elementem flex i spacje między nimi znikają („kropli Can-C” → „kropliCan-C”)
    if (wrapped !== t) t = `<span>${wrapped}</span>`;
  }
  return t;
}

// Znacznik HTML z poprawną obsługą atrybutów zawierających „>” w cudzysłowach
const TAG = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\/?([a-zA-Z][\w:-]*)(?:[^>"']|"[^"]*"|'[^']*')*>/g;

export function typoHtml(html: string, opts: TypoOptions = {}): string {
  let out = '';
  let pos = 0;
  const stack: string[] = []; // otwarte elementy TEXT_ONLY
  TAG.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG.exec(html))) {
    if (m.index > pos) out += typoText(html.slice(pos, m.index), { ...opts, spans: stack.length === 0 });
    out += m[0];
    pos = TAG.lastIndex;
    const name = (m[1] || '').toLowerCase();
    if (!name) continue;
    const closing = m[0][1] === '/';
    if (!closing && RAW.has(name) && !m[0].endsWith('/>')) {
      // Przeskok do znacznika zamykającego - zawartość skryptów i stylów przepisujemy bez zmian
      const close = new RegExp(`</${name}[\\s>]`, 'gi');
      close.lastIndex = pos;
      const end = close.exec(html);
      const stop = end ? end.index : html.length;
      out += html.slice(pos, stop);
      pos = stop;
      TAG.lastIndex = stop;
    } else if (TEXT_ONLY.has(name)) {
      if (closing) stack.pop(); else stack.push(name);
    }
  }
  if (pos < html.length) out += typoText(html.slice(pos), { ...opts, spans: stack.length === 0 });
  return out;
}

// Odpowiedź HTML strony → ta sama odpowiedź po obróbce typograficznej
export async function typoResponse(res: Response): Promise<Response> {
  const type = res.headers.get('Content-Type') || '';
  if (!res.body || !/^text\/html/i.test(type) || (res.status >= 300 && res.status < 400)) return res;
  const html = typoHtml(await res.text());
  const headers = new Headers(res.headers);
  headers.delete('Content-Length');
  return new Response(html, { status: res.status, statusText: res.statusText, headers });
}

// Tekst wstawiany w przeglądarce (koszyk, zamówienie, konto): ucieczka znaków HTML + ta sama typografia → gotowe do innerHTML
export function typoSafe(text: unknown): string {
  const esc = String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  return typoText(esc);
}
