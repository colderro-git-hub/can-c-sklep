// Panel admina - moduł „customers” (wydzielony z admin/index.astro).
import { $, STATUS, api, esc, pln, toast } from './core';
import { drawerNav, openDrawer, openOrder } from './orders';

// ---------- Klienci ----------
// Domyślny kierunek po pierwszym kliknięciu: teksty A→Z, liczby i daty od największych
export const TEXT_COLS = new Set(['name', 'email', 'country', 'city', 'postcode', 'phone']);
export const cState = { q: '', sort: 'last_active', dir: 'desc', segment: '', buyers: false, page: 1, size: 50 };
export const dshort = (x: string | null) => (x ? new Date(x).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' }) : '-');
export const dnum = (x: string | null) => (x ? new Date(x).toLocaleDateString('pl-PL') : '-');
export const cParams = (extra: Record<string, string> = {}) => new URLSearchParams({ q: cState.q, sort: cState.sort, dir: cState.dir, segment: cState.segment, size: String(cState.size), ...(cState.buyers ? { buyers: '1' } : {}), ...extra });
export function renderSortHeads() {
  document.querySelectorAll<HTMLElement>('[data-c-head] th[data-sort]').forEach((th) => {
    const on = th.dataset.sort === cState.sort;
    th.setAttribute('aria-sort', on ? (cState.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    th.dataset.arrow = on ? (cState.dir === 'asc' ? '↑' : '↓') : '↕';
  });
}
export async function loadCustomers() {
  const tbody = $('[data-c-rows]');
  tbody.innerHTML = '<tr><td colspan="11" class="empty">Ładowanie…</td></tr>';
  renderSortHeads();
  $<HTMLAnchorElement>('[data-c-csv]').href = `/api/admin/klienci?${cParams({ format: 'csv' })}`;
  $<HTMLAnchorElement>('[data-c-match]').href = `/api/admin/klienci?${cParams({ format: 'match' })}`;
  try {
    const d = await api(`/api/admin/klienci?${cParams({ page: String(cState.page) })}`);
    $('[data-c-total]').textContent = `(${d.total})`;
    const from = d.total ? (d.page - 1) * d.size + 1 : 0, to = Math.min(d.page * d.size, d.total);
    $('[data-c-page]').textContent = `${from}-${to} z ${d.total} · strona ${d.page} z ${d.pages}`;
    $<HTMLButtonElement>('[data-c-prev]').disabled = d.page <= 1;
    $<HTMLButtonElement>('[data-c-next]').disabled = d.page >= d.pages;
    tbody.innerHTML = d.rows.length ? d.rows.map((c: any) => `
      <tr data-cid="${c.id}" tabindex="0">
        <td><strong>${esc(c.full_name || '-')}</strong>${c.has_account ? ' <span class="wc">konto</span>' : ''}${c.admin_note ? ' <span class="wc wc--note" title="' + esc(c.admin_note) + '">notatka</span>' : ''}</td>
        <td class="nowrap">${dnum(c.last_active_at)}</td>
        <td class="nowrap">${dnum(c.created_at)}</td>
        <td><a href="mailto:${esc(c.email)}" data-stop>${esc(c.email)}</a></td>
        <td class="r">${c.orders_count}</td>
        <td class="r nowrap"><strong>${pln(c.total_spent)}</strong></td>
        <td class="r nowrap">${pln(c.avg_order)}</td>
        <td>${esc(c.country || '')}</td>
        <td>${esc(c.city || '')}</td>
        <td class="nowrap">${esc(c.postcode || '')}</td>
        <td class="nowrap">${c.phone ? `<a href="tel:${esc(c.phone)}" data-stop>${esc(c.phone)}</a>` : ''}</td>
      </tr>`).join('') : '<tr><td colspan="11" class="empty">Brak klientów dla tych kryteriów.</td></tr>';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty err">${esc((e as Error).message)}</td></tr>`;
  }
}
export async function openCustomer(id: string, push = true) {
  drawerNav(() => openCustomer(id, false), push);
  const body = $('[data-d-body]');
  openDrawer(true); $('[data-drawer]').classList.add('drawer--wide');
  body.innerHTML = '<p class="muted">Ładowanie…</p>';
  try {
    const { customer: c, orders, codes } = await api(`/api/admin/klienci?id=${id}`);
    $('[data-d-title]').textContent = c.full_name || c.email;
    const a = c.default_address || {};
    const treat = c.treatment_end_at ? Math.round((new Date(c.treatment_end_at).getTime() - Date.now()) / 864e5) : null;
    body.innerHTML = `
      <div class="meta">${c.has_account ? '<span class="st st--paid">Ma konto</span>' : '<span class="st st--pending_payment">Bez konta</span>'}${c.marketing_consent ? '<span class="st st--shipped">Zgoda marketingowa</span>' : ''}${c.source === 'woocommerce' ? '<span class="wc">WC</span>' : ''}</div>
      <div class="kpis kpis--mini">
        <div class="kpi"><span class="kpi__label">Zamówienia</span><span class="kpi__value">${c.orders_count}</span></div>
        <div class="kpi"><span class="kpi__label">Suma</span><span class="kpi__value">${pln(c.total_spent)}</span></div>
        <div class="kpi"><span class="kpi__label">Średnio</span><span class="kpi__value">${pln(c.avg_order)}</span></div>
      </div>
      ${treat !== null ? `<div class="box ${treat <= 21 ? 'box--amber' : ''}">Kuracja: ${treat > 0 ? `zapas kropli kończy się za ok. <strong>${treat} dni</strong>` : `zapas skończył się ok. <strong>${-treat} dni temu</strong>`} (${dshort(c.treatment_end_at)}, ostatnio ${c.last_order_packs} op.)</div>` : ''}

      <form class="sec" data-cnote>
        <h3 class="sec__t">Notatka o kliencie</h3>
        <textarea class="input" name="note" rows="2" maxlength="1000" placeholder="np. prosi o telefon przed wysyłką - widoczna przy każdym zamówieniu">${esc(c.admin_note || '')}</textarea>
        <div class="actions"><button class="btn btn--outline btn--sm">Zapisz notatkę</button></div>
      </form>

      <div class="sec"><h3 class="sec__t">Dane</h3>
        <dl class="kv">
          <dt>E-mail</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd>
          <dt>Telefon</dt><dd>${esc(c.phone || '-')}</dd>
          <dt>Adres</dt><dd>${a.street ? `${esc(a.street)}<br>` : ''}${esc([c.postcode, c.city].filter(Boolean).join(' ') || '-')}${c.country ? `, ${esc(c.country)}` : ''}</dd>
          <dt>Paczkomat</dt><dd>${esc(c.default_locker || '-')}</dd>
          ${c.billing?.nip ? `<dt>Faktura</dt><dd>${esc(c.billing.company || '')}<br>NIP ${esc(c.billing.nip)}</dd>` : ''}
          <dt>Rejestracja</dt><dd>${dshort(c.created_at)}</dd>
          <dt>Ostatnio aktywny</dt><dd>${dshort(c.last_active_at)}</dd>
          ${c.marketing_consent ? `<dt>Zgoda</dt><dd>${dshort(c.consent_at)}${c.consent_source ? ` <span class="muted">(${esc(c.consent_source)})</span>` : ''}</dd>` : ''}
        </dl>
      </div>

      <details class="sec manual">
        <summary>Edytuj dane klienta</summary>
        <form class="sec" data-cedit>
          <div class="row2"><label class="field">Imię<input class="input" name="first_name" value="${esc(c.first_name || '')}" /></label><label class="field">Nazwisko<input class="input" name="last_name" value="${esc(c.last_name || '')}" /></label></div>
          <label class="field">E-mail${c.has_account ? ' <span class="muted">(login klienta - bez zmian)</span>' : ''}<input class="input" name="email" type="email" value="${esc(c.email)}" ${c.has_account ? 'readonly' : ''} /></label>
          <div class="row2"><label class="field">Telefon<input class="input" name="phone" value="${esc(c.phone || '')}" /></label><label class="field">Paczkomat<input class="input" name="default_locker" value="${esc(c.default_locker || '')}" /></label></div>
          <label class="field">Ulica i numer<input class="input" name="street" value="${esc(a.street || '')}" /></label>
          <div class="row2"><label class="field">Kod pocztowy<input class="input" name="postcode" value="${esc(a.postcode || '')}" /></label><label class="field">Miejscowość<input class="input" name="city" value="${esc(a.city || '')}" /></label></div>
          <label class="field">Kraj<input class="input" name="country" maxlength="2" value="${esc(a.country || c.country || 'PL')}" /></label>
          <div class="row2"><label class="field">Firma<input class="input" name="company" value="${esc(c.billing?.company || '')}" /></label><label class="field">NIP<input class="input" name="nip" value="${esc(c.billing?.nip || '')}" /></label></div>
          <label class="field">Adres firmy<input class="input" name="invStreet" value="${esc(c.billing?.street || '')}" /></label>
          <div class="row2"><label class="field">Kod<input class="input" name="invPostcode" value="${esc(c.billing?.postcode || '')}" /></label><label class="field">Miejscowość<input class="input" name="invCity" value="${esc(c.billing?.city || '')}" /></label></div>
          <label class="check"><input type="checkbox" name="marketing_consent" ${c.marketing_consent ? 'checked' : ''} /> Zgoda marketingowa (zaznacz tylko, jeśli klient ją wyraził)</label>
          <div class="actions"><button class="btn btn--sm">Zapisz dane</button></div>
        </form>
      </details>

      <details class="sec manual">
        <summary>Wyślij kod rabatowy</summary>
        <form class="sec" data-pcode>
          <div class="row2">
            <label class="field">Rodzaj<select class="input" name="type"><option value="percent">Procent</option><option value="amount">Kwota (zł)</option></select></label>
            <label class="field">Wartość<input class="input" name="value" value="10" inputmode="decimal" /></label>
          </div>
          <div class="row2">
            <label class="field">Ważny (dni)<input class="input" name="days" type="number" min="1" max="365" value="30" /></label>
            <label class="field">Od kwoty (zł)<input class="input" name="min_total" inputmode="decimal" placeholder="0" /></label>
          </div>
          <label class="field">Wiadomość (opcjonalnie)<textarea class="input" name="message" rows="2" maxlength="600" placeholder="np. dziękujemy za zaufanie - na kolejną kurację mamy dla Ciebie rabat"></textarea></label>
          <label class="check"><input type="checkbox" name="notify" checked /> Wyślij klientowi e-mail z kodem</label>
          <div class="actions"><button class="btn btn--sm">Utwórz kod osobisty</button></div>
        </form>
      </details>
      ${codes.length ? `<div class="sec"><h3 class="sec__t">Kody klienta</h3><ul class="items">${codes.map((k: any) => `<li><span><strong>${esc(k.code)}</strong> · ${k.type === 'percent' ? `${k.value}%` : pln(k.value)}${k.ends_at ? ` · do ${dnum(k.ends_at)}` : ''}</span><span>${k.used_count >= (k.max_uses ?? Infinity) ? 'wykorzystany' : k.active ? 'aktywny' : 'wyłączony'}</span></li>`).join('')}</ul></div>` : ''}

      <div class="sec"><h3 class="sec__t">Zamówienia</h3>
        <ul class="items">${orders.length ? orders.map((o: any) => `<li class="clickable" data-oid="${o.id}"><span><strong>${o.number}</strong> · ${dshort(o.created_at)}<br><span class="muted">${o.order_items.map((i: any) => `${esc(i.name)} × ${i.qty}`).join(', ')}${o.discount_code ? ` · kod ${esc(o.discount_code)}` : ''}</span></span><span class="r">${pln(o.total)}<br><span class="st st--${o.status}">${STATUS[o.status] || esc(o.status)}</span></span></li>`).join('') : '<li class="muted">Brak zamówień.</li>'}</ul>
      </div>`;
    body.querySelectorAll<HTMLElement>('[data-oid]').forEach((li) => li.addEventListener('click', () => openOrder(li.dataset.oid!)));
    body.querySelector<HTMLFormElement>('[data-cedit]')!.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target as HTMLFormElement);
      const p: Record<string, unknown> = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
      p.marketing_consent = fd.get('marketing_consent') !== null;
      try { await api('/api/admin/klienci', { id, action: 'update', ...p }); toast('Zapisano dane klienta.'); openCustomer(id, false); loadCustomers(); }
      catch (err) { toast((err as Error).message, true); }
    });
    body.querySelector<HTMLFormElement>('[data-cnote]')!.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try { await api('/api/admin/klienci', { id, note: new FormData(ev.target as HTMLFormElement).get('note') }); toast('Zapisano notatkę.'); loadCustomers(); }
      catch (err) { toast((err as Error).message, true); }
    });
    body.querySelector<HTMLFormElement>('[data-pcode]')!.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(ev.target as HTMLFormElement);
      try {
        const r = await api('/api/admin/kody', { action: 'personal', customer_id: id, type: fd.get('type'), value: fd.get('value'), days: fd.get('days'), min_total: fd.get('min_total'), message: fd.get('message'), notify: fd.get('notify') !== null });
        toast(`Utworzono kod ${r.code}${r.mailed ? ' i wysłano e-mail' : fd.get('notify') !== null ? ' (e-mail NIE został wysłany)' : ''}.`, fd.get('notify') !== null && !r.mailed);
        openCustomer(id, false);
      } catch (err) { toast((err as Error).message, true); }
    });
  } catch (e) { body.innerHTML = `<p class="err">${esc((e as Error).message)}</p>`; }
}
$('[data-c-search]').addEventListener('submit', (e) => { e.preventDefault(); cState.q = $<HTMLInputElement>('#cq').value.trim(); cState.page = 1; loadCustomers(); });
export let cTimer = 0;
$<HTMLInputElement>('#cq').addEventListener('input', () => { clearTimeout(cTimer); cTimer = window.setTimeout(() => { cState.q = $<HTMLInputElement>('#cq').value.trim(); cState.page = 1; loadCustomers(); }, 400); });
$<HTMLInputElement>('[data-c-buyers]').addEventListener('change', (e) => { cState.buyers = (e.target as HTMLInputElement).checked; cState.page = 1; loadCustomers(); });
$<HTMLSelectElement>('[data-c-size]').addEventListener('change', (e) => { cState.size = Number((e.target as HTMLSelectElement).value); cState.page = 1; loadCustomers(); });
document.querySelectorAll<HTMLElement>('[data-c-head] th[data-sort]').forEach((th) => {
  th.tabIndex = 0;
  const go = () => {
    const col = th.dataset.sort!;
    if (cState.sort === col) cState.dir = cState.dir === 'asc' ? 'desc' : 'asc';
    else { cState.sort = col; cState.dir = TEXT_COLS.has(col) ? 'asc' : 'desc'; }
    cState.page = 1; loadCustomers();
  };
  th.addEventListener('click', go);
  th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
});
document.querySelectorAll<HTMLButtonElement>('[data-seg]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-seg]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
  b.setAttribute('aria-pressed', 'true');
  cState.segment = b.dataset.seg || '';
  if (cState.segment === 'treatment') { cState.sort = 'last_active'; cState.dir = 'desc'; }
  cState.page = 1; loadCustomers();
}));
$('[data-c-prev]').addEventListener('click', () => { cState.page--; loadCustomers(); });
$('[data-c-next]').addEventListener('click', () => { cState.page++; loadCustomers(); });
export const cRowOpen = (e: Event) => { const t = e.target as HTMLElement; if (t.closest('[data-stop]')) return; const tr = t.closest('tr[data-cid]') as HTMLElement | null; if (tr) openCustomer(tr.dataset.cid!); };
$('[data-c-rows]').addEventListener('click', cRowOpen);
$('[data-c-rows]').addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') cRowOpen(e); });
