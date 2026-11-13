// Panel admina - moduł „orders” (wydzielony z admin/index.astro).
import { $, BAD, BANK_ACCOUNT, BANK_PROVIDER, EVENT, FURG, STATUS, api, date, delivery, esc, pln, state, toast, trackLink, type Order } from './core';
import { bindLinks } from './navigation';

// ---------- Lista zamówień ----------
export async function loadOrders() {
  const tbody = $('[data-rows]');
  tbody.innerHTML = '<tr><td colspan="8" class="empty">Ładowanie…</td></tr>';
  try {
    const p = new URLSearchParams({ status: state.status, q: state.q, page: String(state.page) });
    const d = await api(`/api/admin/orders?${p}`);
    state.pages = d.pages;
    for (const [k, v] of Object.entries(d.counts)) document.querySelectorAll(`[data-count="${k}"]`).forEach((el) => (el.textContent = v ? String(v) : ''));
    $('[data-count-paid]').textContent = d.counts.paid ? String(d.counts.paid) : '';
    const k = (key: string, v: string) => { const el = document.querySelector(`[data-k="${key}"]`); if (el) el.textContent = v; };
    k('paid', String(d.counts.paid ?? 0)); k('on_hold', String(d.counts.on_hold ?? 0)); k('shipped', String(d.counts.shipped ?? 0));
    if (d.stats) {
      k('revenueToday', pln(d.stats.revenueToday)); k('ordersToday', String(d.stats.ordersToday));
      k('revenue30', pln(d.stats.revenue30)); k('orders30', String(d.stats.orders30)); k('avg30', pln(d.stats.avg30));
    }
    $('[data-page]').textContent = `Strona ${d.page} z ${d.pages} · ${d.total} zamówień`;
    $<HTMLButtonElement>('[data-prev]').disabled = d.page <= 1;
    $<HTMLButtonElement>('[data-next]').disabled = d.page >= d.pages;
    tbody.innerHTML = d.rows.length ? d.rows.map((o: Order) => `
      <tr data-id="${o.id}" tabindex="0" class="${selected.has(o.id) ? 'is-sel' : ''}">
        <td class="cb" data-stop><input type="checkbox" data-sel="${o.id}" ${selected.has(o.id) ? 'checked' : ''} aria-label="Zaznacz zamówienie ${o.number}" /></td>
        <td class="nowrap"><strong>${o.number}</strong>${o.source === 'woocommerce' ? '<span class="wc">WC</span>' : ''}</td>
        <td class="nowrap">${date(o.created_at)}</td>
        <td><strong>${esc(o.shipping_address?.name || '-')}</strong><br>${esc(o.email)}</td>
        <td>${o.order_items.map((i: any) => `${esc(i.name)} <span class="muted">× ${i.qty}</span>`).join('<br>')}</td>
        <td>${delivery(o)}${o.tracking_number ? `<br>${trackLink(o.carrier || o.shipping_method, o.tracking_number)}` : ''}</td>
        <td class="r nowrap"><strong>${pln(o.total)}</strong></td>
        <td><span class="st st--${o.status}">${STATUS[o.status] || esc(o.status)}</span></td>
      </tr>`).join('') : '<tr><td colspan="8" class="empty">Brak zamówień w tym widoku.</td></tr>';
    syncBulk();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty err">${esc((e as Error).message)}</td></tr>`;
  }
}

// ---------- Zaznaczanie i zbiorcza zmiana statusu ----------
export const selected = new Set<string>();
export function syncBulk() {
  const boxes = [...document.querySelectorAll<HTMLInputElement>('[data-rows] [data-sel]')];
  const all = $<HTMLInputElement>('[data-sel-all]');
  all.checked = boxes.length > 0 && boxes.every((b) => b.checked);
  all.indeterminate = !all.checked && boxes.some((b) => b.checked);
  $('[data-bulk]').hidden = selected.size === 0;
  $('[data-bulk-count]').textContent = `Zaznaczone: ${selected.size}`;
  const to = $<HTMLSelectElement>('[data-bulk-to]').value;
  $('[data-bulk-notify-wrap]').hidden = to !== 'pack';
}
$('[data-rows]').addEventListener('change', (e) => {
  const cb = (e.target as HTMLElement).closest<HTMLInputElement>('[data-sel]');
  if (!cb) return;
  if (cb.checked) selected.add(cb.dataset.sel!); else selected.delete(cb.dataset.sel!);
  cb.closest('tr')?.classList.toggle('is-sel', cb.checked);
  syncBulk();
});
$<HTMLInputElement>('[data-sel-all]').addEventListener('change', (e) => {
  const on = (e.target as HTMLInputElement).checked;
  document.querySelectorAll<HTMLInputElement>('[data-rows] [data-sel]').forEach((b) => {
    b.checked = on; b.closest('tr')?.classList.toggle('is-sel', on);
    if (on) selected.add(b.dataset.sel!); else selected.delete(b.dataset.sel!);
  });
  syncBulk();
});
$('[data-bulk-to]').addEventListener('change', syncBulk);
$('[data-bulk-clear]').addEventListener('click', () => { selected.clear(); document.querySelectorAll<HTMLInputElement>('[data-rows] [data-sel]').forEach((b) => { b.checked = false; b.closest('tr')?.classList.remove('is-sel'); }); syncBulk(); });
$('[data-bulk-go]').addEventListener('click', async () => {
  const to = $<HTMLSelectElement>('[data-bulk-to]').value;
  const notify = $<HTMLInputElement>('[data-bulk-notify]').checked;
  const label = $<HTMLSelectElement>('[data-bulk-to]').selectedOptions[0].textContent!.replace('→ ', '');
  if (!confirm(`Zmienić status ${selected.size} zamówień: ${label}?${to === 'pack' && notify ? ' Klienci dostaną e-mail.' : ''}${to === 'cancel' ? ' Opłacone zamówienia wymagają zwrotu pieniędzy.' : ''}`)) return;
  const btn = $<HTMLButtonElement>('[data-bulk-go]');
  btn.disabled = true;
  try {
    const r = await api('/api/admin/order', { action: 'bulk', ids: [...selected], to, notify });
    const parts = [`Zmieniono: ${r.done}`];
    if (r.failed.length) parts.push(`pominięto ${r.failed.length} (${r.failed.slice(0, 5).map((f: any) => `nr ${f.number}: ${f.error}`).join('; ')}${r.failed.length > 5 ? '…' : ''})`);
    if (r.mailFailed.length) parts.push(`e-mail nie wysłany: nr ${r.mailFailed.join(', ')}`);
    toast(parts.join(' · '), r.failed.length > 0 || r.mailFailed.length > 0);
    selected.clear();
    loadOrders();
  } catch (e) { toast((e as Error).message, true); }
  finally { btn.disabled = false; }
});

// ---------- Szczegóły ----------
// Historia panelu szczegółów: zamówienie → klient → zamówienie… z przyciskiem „Wstecz”
export const dHistory: (() => void)[] = [];
export let dCurrent: (() => void) | null = null;
// Zmiana z innych modułów (importy są tylko do odczytu)
export function setDCurrent(v: typeof dCurrent) { dCurrent = v; }
export function openDrawer(show: boolean) {
  $('[data-drawer]').hidden = !show; $('[data-scrim]').hidden = !show;
  $('[data-drawer]').classList.remove('drawer--wide');
  if (!show) { dHistory.length = 0; dCurrent = null; $('[data-back]').hidden = true; }
}
export function drawerNav(fn: () => void, push = true) {
  if (push && dCurrent && !$('[data-drawer]').hidden) dHistory.push(dCurrent);
  dCurrent = fn;
  $('[data-back]').hidden = dHistory.length === 0;
}

export async function openOrder(id: string, push = true) {
  drawerNav(() => openOrder(id, false), push);
  const body = $('[data-d-body]');
  openDrawer(true); $('[data-drawer]').classList.add('drawer--wide');
  body.innerHTML = '<p class="muted">Ładowanie…</p>';
  try {
    const { order: o, events } = await api(`/api/admin/order?id=${id}`);
    $('[data-d-title]').textContent = `Zamówienie ${o.number}`;
    const a = o.shipping_address || {};
    const wc = o.source === 'woocommerce';
    const can = (from: string[]) => !wc && from.includes(o.status);
    const name = a.name || [o.customers?.first_name, o.customers?.last_name].filter(Boolean).join(' ');
    body.innerHTML = `
      ${o.customers?.admin_note ? `<div class="box box--amber"><strong>Notatka o kliencie:</strong> ${esc(o.customers.admin_note)}</div>` : ''}
      ${wc ? '<div class="box box--amber">Zamówienie z WooCommerce (import). Do dnia startu obsługuj je w obecnym sklepie - tu tylko podgląd i notatki.</div>' : ''}
      <div class="meta"><span class="st st--${o.status}">${STATUS[o.status] || esc(o.status)}</span><span>${date(o.created_at)}</span>${o.paid_at ? `<span>· opłacone ${date(o.paid_at)}</span>` : ''}</div>

      <div class="sec"><h3 class="sec__t">Produkty</h3>
        <ul class="items">${o.order_items.map((i: any) => `<li><span>${i.product_id ? `<button type="button" class="link" data-open-product="${esc(i.product_id)}">${esc(i.name)}</button>` : esc(i.name)} × ${i.qty}${i.discount ? ` <span class="muted">(rabat ${pln(i.discount)})</span>` : ''}</span><span>${pln(i.total)}</span></li>`).join('')}
          ${(o.promotions || []).map((pr: any) => `<li><span class="muted">w tym: ${pr.promotion_id ? `<button type="button" class="link" data-open-promo="${pr.promotion_id}">${esc(pr.name)}</button>` : esc(pr.name)}</span><span class="muted">−${pln(pr.amount)}</span></li>`).join('')}
          ${o.discount_code ? `<li><span>Kod ${esc(o.discount_code)}</span><span>−${pln(o.discount_code_amount)}</span></li>` : ''}
          <li class="sum"><span>Razem</span><span>${pln(o.total)}</span></li></ul>
      </div>

      <div class="sec"><h3 class="sec__t">Klient i dostawa</h3>
        <dl class="kv">
          <dt>Klient</dt><dd>${o.customer_id ? `<button type="button" class="link" data-open-customer="${o.customer_id}">${esc(name || o.email)}</button>` : esc(name || '-')}</dd>
          <dt>E-mail</dt><dd><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></dd>
          <dt>Telefon</dt><dd>${esc(a.phone || o.customers?.phone || '-')}</dd>
          <dt>Dostawa</dt><dd>${o.shipping_method === 'dpd' ? `Kurier DPD<br>${esc(a.street)}, ${esc(a.postcode)} ${esc(a.city)}` : `Paczkomat <strong>${esc(o.shipping_point || '-')}</strong>${a.point_name ? `<br><span class="muted">${esc(a.point_name)}</span>` : ''}`}</dd>
          ${o.tracking_number ? `<dt>Przesyłka</dt><dd>${esc(o.carrier || '')} ${trackLink(o.carrier || o.shipping_method, o.tracking_number)}</dd>` : ''}
          ${o.billing ? `<dt>Faktura</dt><dd>${esc(o.billing.company || '')}<br>NIP ${esc(o.billing.nip || '-')}<br>${esc(o.billing.street || '')}, ${esc(o.billing.postcode || '')} ${esc(o.billing.city || '')}</dd>` : ''}
        </dl>
        ${o.customer_note ? `<div class="note">${esc(o.customer_note)}</div>` : ''}
      </div>

      ${can(['paid', 'on_hold']) && !wc ? `<details class="manual" data-pack-wrap>
        <summary>Kompletowanie zamówienia</summary>
        <form class="sec" data-pack>
          <p class="muted small">Status „Kompletowanie” informuje klienta, że zamówienie jest przygotowywane do wysyłki. Furgonetka nadal widzi je jako do nadania.</p>
          <label class="field">Dodatkowa wiadomość w e-mailu (opcjonalnie)<textarea class="input" name="message" rows="2" maxlength="600" placeholder="Np. kapsułki dosyłamy w osobnej paczce."></textarea></label>
          <label class="check"><input type="checkbox" name="notify" checked /> Wyślij klientowi e-mail</label>
          <div class="actions"><button class="btn btn--sm">Oznacz: Kompletowanie</button></div>
        </form>
      </details>` : ''}

      ${can(['paid', 'packing', 'on_hold']) ? `
        <div class="box box--blue">
          <strong>Wysyłka</strong>
          <span class="muted">Zamówienie trafia do Furgonetki automatycznie. Po nadaniu numer przesyłki wróci tu sam, status zmieni się na „Wysłane”, a klient dostanie e-mail.</span>
          <div class="actions"><a class="btn btn--sm" href="${FURG}" target="_blank" rel="noopener">Nadaj w Furgonetce</a></div>
          <details class="manual"><summary>Wpisz numer przesyłki ręcznie</summary>
            <form data-ship class="sec">
              <div class="row2">
                <label class="field">Przewoźnik<select name="carrier" class="input"><option value="inpost" ${o.shipping_method !== 'dpd' ? 'selected' : ''}>InPost</option><option value="dpd" ${o.shipping_method === 'dpd' ? 'selected' : ''}>DPD</option></select></label>
                <label class="field">Numer przesyłki<input name="tracking" class="input" required /></label>
              </div>
              <label class="check"><input type="checkbox" name="notify" checked /> Wyślij klientowi e-mail z numerem</label>
              <div class="actions"><button class="btn btn--sm">Oznacz jako wysłane</button></div>
            </form>
          </details>
        </div>` : ''}

      ${o.payment_provider === BANK_PROVIDER ? `<div class="box box--warn">
        <strong>Przelew bankowy</strong>
        <span>Prosimy o wpłatę bezpośrednio na nasze konto bankowe. Prosimy podać numer zamówienia w tytule płatności. Zamówienie zostanie przekazane do realizacji po zaksięgowaniu kwoty na naszym koncie.</span>
        <span><strong>Numer rachunku:</strong> <span style="letter-spacing:0.5px;font-variant-numeric:tabular-nums">${BANK_ACCOUNT}</span></span>
        <span class="muted small">Tytuł przelewu: <strong>Zamówienie nr ${o.number} - can-c.pl</strong></span>
      </div>` : ''}

      ${o.status === 'refunded' ? `<div class="box box--warn">
        <strong>Zwrot środków</strong>
        <span>${o.refunded_amount ? `Kwota zwrotu: <strong>${pln(o.refunded_amount)}</strong>${o.refunded_amount < o.total ? ` z ${pln(o.total)} (zwrot częściowy)` : ''}` : 'Zamówienie oznaczone jako zwrócone.'}${o.refunded_at ? ` · ${date(o.refunded_at)}` : ''}</span>
      </div>` : ''}

      ${can(['paid', 'packing', 'on_hold', 'shipped', 'completed', 'cancelled']) && o.paid_at ? `<details class="manual" data-refund-wrap>
        <summary>Zwrot środków</summary>
        <form class="sec" data-refund>
          <p class="muted small">Zmiana statusu nie przelewa pieniędzy - ${o.payment_provider === BANK_PROVIDER ? 'wykonaj przelew zwrotny z konta firmowego' : 'zleć zwrot w panelu Przelewy24'}. Przy zwrocie częściowym w przychodzie zostaje różnica.</p>
          <div class="row2">
            <label class="field">Kwota zwrotu (zł)<input class="input" name="amount" inputmode="decimal" value="${(o.total / 100).toFixed(2).replace('.', ',')}" /></label>
            <span class="field muted small" style="align-self:end">Zamówienie: ${pln(o.total)}</span>
          </div>
          <label class="field">Wiadomość do klienta (opcjonalnie)<textarea class="input" name="message" rows="2" maxlength="1000" placeholder="Np. zwrot po odstąpieniu od umowy - otrzymaliśmy paczkę 12.11."></textarea></label>
          <label class="check"><input type="checkbox" name="restock" /> Przywróć stany magazynowe (produkty wróciły nienaruszone)</label>
          <label class="check"><input type="checkbox" name="notify" checked /> Wyślij klientowi e-mail o zwrocie</label>
          <div class="actions"><button class="btn btn--danger btn--sm">Oznacz jako zwrócone</button></div>
        </form>
      </details>` : ''}

      <div class="actions">
        ${can(['paid', 'packing', 'shipped']) ? '<button type="button" class="btn btn--outline btn--sm" data-act="complete">Zrealizowane</button>' : ''}
        ${can(['paid', 'packing']) ? '<button type="button" class="btn btn--outline btn--sm" data-act="hold">Wstrzymaj</button>' : ''}
        ${can(['on_hold']) ? '<button type="button" class="btn btn--outline btn--sm" data-act="unhold">Przywróć</button>' : ''}
        ${can(['pending_payment', 'cancelled']) && o.payment_provider !== BANK_PROVIDER ? '<button type="button" class="btn btn--sm" data-act="check_payment">Sprawdź płatność w P24</button>' : ''}
        ${o.payment_provider === BANK_PROVIDER && o.status === 'pending_payment' ? '<button type="button" class="btn btn--sm" data-act="finalize_bank">Oznacz jako opłacone</button>' : ''}
        ${can(['pending_payment', 'paid', 'packing', 'on_hold']) ? '<button type="button" class="btn btn--danger btn--sm" data-act="cancel">Anuluj</button>' : ''}
      </div>

      ${wc ? '' : `<details class="sec manual" data-edit-wrap>
        <summary>Edytuj dane zamówienia</summary>
        <form class="sec" data-oedit>
          <div class="row2"><label class="field">Imię i nazwisko<input class="input" name="name" value="${esc(name)}" /></label><label class="field">Telefon<input class="input" name="phone" value="${esc(a.phone || '')}" /></label></div>
          <label class="field">E-mail<input class="input" name="email" type="email" value="${esc(o.email)}" /></label>
          <label class="field">Dostawa<select class="input" name="shipping_method" data-oedit-method><option value="inpost_locker" ${o.shipping_method !== 'dpd' ? 'selected' : ''}>InPost Paczkomat</option><option value="dpd" ${o.shipping_method === 'dpd' ? 'selected' : ''}>Kurier DPD</option></select></label>
          <label class="field" data-oedit-locker>Kod Paczkomatu<input class="input" name="shipping_point" value="${esc(o.shipping_point || '')}" /></label>
          <div data-oedit-addr><label class="field">Ulica i numer<input class="input" name="street" value="${esc(a.street || '')}" /></label>
            <div class="row2"><label class="field">Kod pocztowy<input class="input" name="postcode" value="${esc(a.postcode || '')}" /></label><label class="field">Miejscowość<input class="input" name="city" value="${esc(a.city || '')}" /></label></div></div>
          <label class="check"><input type="checkbox" name="wants_invoice" ${o.wants_invoice ? 'checked' : ''} /> Faktura na firmę</label>
          <div class="row2"><label class="field">Firma<input class="input" name="company" value="${esc(o.billing?.company || '')}" /></label><label class="field">NIP<input class="input" name="nip" value="${esc(o.billing?.nip || '')}" /></label></div>
          <label class="field">Adres firmy<input class="input" name="invStreet" value="${esc(o.billing?.street || '')}" /></label>
          <div class="row2"><label class="field">Kod<input class="input" name="invPostcode" value="${esc(o.billing?.postcode || '')}" /></label><label class="field">Miejscowość<input class="input" name="invCity" value="${esc(o.billing?.city || '')}" /></label></div>
          <label class="field">Uwagi klienta<textarea class="input" name="customer_note" rows="2">${esc(o.customer_note || '')}</textarea></label>
          <p class="muted">Produktów i kwot nie zmieniamy - przy innej zawartości anuluj zamówienie i dodaj nowe.</p>
          <div class="actions"><button class="btn btn--sm">Zapisz zmiany</button></div>
        </form>
      </details>`}

      <div class="sec"><h3 class="sec__t">Historia</h3>
        <ol class="events">${events.map((e: any) => `<li class="${BAD.has(e.type) ? 'bad' : ''}"><time>${date(e.created_at)}</time>${EVENT[e.type] || esc(e.type)}${e.data?.to ? ` → ${STATUS[e.data.to] || esc(e.data.to)}` : ''}${e.data?.amount && e.type !== 'p24_check' ? ` · ${pln(e.data.amount)}` : ''}${e.data?.note ? `: ${esc(e.data.note)}` : ''}${e.data?.message ? ` (${esc(e.data.topic || '')}): <span class="note">${esc(e.data.message)}</span>` : ''}${e.data?.code ? ` · kod ${esc(e.data.code)}` : ''}${e.data?.scope ? `: ${esc(e.data.items)}${e.data.note ? ` - ${esc(e.data.note)}` : ''}` : ''}${e.data?.error ? `: <span class="muted">${esc(e.data.error)}</span>` : ''}${e.data?.by ? ` <span class="muted">(${esc(e.data.by)})</span>` : ''}</li>`).join('')}</ol>
      </div>

      <form class="sec" data-note>
        <label class="field">Notatka wewnętrzna<textarea name="note" class="input" rows="2" maxlength="1000"></textarea></label>
        <div class="actions"><button class="btn btn--outline btn--sm">Dodaj notatkę</button></div>
      </form>`;

    bindLinks(body);
    const oedit = body.querySelector<HTMLFormElement>('[data-oedit]');
    if (oedit) {
      const sync = () => { const dpd = (oedit.elements.namedItem('shipping_method') as HTMLSelectElement).value === 'dpd'; (oedit.querySelector('[data-oedit-locker]') as HTMLElement).hidden = dpd; (oedit.querySelector('[data-oedit-addr]') as HTMLElement).hidden = !dpd; };
      oedit.querySelector('[data-oedit-method]')!.addEventListener('change', sync); sync();
      oedit.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const fd = new FormData(oedit);
        const p: Record<string, unknown> = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
        p.wants_invoice = fd.get('wants_invoice') !== null;
        await act({ id, action: 'update', ...p });
      });
    }
    body.querySelector<HTMLFormElement>('[data-pack]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target as HTMLFormElement);
      await act({ id, action: 'pack', notify: f.get('notify') !== null, message: f.get('message') });
    });
    body.querySelector<HTMLFormElement>('[data-refund]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target as HTMLFormElement);
      const zlote = Number(String(f.get('amount') || '').replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(zlote) || zlote <= 0) { toast('Podaj kwotę zwrotu.', true); return; }
      const amount = Math.round(zlote * 100);
      const notify = f.get('notify') !== null;
      if (!confirm(`Oznaczyć zamówienie jako zwrócone (${pln(amount)})?${notify ? ' Klient dostanie e-mail.' : ''}`)) return;
      await act({ id, action: 'refund', amount, restock: f.get('restock') !== null, notify, message: f.get('message') });
    });
    body.querySelector<HTMLFormElement>('[data-ship]')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target as HTMLFormElement);
      await act({ id, action: 'ship', carrier: f.get('carrier'), tracking: f.get('tracking'), notify: f.get('notify') !== null });
    });
    body.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.act === 'cancel' && !confirm('Anulować zamówienie?')) return;
      if (b.dataset.act === 'finalize_bank') { if (!confirm('Oznacz zamówienie jako opłacone? Użyj po zaksięgowaniu przelewu na koncie bankowym.')) return; await act({ id, action: 'finalize_bank' }); return; }
      await act({ id, action: b.dataset.act });
    }));
    body.querySelector<HTMLFormElement>('[data-note]')!.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      await act({ id, action: 'note', note: new FormData(ev.target as HTMLFormElement).get('note') });
    });
  } catch (e) {
    body.innerHTML = `<p class="err">${esc((e as Error).message)}</p>`;
  }
}

export async function act(payload: any) {
  try {
    const r = await api('/api/admin/order', payload);
    toast(r.warning || 'Zapisano.', Boolean(r.warning));
    await openOrder(payload.id, false);
    loadOrders();
  } catch (e) { toast((e as Error).message, true); }
}
