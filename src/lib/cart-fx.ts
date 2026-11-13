// Efekty po dodaniu do koszyka: miniatura „leci” do przycisku koszyka w nagłówku,
// a nagłówek otwiera podgląd koszyka (nasłuchuje zdarzenia ADDED_EVENT).
export const ADDED_EVENT = 'cart:added';
export type AddedDetail = { slug: string; qty: number };

export function announceAdded(detail: AddedDetail) {
  window.dispatchEvent(new CustomEvent<AddedDetail>(ADDED_EVENT, { detail }));
}

export function flyToCart(from: Element | null, imgSrc?: string | null): Promise<void> {
  // Na telefonie koszyk jest w zwiniętym menu - animacja leci do przycisku hamburgera
  const cart = document.querySelector<HTMLElement>('[data-cart-link]');
  const target = cart && cart.getClientRects().length ? cart : document.querySelector<HTMLElement>('[data-burger]') ?? cart;
  if (!from || !target || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('animate' in Element.prototype)) return Promise.resolve();
  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  if (!b.width) return Promise.resolve(); // koszyk niewidoczny
  const size = 64;
  const el = document.createElement('div');
  el.className = 'fly';
  el.setAttribute('aria-hidden', 'true');
  if (imgSrc) { const i = new Image(); i.src = imgSrc; i.alt = ''; el.append(i); }
  Object.assign(el.style, {
    position: 'fixed', zIndex: '60', pointerEvents: 'none', width: `${size}px`, height: `${size}px`,
    left: `${a.left + a.width / 2 - size / 2}px`, top: `${a.top + a.height / 2 - size / 2}px`,
  });
  document.body.append(el);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = el.animate([
    { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 90}px) scale(0.8)`, opacity: 1, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0.3 },
  ], { duration: 750, easing: 'cubic-bezier(0.45, 0, 0.35, 1)' });
  return anim.finished.then(() => el.remove(), () => el.remove());
}
