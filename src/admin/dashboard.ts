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

    // Kafel: tytuł, liczba, podpis, lista (opcjonalnie), akcja po kliknięciu
    type Tile = { key: string; title: string; n: number; sub: string; tone: 'ok' | 'warn' | 'bad'; list?: string; act: () => void };
    const tiles: Tile[] = [
      { key: 'ship', title: 'Do wysłania', n: d.toShip.count, tone: d.toShip.oldestDays >= 2 ? 'bad' : d.toShip.count ? 'warn' : 'ok',
        sub: d.toShip.count ? `najstarsze czeka ${dni(d.toShip.oldestDays)}${d.packing ? ` · w kompletowaniu: ${d.packing}` : ''}` : d.packing ? `w kompletowaniu: ${d.packing}` : 'wszystko wysłane',
        list: d.toShip.list.map((o: any) => `<li><button type="button" class="link" data-dash-order="${o.id}">nr ${o.number}</button> <span class="muted">${esc(o.email)} · ${pln(o.total)} · ${dni(o.days)}</span></li>`).join(''),
        act: () => ordersStatus('paid') },
      { key: 'bank', title: 'Przelewy do zaksięgowania', n: d.bank.count, tone: d.bank.list.some((o: any) => o.days >= 3) ? 'bad' : d.bank.count ? 'warn' : 'ok',
        sub: d.bank.count ? 'sprawdź wpływy na koncie i oznacz jako opłacone' : 'brak oczekujących',
        list: d.bank.list.map((o: any) => `<li><button type="button" class="link" data-dash-order="${o.id}">nr ${o.number}</button> <span class="muted">${pln(o.total)} · ${dni(o.days)}</span></li>`).join(''),
        act: () => ordersStatus('pending_payment') },
      { key: 'mail', title: 'Nieprzeczytana poczta', n: d.mail.count, tone: d.mail.list.some((t: any) => t.days >= 1) ? 'bad' : d.mail.count ? 'warn' : 'ok',
        sub: d.mail.count ? 'wiadomości od klientów' : 'skrzynka przeczytana',
        list: d.mail.list.map((t: any) => `<li><button type="button" class="link" data-dash-thread="${t.id}">${esc(t.subject)}</button> <span class="muted">${esc(t.who)} · ${dni(t.days)}</span></li>`).join(''),
        act: () => go('mail') },
      { key: 'reviews', title: 'Opinie do moderacji', n: d.reviews.count, tone: d.reviews.count ? 'warn' : 'ok',
        sub: d.reviews.count ? `najstarsza czeka ${dni(d.reviews.oldestDays)}` : 'wszystkie przejrzane', act: () => go('reviews') },
      { key: 'stock', title: 'Kończące się stany', n: d.lowStock.length, tone: d.lowStock.some((p: any) => p.stock <= 0) ? 'bad' : d.lowStock.length ? 'warn' : 'ok',
        sub: d.lowStock.length ? 'stan na poziomie alertu lub niżej' : 'stany w porządku',
        list: d.lowStock.slice(0, 5).map((p: any) => `<li>${esc(p.name)} <span class="muted">· ${p.stock} szt. (alert przy ${p.alert})</span></li>`).join(''),
        act: () => go('products') },
      { key: 'errors', title: 'Błędy systemu', n: d.errors.count, tone: d.errors.critical ? 'bad' : d.errors.count ? 'warn' : 'ok',
        sub: d.errors.count ? `${d.errors.critical} krytycznych` : 'brak nowych błędów', act: () => go('settings') },
    ];
    if (d.onHold) tiles.splice(2, 0, { key: 'hold', title: 'Wstrzymane zamówienia', n: d.onHold, tone: 'warn', sub: 'wymagają decyzji', act: () => ordersStatus('on_hold') });
    for (const c of d.sending) tiles.push({ key: `nl-${c.id}`, title: 'Przerwana wysyłka newslettera', n: c.recipients - c.sent, tone: 'bad', sub: `${esc(c.name)} · wysłano ${c.sent} z ${c.recipients} - otwórz kampanię i kliknij „Wznów wysyłkę”`, act: () => go('automations') });

    // Najpierw to, co wymaga reakcji
    const order = { bad: 0, warn: 1, ok: 2 } as const;
    tiles.sort((a, b) => order[a.tone] - order[b.tone]);
    box.innerHTML = tiles.map((t, i) => `<article class="dash__tile dash__tile--${t.tone}">
        <button type="button" class="dash__main" data-dash-go="${i}">
          <span class="dash__t">${t.title}</span>
          <span class="dash__n">${t.n}</span>
          <span class="dash__sub">${t.sub}</span>
        </button>
        ${t.list ? `<ul class="dash__list">${t.list}</ul>` : ''}
      </article>`).join('');
    box.querySelectorAll<HTMLButtonElement>('[data-dash-go]').forEach((b) => b.addEventListener('click', () => tiles[Number(b.dataset.dashGo)].act()));
    box.querySelectorAll<HTMLButtonElement>('[data-dash-order]').forEach((b) => b.addEventListener('click', () => openOrder(b.dataset.dashOrder!)));
    box.querySelectorAll<HTMLButtonElement>('[data-dash-thread]').forEach((b) => b.addEventListener('click', () => go('mail', () => openThread(b.dataset.dashThread!))));
  } catch (e) {
    box.innerHTML = `<p class="err">${esc((e as Error).message)}</p>`;
  }
}

document.querySelector('[data-tab="dashboard"]')?.addEventListener('click', () => loadDashboard());
