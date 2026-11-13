// Panel admina - moduł „core” (wydzielony z admin/index.astro).
import { applyPromotions, normalizePromotion, describeDiscount, type Promotion } from '../lib/promotions';
export type Order = any;
export const pln = (g: number | null) => (g === null || g === undefined ? '-' : new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(g / 100));
export const date = (s: string) => new Date(s).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const STATUS: Record<string, string> = { pending_payment: 'Czeka na płatność', paid: 'Do wysłania', packing: 'Kompletowanie', on_hold: 'Wstrzymane', shipped: 'Wysłane', completed: 'Zrealizowane', cancelled: 'Anulowane', refunded: 'Zwrócone', failed: 'Nieudane' };
export const EVENT: Record<string, string> = { edited: 'Edycja danych', withdrawal: 'Odstąpienie od umowy (formularz)', p24_check: 'Ręczne sprawdzenie w P24', customer_message: 'Wiadomość od klienta', created: 'Utworzone', p24_registered: 'Przekierowanie do Przelewy24', p24_notification: 'Powiadomienie z Przelewy24', p24_verified: 'Płatność potwierdzona', status_change: 'Zmiana statusu', mail_confirmation: 'Mail z potwierdzeniem', mail_shipped: 'Mail o wysyłce', mail_failed: 'Mail NIE wysłany', note: 'Notatka', amount_mismatch: 'Niezgodna kwota!', auto_cancelled: 'Anulowane automatycznie', auto_completed: 'Zrealizowane automatycznie', p24_verify_failed: 'Błąd weryfikacji P24', furgonetka_tracking: 'Numer przesyłki z Furgonetki', mail_refunded: 'Mail o zwrocie', mail_packing: 'Mail o kompletowaniu', ga4_purchase: 'Zakup wysłany do GA4', ga4_refund: 'Zwrot wysłany do GA4', stock_restored: 'Przywrócono stany magazynowe' };
export const BANK_ACCOUNT = '39 2490 0005 0000 4600 5185 0492';
export const BANK_PROVIDER = 'bank_transfer';
export const BAD = new Set(['mail_failed', 'amount_mismatch', 'p24_verify_failed', 'withdrawal']);
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
export const FURG = document.body.dataset.furgonetka || 'https://furgonetka.pl/konto';

export const track = (carrier: string, nr: string) => {
  const c = (carrier || '').toLowerCase(), n = encodeURIComponent(nr);
  if (c.includes('dpd')) return `https://tracktrace.dpd.com.pl/parcelDetails?typ=1&p1=${n}`;
  if (c.includes('inpost')) return `https://inpost.pl/sledzenie-przesylek?number=${n}`;
  if (c.includes('dhl')) return `https://www.dhl.com/pl-pl/home/sledzenie-przesylek.html?tracking-id=${n}`;
  if (c.includes('poczta')) return `https://emonitoring.poczta-polska.pl/?numer=${n}`;
  if (c.includes('orlen')) return `https://www.orlenpaczka.pl/sledz-paczke/?numer=${n}`;
  return 'https://furgonetka.pl/zlokalizuj';
};
export const trackLink = (carrier: string, nr: string) => `<a href="${track(carrier, nr)}" target="_blank" rel="noopener" data-stop>${esc(nr)}</a>`;
export const delivery = (o: Order) => o.shipping_method === 'dpd' ? 'Kurier DPD' : o.shipping_point ? `Paczkomat ${esc(o.shipping_point)}` : esc(o.shipping_method || '-');

export const state = { status: 'paid', q: '', page: 1, pages: 1 };

export async function api(path: string, body?: unknown) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Brak dostępu. Odśwież stronę i zaloguj się ponownie.');
  if (!res.ok) throw new Error(data.error || 'Błąd serwera.');
  return data;
}
export let toastTimer = 0;
export function toast(msg: string, bad = false) {
  const t = $('[data-toast]');
  t.textContent = msg; t.classList.toggle('toast--bad', bad); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => (t.hidden = true), 4000);
}
