// Panel admina - moduł „promotions” (wydzielony z admin/index.astro).
import { applyPromotions, describeDiscount, normalizePromotion } from '../lib/promotions';
import { $, STATUS, api, date, esc, pln, toast } from './core';
import { drawerNav, openDrawer, openOrder } from './orders';
import { bindLinks } from './navigation';

// ---------- Promocje automatyczne ----------
export let promoProducts: { id: string; name: string; price: number | null; active: boolean }[] = [];
export const zlInput = (g: number) => (g / 100).toFixed(2).replace('.', ',').replace(',00', '');
export const pName = (id: string) => promoProducts.find((x) => x.id === id)?.name || id;
export const promoSummary = (p: any) => p.kind === 'bundle'
  ? `${p.items.map((i: any) => `${esc(pName(i.product_id))}${i.qty > 1 ? ` × ${i.qty}` : ''}`).join(' + ')}<br><strong>${describeDiscount(p.type, p.value)}</strong> za komplet${p.max_sets ? ` · maks. ${p.max_sets} w zamówieniu` : ''}`
  : `${p.product_ids.map((id: string) => esc(pName(id))).join(', ')}${p.combined ? ' <span class="muted">(sztuki sumowane)</span>' : ''}<br>${p.tiers.map((t: any) => `od ${t.min} szt. <strong>${describeDiscount(t.type, t.value, true)}</strong>`).join(' · ')}`;

export async function loadPromos() {
  const tbody = $('[data-promos]');
  tbody.innerHTML = '<tr><td colspan="9" class="empty">Ładowanie…</td></tr>';
  try {
    const { rows, products } = await api('/api/admin/promocje');
    promoProducts = products;
    const d = (x: string | null) => (x ? new Date(x).toLocaleDateString('pl-PL') : '');
    const now = Date.now();
    tbody.innerHTML = rows.length ? rows.map((p: any) => {
      const future = p.starts_at && new Date(p.starts_at).getTime() > now;
      const past = p.ends_at && new Date(p.ends_at).getTime() < now;
      return `<tr data-pmid="${p.id}" tabindex="0" class="clickrow" title="Edytuj promocję i zobacz, kto z niej skorzystał">
        <td><strong>${esc(p.name)}</strong><br><span class="muted">${p.kind === 'bundle' ? 'Zestaw' : 'Rabat ilościowy'}${p.label && p.label !== p.name ? ` · klient widzi: „${esc(p.label)}”` : ''}</span>${p.code ? `<br><span class="wc" style="margin-left:0">kod ${esc(p.code)}</span>` : ''}</td>
        <td>${promoSummary(p)}</td>
        <td class="nowrap">${p.starts_at || p.ends_at ? `${d(p.starts_at) || '…'} - ${d(p.ends_at) || '…'}` : 'bezterminowo'}${future ? '<br><span class="muted">zaplanowana</span>' : past ? '<br><span class="err">zakończona</span>' : ''}</td>
        <td class="r">${p.stats.orders}${p.stats.last ? `<br><span class="muted">ost. ${new Date(p.stats.last).toLocaleDateString('pl-PL')}</span>` : ''}</td>
        <td class="r">${p.stats.customers}</td>
        <td class="r nowrap"><strong>${pln(p.stats.revenue)}</strong>${p.stats.orders ? `<br><span class="muted">śr. ${pln(Math.round(p.stats.revenue / p.stats.orders))}</span>` : ''}</td>
        <td class="r nowrap">${pln(p.stats.discount)}</td>
        <td>${p.with_codes ? 'łączy się' : '<span class="err">bez kodów</span>'}</td>
        <td data-stop><input type="checkbox" data-ptoggle="${p.id}" ${p.active ? 'checked' : ''} aria-label="Aktywna" /></td>
      </tr>`;
    }).join('') : '<tr><td colspan="9" class="empty">Brak promocji. Dodaj rabat ilościowy albo zestaw.</td></tr>';
    tbody.querySelectorAll<HTMLInputElement>('[data-ptoggle]').forEach((cb) => cb.addEventListener('change', async () => {
      try { await api('/api/admin/promocje', { action: 'toggle', id: cb.dataset.ptoggle, active: cb.checked }); toast(cb.checked ? 'Promocja włączona.' : 'Promocja wyłączona.'); }
      catch (e) { cb.checked = !cb.checked; toast((e as Error).message, true); }
    }));
    tbody.querySelectorAll<HTMLElement>('tr[data-pmid]').forEach((tr) => {
      const go = (e: Event) => { if ((e.target as HTMLElement).closest('[data-stop]')) return; openPromo(tr.dataset.pmid!); };
      tr.addEventListener('click', go); tr.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') go(e); });
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty err">${esc((e as Error).message)}</td></tr>`;
  }
}
document.querySelectorAll<HTMLButtonElement>('[data-promo-new]').forEach((b) => b.addEventListener('click', () => openPromo(null, true, b.dataset.promoNew as 'quantity' | 'bundle')));

export const productOpts = (sel = '') => promoProducts.map((x) => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}${x.active ? '' : ' (nieaktywny)'}</option>`).join('');
export const tierRow = (t: any = { min: '', type: 'percent', value: '' }) => `<div class="pm-row" data-tier>
    <label class="field">Od (szt.)<input class="input" data-t-min type="number" min="2" max="100" value="${esc(t.min)}" /></label>
    <label class="field">Rodzaj<select class="input" data-t-type><option value="percent" ${t.type !== 'amount' ? 'selected' : ''}>Procent (%)</option><option value="amount" ${t.type === 'amount' ? 'selected' : ''}>Kwota za sztukę (zł)</option></select></label>
    <label class="field">Rabat<input class="input" data-t-value inputmode="decimal" value="${t.value === '' ? '' : esc(t.type === 'amount' ? zlInput(t.value) : t.value)}" /></label>
    <button type="button" class="icon-btn" data-row-del aria-label="Usuń próg"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg></button></div>`;
export const itemRow = (it: any = { product_id: '', qty: 1 }) => `<div class="pm-row pm-row--item" data-item>
    <label class="field">Produkt<select class="input" data-i-prod><option value="">- wybierz -</option>${productOpts(it.product_id)}</select></label>
    <label class="field">Sztuk<input class="input" data-i-qty type="number" min="1" max="20" value="${esc(it.qty)}" /></label>
    <button type="button" class="icon-btn" data-row-del aria-label="Usuń produkt"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg></button></div>`;

// Szczegóły promocji: formularz (nowa / edycja) + lista zamówień
export async function openPromo(id: string | null, push = true, newKind: 'quantity' | 'bundle' = 'quantity') {
  openDrawer(true); drawerNav(() => openPromo(id, false, newKind), push);
  $('[data-drawer]').classList.add('drawer--wide');
  const body = $('[data-d-body]');
  body.innerHTML = '<p class="muted">Ładowanie…</p>';
  let p: any, uses: any[] = [];
  try {
    if (!promoProducts.length) promoProducts = (await api('/api/admin/promocje')).products;
    if (id) { const d = await api(`/api/admin/promocje?uses=${encodeURIComponent(id)}`); p = d.promo; uses = d.uses; }
  } catch (e) { body.innerHTML = `<p class="err">${esc((e as Error).message)}</p>`; return; }
  const kind: 'quantity' | 'bundle' = p ? p.kind : newKind;
  p ??= kind === 'quantity'
    ? { name: '', label: '', kind, product_ids: [], combined: false, tiers: [{ min: 2, type: 'percent', value: 5 }], with_codes: true, sort_order: 20, active: true }
    : { name: '', label: '', kind, items: [{ product_id: '', qty: 1 }, { product_id: '', qty: 1 }], type: 'percent', value: 10, max_sets: null, with_codes: true, sort_order: 5, active: true };
  $('[data-d-title]').textContent = id ? p.name : kind === 'bundle' ? 'Nowy zestaw' : 'Nowy rabat ilościowy';
  const day = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '');
  const paidSt = new Set(['paid', 'packing', 'shipped', 'completed']);
  const paidUses = uses.filter((u) => paidSt.has(u.status));
  const custs = new Set(paidUses.map((u) => u.customer_id || u.email)).size;

  body.innerHTML = `
    ${id ? `<div class="meta"><span class="st ${p.active ? 'st--shipped' : 'st--pending_payment'}">${p.active ? 'Aktywna' : 'Wyłączona'}</span><span>Opłacone zamówienia: ${paidUses.length}</span><span>Klienci: ${custs}</span><span>Przychód: ${pln(paidUses.reduce((a, u) => a + u.total, 0))}</span><span>Udzielony rabat: ${pln(paidUses.reduce((a, u) => a + (u.amount || 0), 0))}</span></div>` : ''}
    <form class="sec" data-promo-form novalidate>
      <div class="code-form">
        <label class="field">Nazwa w panelu<input class="input" name="name" value="${esc(p.name)}" maxlength="100" placeholder="${kind === 'bundle' ? 'np. Krople + kapsułki' : 'np. Rabat za zestaw'}" required /></label>
        <label class="field">Nazwa dla klienta<input class="input" name="label" value="${esc(p.label || '')}" maxlength="60" placeholder="puste = jak w panelu" /></label>
        <label class="field">Ważna od<input class="input" name="starts_at" type="date" value="${day(p.starts_at)}" /></label>
        <label class="field">Ważna do<input class="input" name="ends_at" type="date" value="${day(p.ends_at)}" /></label>
        <label class="field">Kod uruchamiający (opcjonalnie)<input class="input" name="code" value="${esc(p.code || '')}" maxlength="30" placeholder="puste = działa automatycznie" style="text-transform:uppercase" /></label>
      </div>
      <p class="muted small">Z kodem promocja jest ukryta: nie pokazuje się w koszyku ani na stronie produktu i działa dopiero po wpisaniu kodu w zamówieniu (np. na kampanię lub newsletter).</p>
      ${kind === 'quantity' ? `
        <h3 class="sec__t">Produkty</h3>
        <div class="pm-prods">${promoProducts.map((x) => `<label class="check"><input type="checkbox" name="product_ids" value="${esc(x.id)}" ${p.product_ids.includes(x.id) ? 'checked' : ''} /> ${esc(x.name)}${x.active ? '' : ' <span class="muted">(nieaktywny)</span>'}</label>`).join('')}</div>
        <label class="check"><input type="checkbox" name="combined" ${p.combined ? 'checked' : ''} /> Sumuj sztuki różnych produktów z listy (np. 1 × krople + 1 × kapsułki = 2 szt.)</label>
        <h3 class="sec__t">Progi rabatu</h3>
        <p class="muted small">Rabat obejmuje wszystkie sztuki produktu od osiągniętego progu. Kwota jest odejmowana od każdej sztuki.</p>
        <div data-tiers>${p.tiers.map(tierRow).join('')}</div>
        <button type="button" class="btn btn--outline btn--sm" data-add-tier>+ Dodaj próg</button>`
      : `
        <h3 class="sec__t">Skład zestawu</h3>
        <div data-items>${p.items.map(itemRow).join('')}</div>
        <button type="button" class="btn btn--outline btn--sm" data-add-item>+ Dodaj produkt</button>
        <div class="code-form" style="margin-top:14px">
          <label class="field">Rodzaj rabatu<select class="input" name="type"><option value="percent" ${p.type !== 'amount' ? 'selected' : ''}>Procent od wartości zestawu (%)</option><option value="amount" ${p.type === 'amount' ? 'selected' : ''}>Kwota za każdy zestaw (zł)</option></select></label>
          <label class="field">Rabat<input class="input" name="value" inputmode="decimal" value="${esc(p.type === 'amount' ? zlInput(p.value) : p.value)}" /></label>
          <label class="field">Maks. zestawów w zamówieniu<input class="input" name="max_sets" type="number" min="1" max="100" value="${p.max_sets ?? ''}" placeholder="bez limitu" /></label>
        </div>`}
      <div class="code-form" style="margin-top:14px">
        <label class="field">Kolejność<input class="input" name="sort_order" type="number" min="0" max="9999" value="${esc(p.sort_order ?? 0)}" title="Niższa liczba = sprawdzana wcześniej (ważne przy kilku zestawach z tym samym produktem)" /></label>
        <label class="field code-form__wide">Notatka wewnętrzna<input class="input" name="description" value="${esc(p.description || '')}" maxlength="300" /></label>
        <label class="check code-form__wide"><input type="checkbox" name="with_codes" ${p.with_codes ? 'checked' : ''} /> Łączy się z kodami rabatowymi</label>
        ${id ? '' : '<label class="check code-form__wide"><input type="checkbox" name="active" checked /> Aktywna od razu</label>'}
      </div>
      <div class="box box--blue" data-pm-preview></div>
      <div class="actions">
        <button class="btn btn--sm">${id ? 'Zapisz promocję' : 'Utwórz promocję'}</button>
        ${id && !uses.length ? '<button type="button" class="btn btn--danger btn--sm" data-pm-del>Usuń</button>' : ''}
      </div>
      <p class="muted small">Zmiany działają na nowe zamówienia w ciągu minuty. Zamówienia złożone wcześniej zachowują naliczony rabat.</p>
    </form>
    ${id ? `<div class="sec">
      <h3 class="sec__t">Kto skorzystał <span class="muted">(${uses.length})</span></h3>
      ${uses.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Zamówienie</th><th>Data</th><th>Klient</th><th class="r">Rabat</th><th class="r">Kwota</th><th>Status</th></tr></thead>
        <tbody>${uses.map((u) => `<tr data-uo="${u.id}" class="clickrow" tabindex="0">
          <td class="nowrap"><strong>${u.number}</strong>${u.source === 'admin' ? '<span class="wc">panel</span>' : ''}</td>
          <td class="nowrap">${date(u.created_at)}</td>
          <td>${u.name ? `<strong>${esc(u.name)}</strong><br>` : ''}${u.customer_id ? `<button type="button" class="link" data-open-customer="${u.customer_id}" data-stop>${esc(u.email)}</button>` : esc(u.email)}</td>
          <td class="r nowrap">${pln(u.amount)}</td>
          <td class="r nowrap">${pln(u.total)}</td>
          <td><span class="st st--${u.status}">${STATUS[u.status] || esc(u.status)}</span></td>
        </tr>`).join('')}</tbody></table></div>
        <p class="muted small">Statystyki liczą tylko zamówienia opłacone, wysłane i zrealizowane. Na liście są też nieopłacone i anulowane - patrz status.</p>`
      : '<p class="muted">Nikt jeszcze nie skorzystał z tej promocji.</p>'}
    </div>` : ''}`;

  bindLinks(body);
  body.querySelectorAll<HTMLElement>('tr[data-uo]').forEach((tr) => {
    const go = (e: Event) => { if ((e.target as HTMLElement).closest('[data-stop]')) return; openOrder(tr.dataset.uo!); };
    tr.addEventListener('click', go); tr.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') go(e); });
  });
  const form = body.querySelector<HTMLFormElement>('[data-promo-form]')!;
  const money = (x: string) => Math.round(Number(x.replace(/\s/g, '').replace(',', '.')) * 100);

  // Odczyt formularza → dane do API i do podglądu (kwoty w groszach dla podglądu)
  const collect = () => {
    const fd = new FormData(form);
    const out: Record<string, any> = {
      kind, name: String(fd.get('name') || ''), label: String(fd.get('label') || ''),
      starts_at: fd.get('starts_at') ? `${fd.get('starts_at')}T00:00:00` : '', ends_at: fd.get('ends_at') ? `${fd.get('ends_at')}T23:59:59` : '',
      sort_order: Number(fd.get('sort_order') || 0), description: String(fd.get('description') || ''),
      with_codes: fd.get('with_codes') !== null, active: id ? p.active : fd.get('active') !== null,
      code: String(fd.get('code') || '').trim().toUpperCase(),
    };
    if (kind === 'quantity') {
      out.product_ids = fd.getAll('product_ids').map(String);
      out.combined = fd.get('combined') !== null;
      out.tiers = [...form.querySelectorAll<HTMLElement>('[data-tier]')].map((r) => ({
        min: (r.querySelector('[data-t-min]') as HTMLInputElement).value,
        type: (r.querySelector('[data-t-type]') as HTMLSelectElement).value,
        value: (r.querySelector('[data-t-value]') as HTMLInputElement).value,
      }));
    } else {
      out.items = [...form.querySelectorAll<HTMLElement>('[data-item]')].map((r) => ({
        product_id: (r.querySelector('[data-i-prod]') as HTMLSelectElement).value,
        qty: Number((r.querySelector('[data-i-qty]') as HTMLInputElement).value) || 1,
      })).filter((i) => i.product_id);
      out.type = String(fd.get('type')); out.value = String(fd.get('value') || ''); out.max_sets = String(fd.get('max_sets') || '');
    }
    return out;
  };
  // Podgląd: przykładowy koszyk policzony tym samym silnikiem co sklep
  const preview = () => {
    const c = collect();
    const box = form.querySelector<HTMLElement>('[data-pm-preview]')!;
    const price = (pid: string) => promoProducts.find((x) => x.id === pid)?.price ?? 0;
    const promo = normalizePromotion({
      id: 'podglad', name: c.name || 'Promocja', kind, active: true, product_ids: c.product_ids, combined: c.combined,
      tiers: (c.tiers || []).map((t: any) => ({ min: Number(t.min), type: t.type, value: t.type === 'amount' ? money(String(t.value)) : Number(String(t.value).replace(',', '.')) })),
      items: c.items, type: c.type, value: c.type === 'amount' ? money(String(c.value || '')) : Number(String(c.value || '').replace(',', '.')), max_sets: c.max_sets || null, with_codes: true,
    });
    promo.code = null; // podgląd zawsze bez kodu
    let lines: { product_id: string; qty: number; unit_price: number }[][] = [];
    if (kind === 'quantity') {
      const pid = promo.product_ids.find((x) => price(x) > 0);
      if (pid) lines = promo.tiers.filter((t) => t.min >= 2 && t.value > 0).map((t) => [{ product_id: pid, qty: t.min, unit_price: price(pid) }]);
    } else if (promo.items.length >= 2 && promo.items.every((i) => price(i.product_id) > 0)) {
      lines = [promo.items.map((i) => ({ product_id: i.product_id, qty: i.qty, unit_price: price(i.product_id) }))];
    }
    if (!lines.length) { box.innerHTML = '<span class="muted">Podgląd pojawi się po wybraniu produktów z ceną i ustawieniu rabatu.</span>'; return; }
    box.innerHTML = '<strong>Przykład (ceny regularne, bez innych promocji)</strong>' + lines.map((l) => {
      const gross = l.reduce((a, x) => a + x.unit_price * x.qty, 0);
      const disc = applyPromotions(l, [promo]).total;
      return `<span>${l.map((x) => `${esc(pName(x.product_id))} × ${x.qty}`).join(' + ')}: ${pln(gross)} → <strong>${pln(gross - disc)}</strong>${disc ? ` <span class="muted">(−${pln(disc)})</span>` : ''}</span>`;
    }).join('');
  };
  form.addEventListener('input', preview);
  form.addEventListener('change', preview);
  form.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const del = t.closest('[data-row-del]');
    if (del) { del.closest('.pm-row')!.remove(); preview(); return; }
    if (t.closest('[data-add-tier]')) { form.querySelector('[data-tiers]')!.insertAdjacentHTML('beforeend', tierRow()); return; }
    if (t.closest('[data-add-item]')) { form.querySelector('[data-items]')!.insertAdjacentHTML('beforeend', itemRow()); return; }
  });
  preview();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('/api/admin/promocje', { action: id ? 'update' : 'create', ...(id ? { id } : {}), ...collect() });
      toast(id ? 'Zapisano promocję.' : 'Promocja utworzona.');
      loadPromos();
      openPromo(id || r.row.id, false);
    } catch (err) { toast((err as Error).message, true); }
  });
  form.querySelector('[data-pm-del]')?.addEventListener('click', async () => {
    if (!confirm('Usunąć promocję? Tej operacji nie można cofnąć.')) return;
    try { await api('/api/admin/promocje', { action: 'delete', id }); toast('Usunięto promocję.'); loadPromos(); openDrawer(false); }
    catch (err) { toast((err as Error).message, true); }
  });
}
