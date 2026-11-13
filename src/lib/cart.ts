// Koszyk po stronie przeglądarki (localStorage).
// Trzymamy tylko slug i liczbę sztuk. Ceny przy zamówieniu zawsze przelicza serwer,
// więc zmiana danych w przeglądarce nie wpłynie na kwotę do zapłaty.

export type CartItem = { slug: string; qty: number };

const KEY = 'canc-cart-v1';
const EVENT = 'cart:change';
const MAX_QTY = 20;

function read(): CartItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data)
      ? data.filter((i) => typeof i?.slug === 'string' && Number.isInteger(i?.qty) && i.qty > 0)
      : [];
  } catch {
    return [];
  }
}

function write(items: CartItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* tryb prywatny lub pełna pamięć - koszyk działa do odświeżenia strony */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: items }));
}

export const getCart = read;

export function addItem(slug: string, qty: number) {
  const items = read();
  const found = items.find((i) => i.slug === slug);
  if (found) found.qty = Math.min(found.qty + qty, MAX_QTY);
  else items.push({ slug, qty: Math.min(qty, MAX_QTY) });
  write(items);
}

// Ustawia liczbę sztuk; produkt, którego nie ma w koszyku, zostaje dodany (np. brakujący element zestawu)
export function setQty(slug: string, qty: number) {
  const n = Math.min(Math.max(Math.round(qty) || 0, 0), MAX_QTY);
  const items = read();
  if (n > 0 && !items.some((i) => i.slug === slug)) items.push({ slug, qty: n });
  write(items.map((i) => (i.slug === slug ? { ...i, qty: n } : i)).filter((i) => i.qty > 0));
}

// Link „Zamów ponownie” z maila: /koszyk/?dodaj=slug:2,slug:1&kod=KOD → koszyk z tymi produktami, kod czeka na formularz zamówienia
export const REORDER_CODE_KEY = 'canc-reorder-code';
export function cartFromLink(): { added: boolean; code: string | null } {
  const qp = new URLSearchParams(location.search);
  const raw = qp.get('dodaj');
  const code = (qp.get('kod') || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 30) || null;
  if (!raw && !code) return { added: false, code: null };
  const items: CartItem[] = [];
  for (const part of (raw || '').split(',').slice(0, 10)) {
    const [slug, q] = part.split(':');
    const qty = Math.min(Math.max(Math.round(Number(q) || 1), 1), MAX_QTY);
    if (/^[a-z0-9-]{2,60}$/.test(slug || '') && !items.some((i) => i.slug === slug)) items.push({ slug, qty });
  }
  if (items.length) write(items); // zastępuje koszyk - klient klika „zamów ponownie”, chce dokładnie ten zestaw
  if (code) { try { sessionStorage.setItem(REORDER_CODE_KEY, code); } catch { /* bez kodu */ } }
  // Usuwamy parametry z adresu (odświeżenie nie doda produktów drugi raz)
  qp.delete('dodaj'); qp.delete('kod');
  history.replaceState(null, '', location.pathname + (qp.toString() ? `?${qp}` : '') + location.hash);
  return { added: items.length > 0, code };
}

export function clearCart() {
  write([]);
}

export const cartCount = () => read().reduce((sum, i) => sum + i.qty, 0);

export function onCartChange(cb: (items: CartItem[]) => void) {
  window.addEventListener(EVENT, (e) => cb((e as CustomEvent<CartItem[]>).detail));
  // zmiany z innej karty przeglądarki
  window.addEventListener('storage', (e) => { if (e.key === KEY) cb(read()); });
}
