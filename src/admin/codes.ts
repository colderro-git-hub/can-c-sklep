// Panel admina - moduł „codes” (wydzielony z admin/index.astro).
import { $, STATUS, api, date, esc, pln, toast } from './core';
import { drawerNav, openDrawer, openOrder } from './orders';
import { bindLinks } from './navigation';

// ---------- Kody rabatowe ----------
export async function loadCodes() {
  const tbody = $('[data-codes]');
  tbody.innerHTML = '<tr><td colspan="7" class="empty">Ładowanie…</td></tr>';
  try {
    const { rows } = await api('/api/admin/kody');
    const d = (s: string | null) => (s ? new Date(s).toLocaleDateString('pl-PL') : '');
    tbody.innerHTML = rows.length ? rows.map((c: any) => `
      <tr data-cid="${c.id}" tabindex="0" class="clickrow" title="Edytuj kod i zobacz, kto go użył">
        <td><strong>${esc(c.code)}</strong>${c.description ? `<br><span class="muted">${esc(c.description)}</span>` : ''}</td>
        <td class="nowrap">${c.type === 'percent' ? `${c.value}%` : pln(c.value)}</td>
        <td>${c.min_total ? `od ${pln(c.min_total)}` : '-'}${c.once_per_customer ? '<br><span class="muted">1× na klienta</span>' : ''}</td>
        <td class="nowrap">${c.starts_at || c.ends_at ? `${d(c.starts_at) || '…'} - ${d(c.ends_at) || '…'}` : 'bezterminowo'}</td>
        <td>${c.used_count}${c.max_uses ? ` / ${c.max_uses}` : ''}</td>
        <td class="r">${c.stats.orders}${c.stats.last ? `<br><span class="muted">ost. ${new Date(c.stats.last).toLocaleDateString('pl-PL')}</span>` : ''}</td>
        <td class="r nowrap"><strong>${pln(c.stats.revenue)}</strong>${c.stats.orders ? `<br><span class="muted">śr. ${pln(Math.round(c.stats.revenue / c.stats.orders))}</span>` : ''}</td>
        <td class="r nowrap">${pln(c.stats.discount)}</td>
        <td>${c.customers?.email ? esc(c.customers.email) : 'wszyscy'}</td>
        <td data-stop><input type="checkbox" data-toggle="${c.id}" ${c.active ? 'checked' : ''} aria-label="Aktywny" /></td>
      </tr>`).join('') : '<tr><td colspan="10" class="empty">Brak kodów. Utwórz pierwszy powyżej.</td></tr>';
    tbody.querySelectorAll<HTMLInputElement>('[data-toggle]').forEach((cb) => cb.addEventListener('change', async () => {
      try { await api('/api/admin/kody', { action: 'toggle', id: cb.dataset.toggle, active: cb.checked }); toast(cb.checked ? 'Kod włączony.' : 'Kod wyłączony.'); }
      catch (e) { cb.checked = !cb.checked; toast((e as Error).message, true); }
    }));
    tbody.querySelectorAll<HTMLElement>('tr[data-cid]').forEach((tr) => {
      const go = (e: Event) => { if ((e.target as HTMLElement).closest('[data-stop]')) return; openCode(tr.dataset.cid!); };
      tr.addEventListener('click', go); tr.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') go(e); });
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty err">${esc((e as Error).message)}</td></tr>`;
  }
}
// Szczegóły kodu: edycja + lista zamówień, w których go użyto
export async function openCode(id: string, push = true) {
  $('[data-drawer]').classList.toggle('drawer--wide', true);
  openDrawer(true); drawerNav(() => openCode(id, false), push);
  $('[data-drawer]').classList.add('drawer--wide');
  const body = $('[data-d-body]');
  body.innerHTML = '<p class="muted">Ładowanie…</p>';
  let d: any;
  try { d = await api(`/api/admin/kody?uses=${encodeURIComponent(id)}`); }
  catch (e) { body.innerHTML = `<p class="err">${esc((e as Error).message)}</p>`; return; }
  const c = d.code;
  const uses: any[] = d.uses;
  $('[data-d-title]').textContent = `Kod ${c.code}`;
  const day = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '');
  const val = c.type === 'percent' ? String(c.value) : (c.value / 100).toFixed(2).replace('.', ',');
  const paidSt = new Set(['paid', 'packing', 'shipped', 'completed']);
  const paidUses = uses.filter((u) => paidSt.has(u.status));
  const nameLocked = c.used_count > 0 || uses.length > 0;
  body.innerHTML = `
    <div class="meta"><span class="st ${c.active ? 'st--shipped' : 'st--pending_payment'}">${c.active ? 'Aktywny' : 'Wyłączony'}</span><span>Użycia: ${c.used_count}${c.max_uses ? ` / ${c.max_uses}` : ''}</span><span>Opłacone zamówienia: ${paidUses.length}</span><span>Udzielony rabat: ${pln(paidUses.reduce((s2, u) => s2 + (u.amount || 0), 0))}</span></div>
    <form class="sec" data-code-edit novalidate>
      <h3 class="sec__t">Ustawienia kodu</h3>
      <div class="code-form">
        <label class="field">Kod<input class="input" name="code" value="${esc(c.code)}" maxlength="30" style="text-transform:uppercase" ${nameLocked ? 'readonly title="Kod był użyty - nazwy nie można zmienić"' : ''} /></label>
        <label class="field">Rodzaj<select class="input" name="type"><option value="percent" ${c.type === 'percent' ? 'selected' : ''}>Procent (%)</option><option value="amount" ${c.type === 'amount' ? 'selected' : ''}>Kwota (zł)</option></select></label>
        <label class="field">Wartość<input class="input" name="value" value="${esc(val)}" inputmode="decimal" /></label>
        <label class="field">Minimalna kwota (zł)<input class="input" name="min_total" value="${c.min_total ? (c.min_total / 100).toFixed(2).replace('.', ',') : ''}" inputmode="decimal" placeholder="0" /></label>
        <label class="field">Ważny od<input class="input" name="starts_at" type="date" value="${day(c.starts_at)}" /></label>
        <label class="field">Ważny do<input class="input" name="ends_at" type="date" value="${day(c.ends_at)}" /></label>
        <label class="field">Limit użyć (łącznie)<input class="input" name="max_uses" type="number" min="${Math.max(1, c.used_count)}" value="${c.max_uses ?? ''}" placeholder="bez limitu" /></label>
        <label class="field">Tylko dla klienta (e-mail)<input class="input" name="email" type="email" value="${esc(c.customers?.email || '')}" placeholder="puste = dla wszystkich" /></label>
        <label class="field code-form__wide">Opis widoczny na koncie klienta<input class="input" name="description" value="${esc(c.description || '')}" maxlength="200" placeholder="puste = kod nie jest pokazywany na kontach" /></label>
        <label class="check code-form__wide"><input type="checkbox" name="once_per_customer" ${c.once_per_customer ? 'checked' : ''} /> Jeden raz na klienta</label>
      </div>
      <p class="muted small">${nameLocked ? 'Kod był już użyty, więc jego nazwa jest zablokowana. ' : ''}Zmiany działają na nowe zamówienia. Zamówienia złożone wcześniej zachowują naliczony rabat.</p>
      <div class="actions"><button class="btn btn--sm">Zapisz kod</button></div>
    </form>
    <div class="sec">
      <h3 class="sec__t">Kto użył kodu <span class="muted">(${uses.length})</span></h3>
      ${uses.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Zamówienie</th><th>Data</th><th>Klient</th><th class="r">Rabat</th><th class="r">Kwota</th><th>Status</th></tr></thead>
        <tbody>${uses.map((u) => `<tr data-uo="${u.id}" class="clickrow" tabindex="0">
          <td class="nowrap"><strong>${u.number}</strong>${u.source === 'woocommerce' ? '<span class="wc">WC</span>' : u.source === 'admin' ? '<span class="wc">panel</span>' : ''}</td>
          <td class="nowrap">${date(u.created_at)}</td>
          <td>${u.name ? `<strong>${esc(u.name)}</strong><br>` : ''}${u.customer_id ? `<button type="button" class="link" data-open-customer="${u.customer_id}" data-stop>${esc(u.email)}</button>` : esc(u.email)}</td>
          <td class="r nowrap">${pln(u.amount)}</td>
          <td class="r nowrap">${pln(u.total)}</td>
          <td><span class="st st--${u.status}">${STATUS[u.status] || esc(u.status)}</span></td>
        </tr>`).join('')}</tbody></table></div>
        <p class="muted small">Licznik „Użycia” rośnie dopiero po opłaceniu zamówienia. Na liście są też zamówienia nieopłacone i anulowane - patrz status.</p>`
      : '<p class="muted">Nikt jeszcze nie użył tego kodu.</p>'}
    </div>`;
  bindLinks(body);
  body.querySelectorAll<HTMLElement>('tr[data-uo]').forEach((tr) => {
    const go = (e: Event) => { if ((e.target as HTMLElement).closest('[data-stop]')) return; openOrder(tr.dataset.uo!); };
    tr.addEventListener('click', go); tr.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') go(e); });
  });
  body.querySelector<HTMLFormElement>('[data-code-edit]')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const p: Record<string, unknown> = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
    p.once_per_customer = fd.get('once_per_customer') !== null;
    if (p.starts_at) p.starts_at = `${p.starts_at}T00:00:00`;
    if (p.ends_at) p.ends_at = `${p.ends_at}T23:59:59`;
    try { await api('/api/admin/kody', { action: 'update', id, ...p }); toast('Zapisano kod.'); loadCodes(); openCode(id, false); }
    catch (err) { toast((err as Error).message, true); }
  });
}

$<HTMLFormElement>('[data-code-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target as HTMLFormElement;
  const fd = new FormData(f);
  const body: Record<string, unknown> = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  body.action = 'create';
  body.once_per_customer = fd.get('once_per_customer') !== null;
  if (body.ends_at) body.ends_at = `${body.ends_at}T23:59:59`;
  try { await api('/api/admin/kody', body); toast('Kod utworzony.'); f.reset(); loadCodes(); }
  catch (err) { toast((err as Error).message, true); }
});
