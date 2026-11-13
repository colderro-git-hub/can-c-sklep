// Panel admina - moduł „navigation” (wydzielony z admin/index.astro).
import { openProduct } from './products';
import { openPromo } from './promotions';
import { openCustomer } from './customers';

// ---------- Przejścia między widokami ----------
export function switchTab(tab: string) { (document.querySelector(`[data-tab="${tab}"]`) as HTMLButtonElement)?.click(); }
export function bindLinks(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>('[data-open-customer]').forEach((b) => b.addEventListener('click', () => openCustomer(b.dataset.openCustomer!)));
  root.querySelectorAll<HTMLButtonElement>('[data-open-product]').forEach((b) => b.addEventListener('click', () => openProduct(b.dataset.openProduct!)));
  root.querySelectorAll<HTMLButtonElement>('[data-open-promo]').forEach((b) => b.addEventListener('click', () => openPromo(b.dataset.openPromo!)));
}
