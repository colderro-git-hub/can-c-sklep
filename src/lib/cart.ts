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
    /* tryb prywatny lub pełna pamięć – koszyk działa do odświeżenia strony */
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

export function setQty(slug: string, qty: number) {
  const items = read()
    .map((i) => (i.slug === slug ? { ...i, qty: Math.min(Math.max(qty, 0), MAX_QTY) } : i))
    .filter((i) => i.qty > 0);
  write(items);
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
