// Panel admina - moduł „ui” (wydzielony z admin/index.astro).
import { $, state } from './core';
import { dHistory, loadOrders, openDrawer, openOrder, selected, setDCurrent } from './orders';
import { loadProducts } from './products';
import { loadReviews } from './reviews';
import { loadMail } from './mail';
import { autoTab } from './automations-reviews';
import { loadNewsletter } from './newsletter';
import { loadPromos } from './promotions';
import { loadCodes } from './codes';
import { loadCustomers } from './customers';
import { loadAutomations } from './automations';
import { loadSettings } from './settings';
import { loadSeo } from './seo';
import { loadDashboard } from './dashboard';

// ---------- Zdarzenia interfejsu ----------
export const TITLES: Record<string, string> = { dashboard: 'Pulpit', mail: 'Korespondencja', reviews: 'Opinie', automations: 'Automaty', orders: 'Zamówienia', customers: 'Klienci', products: 'Produkty', codes: 'Kody rabatowe', settings: 'Ustawienia sklepu', pages: 'Strony', analytics: 'Analityka', seo: 'SEO' };
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-tab]').forEach((x) => x.removeAttribute('aria-current'));
  b.setAttribute('aria-current', 'page');
  document.querySelectorAll<HTMLElement>('[data-view]').forEach((v) => (v.hidden = v.dataset.view !== b.dataset.tab));
  $('[data-title]').textContent = TITLES[b.dataset.tab!]; $('[data-crumb]').textContent = TITLES[b.dataset.tab!];
  if (b.dataset.tab === 'mail') loadMail();
  else if (location.hash.startsWith('#korespondencja')) history.replaceState(null, '', location.pathname);
  if (b.dataset.tab === 'orders') loadOrders();
  if (b.dataset.tab === 'products') loadProducts();
  if (b.dataset.tab === 'codes') { loadPromos(); loadCodes(); }
  if (b.dataset.tab === 'customers') loadCustomers();
  if (b.dataset.tab === 'automations') { loadAutomations(); if (autoTab === 'newsletter') loadNewsletter(); }
  if (b.dataset.tab === 'reviews') loadReviews();
  if (b.dataset.tab === 'settings') loadSettings();
  if (b.dataset.tab === 'seo') loadSeo();
}));
document.querySelectorAll<HTMLButtonElement>('[data-status]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-status]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
  b.setAttribute('aria-pressed', 'true');
  state.status = b.dataset.status || ''; state.page = 1; selected.clear(); loadOrders();
}));
$('[data-search]').addEventListener('submit', (e) => {
  e.preventDefault();
  state.q = $<HTMLInputElement>('#q').value.trim(); state.page = 1;
  if (state.q) { state.status = ''; document.querySelectorAll('[data-status]').forEach((x) => x.setAttribute('aria-pressed', String((x as HTMLElement).dataset.status === ''))); }
  loadOrders();
});
$('[data-prev]').addEventListener('click', () => { state.page--; loadOrders(); });
$('[data-next]').addEventListener('click', () => { state.page++; loadOrders(); });
export const rowOpen = (e: Event) => {
  const t = e.target as HTMLElement;
  if (t.closest('[data-stop]')) return;
  const tr = t.closest('tr[data-id]') as HTMLElement | null;
  if (tr) openOrder(tr.dataset.id!);
};
$('[data-rows]').addEventListener('click', rowOpen);
$('[data-rows]').addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') rowOpen(e); });
$('[data-close]').addEventListener('click', () => openDrawer(false));
$('[data-back]').addEventListener('click', () => { const prev = dHistory.pop(); if (prev) { setDCurrent(null); prev(); $('[data-back]').hidden = dHistory.length === 0; } });
$('[data-scrim]').addEventListener('click', () => openDrawer(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openDrawer(false); });

loadOrders(); // liczniki w menu (np. „do wysłania”)
loadDashboard(); // pulpit „Do zrobienia” - pierwszy ekran panelu
