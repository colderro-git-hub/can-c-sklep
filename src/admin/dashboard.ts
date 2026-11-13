// Panel admina - moduł „dashboard”: pulpit „Do zrobienia” (pierwszy ekran panelu)
import { $, api, esc, pln } from './core';
import { openOrder } from './orders';
import { openThread } from './mail';

// Przejście do zakładki (opcjonalnie z filtrem statusu zamówień albo folderem poczty)
const go = (tab: string, then?: () => void) => {
  document.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)?.click();
  if (then) setTimeout(then, 0);
};
const ordersStatus = (status: string) => go('orders', () => document.querySelector<HTMLButtonElement>(`[data-status="${status}"]`)?.click());
const dni = (n: number) => (n <= 0 ? 'dziś' : n === 1 ? '1 dzień' : `${n} dni`);

export async function loadDashboard() {
  const box = $('[data-dash]');
  try {
    const d = await api('/api/admin/pulpit');
    const todo = d.toShip.count + d.bank.count + d.mail.count + d.reviews.count + d.lowStock.length + d.errors.critical;
    $('[data-count-todo]').textContent = todo ? String(todo) : '';
    $('[data-dash-today]').textContent = `Dziś: ${d.today.orders} ${d.today.orders === 1 ? 'opłacone zamówienie' : 'opłaconych zamówień'} · ${pln(d.today.revenue)}`;

    // Ikony w stylu panelu (obrys 1.5 px, jak Iconly Light w Metrix)
    const I: Record<string, string> = {
      ship: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5v-9Z"/><path d="m3 7.5 9 4.5 9-4.5M12 12v9"/>',
      bank: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
      mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>',
      reviews: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z"/>',
      stock: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
      errors: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
      hold: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
      nl: '<path d="M4 5h16v14H4z"/><path d="m4 7 8 6 8-6"/>',
    };
    const icon = (k: string) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k] || I.ship}</svg>`;
    const PILL: Record<string, [string, string]> = { bad: ['Pilne', 'st--cancelled'], warn: ['Do zrobienia', 'st--on_hold'], ok: ['W porządku', 'st--shipped'] };

    // Karty podsumowania (jak Dashboard Summary Card w Metrix): ikona, status, etykieta, liczba, podpis
    type Card = { key: string; label: string; n: number; sub: string; tone: 'ok' | 'warn' | 'bad'; act: () => void };
    const cards: Card[] = [
      { key: 'ship', label: 'Do wysłania', n: d.toShip.count, tone: d.toShip.oldestDays >= 2 ? 'bad' : d.toShip.count ? 'warn' : 'ok',
        sub: d.toShip.count ? `najstarsze czeka ${dni(d.toShip.oldestDays)}` : 'wszystko wysłane', act: () => ordersStatus('paid') },
      { key: 'bank', label: 'Przelewy do zaksięgowania', n: d.bank.count, tone: d.bank.list.some((o: any) => o.days >= 3) ? 'bad' : d.bank.count ? 'warn' : 'ok',
        sub: d.bank.count ? 'sprawdź wpływy na koncie' : 'brak oczekujących', act: () => ordersStatus('pending_payment') },
      { key: 'mail', label: 'Nieprzeczytana poczta', n: d.mail.count, tone: d.mail.list.some((t: any) => t.days >= 1) ? 'bad' : d.mail.count ? 'warn' : 'ok',
        sub: d.mail.count ? 'wiadomości od klientów' : 'wszystko przeczytane', act: () => go('mail') },
      { key: 'reviews', label: 'Opinie do moderacji', n: d.reviews.count, tone: d.reviews.count ? 'warn' : 'ok',
        sub: d.reviews.count ? `najstarsza czeka ${dni(d.reviews.oldestDays)}` : 'wszystkie przejrzane', act: () => go('reviews') },
      { key: 'stock', label: 'Kończące się stany', n: d.lowStock.length, tone: d.lowStock.some((p: any) => p.stock <= 0) ? 'bad' : d.lowStock.length ? 'warn' : 'ok',
        sub: d.lowStock.length ? 'na poziomie alertu lub niżej' : 'stany w porządku', act: () => go('products') },
      { key: 'errors', label: 'Błędy systemu', n: d.errors.count, tone: d.errors.critical ? 'bad' : d.errors.count ? 'warn' : 'ok',
        sub: d.errors.count ? `w tym krytyczne: ${d.errors.critical}` : 'brak nowych błędów', act: () => go('settings') },
    ];
    if (d.onHold) cards.push({ key: 'hold', label: 'Wstrzymane zamówienia', n: d.onHold, tone: 'warn', sub: 'wymagają decyzji', act: () => ordersStatus('on_hold') });
    for (const c of d.sending) cards.push({ key: 'nl', label: 'Przerwana wysyłka newslettera', n: c.recipients - c.sent, tone: 'bad', sub: `${esc(c.name)}: kliknij i wznów wysyłkę`, act: () => go('automations') });

    const rank = { bad: 0, warn: 1, ok: 2 } as const;
    cards.sort((a, b) => rank[a.tone] - rank[b.tone]);

    // Listy: najstarsze sprawy (jak „Recent Orders” w Metrix - wiersze z cienką linią)
    const row = (main: string, meta: string, right: string) => `<li class="dl__row"><span class="dl__main">${main}<span class="dl__meta">${meta}</span></span>${right}</li>`;
    const age = (n: number, bad: number) => `<span class="st ${n >= bad ? 'st--cancelled' : n >= 1 ? 'st--on_hold' : 'st--pending_payment'}">${dni(n)}</span>`;
    const lists = [
      d.toShip.list.length && { title: 'Najstarsze do wysłania', more: () => ordersStatus('paid'), rows: d.toShip.list.map((o: any) => row(`<button type="button" class="link" data-dash-order="${o.id}">Zamówienie ${o.number}</button>`, `${esc(o.email)} · ${pln(o.total)}`, age(o.days, 2))).join('') },
      d.bank.list.length && { title: 'Czekają na przelew', more: () => ordersStatus('pending_payment'), rows: d.bank.list.map((o: any) => row(`<button type="button" class="link" data-dash-order="${o.id}">Zamówienie ${o.number}</button>`, `${esc(o.email)} · ${pln(o.total)}`, age(o.days, 3))).join('') },
      d.mail.list.length && { title: 'Nieprzeczytane wiadomości', more: () => go('mail'), rows: d.mail.list.map((t: any) => row(`<button type="button" class="link" data-dash-thread="${t.id}">${esc(t.subject)}</button>`, esc(t.who), age(t.days, 1))).join('') },
      d.lowStock.length && { title: 'Kończące się stany', more: () => go('products'), rows: d.lowStock.slice(0, 5).map((p: any) => row(esc(p.name), `alert przy ${p.alert} szt.`, `<span class="st ${p.stock <= 0 ? 'st--cancelled' : 'st--on_hold'}">${p.stock} szt.</span>`)).join('') },
    ].filter(Boolean) as { title: string; more: () => void; rows: string }[];

    box.innerHTML = `<div class="ds-cards">${cards.map((c, i) => `<button type="button" class="ds-card ds-card--${c.tone}" data-dash-go="${i}">
        <span class="ds-card__top"><span class="ds-card__ico">${icon(c.key)}</span><span class="st ${PILL[c.tone][1]}">${PILL[c.tone][0]}</span></span>
        <span class="ds-card__label">${c.label}</span>
        <span class="ds-card__val">${c.n}</span>
        <span class="ds-card__sub">${c.sub}</span>
      </button>`).join('')}</div>
      ${lists.length ? `<div class="ds-lists">${lists.map((l, i) => `<section class="card ds-list"><div class="card__head"><h2 class="card__title">${l.title}</h2><button type="button" class="link" data-dash-more="${i}">Pokaż wszystkie</button></div><ul class="dl">${l.rows}</ul></section>`).join('')}</div>` : ''}`;
    box.querySelectorAll<HTMLButtonElement>('[data-dash-go]').forEach((b) => b.addEventListener('click', () => cards[Number(b.dataset.dashGo)].act()));
    box.querySelectorAll<HTMLButtonElement>('[data-dash-more]').forEach((b) => b.addEventListener('click', () => lists[Number(b.dataset.dashMore)].more()));
    box.querySelectorAll<HTMLButtonElement>('[data-dash-order]').forEach((b) => b.addEventListener('click', () => openOrder(b.dataset.dashOrder!)));
    box.querySelectorAll<HTMLButtonElement>('[data-dash-thread]').forEach((b) => b.addEventListener('click', () => go('mail', () => openThread(b.dataset.dashThread!))));
  } catch (e) {
    box.innerHTML = `<p class="err">${esc((e as Error).message)}</p>`;
  }
}

document.querySelector('[data-tab="dashboard"]')?.addEventListener('click', () => loadDashboard());
