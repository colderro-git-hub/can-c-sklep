// Panel admina - moduł „reviews” (wydzielony z admin/index.astro).
import { $, api, date, esc, toast } from './core';
import { drawerNav, openDrawer } from './orders';
import { productsList, setProductsList } from './products';
import { dnum } from './customers';
import { bindLinks } from './navigation';

// ---------- Opinie ----------
export let rStatus = 'pending';
export const starsTxt = (n: number) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
export const RST: Record<string, string> = { pending: 'Do moderacji', approved: 'Opublikowana', rejected: 'Odrzucona' };
export async function loadReviews() {
  const tbody = $('[data-reviews]');
  tbody.innerHTML = '<tr><td colspan="7" class="empty">Ładowanie…</td></tr>';
  try {
    const d = await api(`/api/admin/opinie?status=${rStatus}`);
    $('[data-rcount]').textContent = d.pending ? String(d.pending) : '';
    $('[data-count-reviews]').textContent = d.pending ? String(d.pending) : '';
    tbody.innerHTML = d.rows.length ? d.rows.map((r: any) => `
      <tr data-rid="${r.id}" class="clickrow">
        <td class="nowrap">${dnum(r.created_at)}</td>
        <td>${esc(r.products?.name || r.product_id)}</td>
        <td>${esc(r.author_name)}${r.verified_purchase ? '<br><span class="badge-inline badge-inline--ok">zakup</span>' : ''}</td>
        <td class="nowrap stars-cell">${starsTxt(r.rating)}</td>
        <td>${r.title ? `<strong>${esc(r.title)}</strong><br>` : ''}<span class="muted">${esc(r.body.slice(0, 140))}${r.body.length > 140 ? '…' : ''}</span></td>
        <td><span class="st ${r.status === 'approved' ? 'st--shipped' : r.status === 'rejected' ? 'st--cancelled' : 'st--on_hold'}">${RST[r.status]}</span></td>
        <td class="nowrap" data-stop>${r.status !== 'approved' ? `<button type="button" class="btn btn--sm" data-ra="approve" data-id="${r.id}">Publikuj</button>` : ''} ${r.status !== 'rejected' ? `<button type="button" class="btn btn--outline btn--sm" data-ra="reject" data-id="${r.id}">Odrzuć</button>` : ''}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="empty">Brak opinii w tym widoku.</td></tr>';
    tbody.querySelectorAll<HTMLButtonElement>('[data-ra]').forEach((b) => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      try { await api('/api/admin/opinie', { action: b.dataset.ra, id: b.dataset.id }); toast(b.dataset.ra === 'approve' ? 'Opublikowano.' : 'Odrzucono.'); loadReviews(); }
      catch (err) { toast((err as Error).message, true); }
    }));
    tbody.querySelectorAll<HTMLElement>('tr[data-rid]').forEach((tr) => tr.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-stop]')) return;
      const r = d.rows.find((x: any) => x.id === tr.dataset.rid); if (r) openReview(r);
    }));
  } catch (e) { tbody.innerHTML = `<tr><td colspan="7" class="empty err">${esc((e as Error).message)}</td></tr>`; }
}
export function openReview(r: any) {
  openDrawer(true); drawerNav(() => openReview(r), false);
  const locked = r.source === 'shop'; // ocenę i datę zmienia tylko opinia dodana w panelu
  $('[data-d-title]').textContent = `Opinia: ${r.products?.name || r.product_id}`;
  const body = $('[data-d-body]');
  body.innerHTML = `
    <div class="meta"><span class="st ${r.status === 'approved' ? 'st--shipped' : r.status === 'rejected' ? 'st--cancelled' : 'st--on_hold'}">${RST[r.status]}</span><span>${date(r.created_at)}</span>${r.verified_purchase ? '<span class="badge-inline badge-inline--ok">Zweryfikowany zakup</span>' : ''}${r.source === 'import' ? '<span class="wc">dodana w panelu</span>' : ''}</div>
    <p class="stars-cell big">${starsTxt(r.rating)}</p>
    <dl class="kv"><dt>Autor</dt><dd>${esc(r.author_name)}</dd>${r.email ? `<dt>E-mail</dt><dd>${esc(r.email)}</dd>` : ''}${r.customer_id ? `<dt>Klient</dt><dd><button type="button" class="link" data-open-customer="${r.customer_id}">karta klienta</button></dd>` : ''}<dt>Produkt</dt><dd><button type="button" class="link" data-open-product="${esc(r.product_id)}">${esc(r.products?.name || r.product_id)}</button></dd></dl>
    ${r.title ? `<h3 class="sec__t">${esc(r.title)}</h3>` : ''}<p class="note">${esc(r.body)}</p>
    ${r.edited_at ? `<p class="muted small">Edytowana ${date(r.edited_at)}${r.edited_by ? ` przez ${esc(r.edited_by)}` : ''}${r.original_body ? ' · oryginalna treść zachowana' : ''}</p>` : ''}
    <details class="sec manual">
      <summary>Edytuj opinię</summary>
      <form class="sec" data-redit>
        <div class="row2">
          <label class="field">Autor<input class="input" name="author_name" value="${esc(r.author_name)}" maxlength="60" /></label>
          <label class="field">Ocena<select class="input" name="rating" ${locked ? 'disabled' : ''}>${[5, 4, 3, 2, 1].map((n) => `<option value="${n}" ${n === r.rating ? 'selected' : ''}>${'★'.repeat(n)}${'☆'.repeat(5 - n)} (${n})</option>`).join('')}</select></label>
        </div>
        <label class="field">Tytuł<input class="input" name="title" value="${esc(r.title || '')}" maxlength="120" /></label>
        <label class="field">Treść<textarea class="input" name="body" rows="5" maxlength="3000">${esc(r.body)}</textarea></label>
        <div class="row2">
          <label class="field">Data opinii<input class="input" name="created_at" type="date" value="${String(r.created_at).slice(0, 10)}" ${locked ? 'disabled' : ''} /></label>
          <label class="field">Produkt<select class="input" name="product_id" data-redit-products><option value="${esc(r.product_id)}">${esc(r.products?.name || r.product_id)}</option></select></label>
        </div>
        <label class="check"><input type="checkbox" name="verified_purchase" ${r.verified_purchase ? 'checked' : ''} /> Zweryfikowany zakup</label>
        ${r.original_body ? `<details class="manual"><summary>Pokaż oryginalną treść</summary><p class="note">${esc(r.original_body)}</p></details>` : ''}
        <p class="muted small">${locked ? 'Opinia klienta ze sklepu: ocena i data są zablokowane. ' : ''}Poprawiaj tylko literówki i dane (np. imię). Nie zmieniaj sensu ani oceny wystawionej przez klienta - to wprowadzałoby w błąd (Omnibus, zasady Google).</p>
        <div class="actions"><button class="btn btn--sm">Zapisz opinię</button></div>
      </form>
    </details>
    <form class="sec" data-reply><label class="field">Odpowiedź sklepu (publiczna)<textarea class="input" name="reply" rows="3" maxlength="1500">${esc(r.reply || '')}</textarea></label><div class="actions"><button class="btn btn--outline btn--sm">Zapisz odpowiedź</button></div></form>
    <div class="actions">
      ${r.status !== 'approved' ? '<button type="button" class="btn btn--sm" data-act-r="approve">Publikuj</button>' : ''}
      ${r.status !== 'rejected' ? '<button type="button" class="btn btn--outline btn--sm" data-act-r="reject">Odrzuć</button>' : ''}
      <button type="button" class="btn btn--danger btn--sm" data-act-r="delete">Usuń</button>
    </div>
    <p class="muted small">Zgodnie z dyrektywą Omnibus i zasadami Google publikuj opinie rzetelnie - także krytyczne - a odrzucaj tylko spam, treści obraźliwe albo niezwiązane z produktem.</p>`;
  bindLinks(body);
  // Lista produktów do przeniesienia opinii (np. gdy dodano ją do złego produktu)
  api('/api/admin/products').then(({ rows }) => {
    const sel = body.querySelector<HTMLSelectElement>('[data-redit-products]'); if (!sel) return;
    sel.innerHTML = rows.map((p: any) => `<option value="${esc(p.id)}" ${p.id === r.product_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  }).catch(() => {});
  body.querySelector<HTMLFormElement>('[data-redit]')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const p: Record<string, unknown> = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
    p.verified_purchase = fd.get('verified_purchase') !== null;
    try {
      await api('/api/admin/opinie', { action: 'update', id: r.id, ...p });
      toast('Zapisano opinię.');
      Object.assign(r, { ...p, rating: locked ? r.rating : Number(p.rating), created_at: locked ? r.created_at : (p.created_at || r.created_at), edited_at: new Date().toISOString(), original_body: r.original_body || (p.body !== r.body ? r.body : null) });
      openReview(r); loadReviews();
    } catch (err) { toast((err as Error).message, true); }
  });
  body.querySelector<HTMLFormElement>('[data-reply]')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/api/admin/opinie', { action: 'reply', id: r.id, reply: new FormData(e.target as HTMLFormElement).get('reply') }); toast('Zapisano odpowiedź.'); loadReviews(); }
    catch (err) { toast((err as Error).message, true); }
  });
  body.querySelectorAll<HTMLButtonElement>('[data-act-r]').forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.actR === 'delete' && !confirm('Usunąć opinię na stałe?')) return;
    try { await api('/api/admin/opinie', { action: b.dataset.actR, id: r.id }); toast('Zapisano.'); openDrawer(false); loadReviews(); }
    catch (err) { toast((err as Error).message, true); }
  }));
}
export async function newReview() {
  openDrawer(true); drawerNav(newReview, false);
  $('[data-d-title]').textContent = 'Dodaj opinię';
  if (!productsList.length) { try { setProductsList((await api('/api/admin/products')).rows); } catch { /* */ } }
  const body = $('[data-d-body]');
  body.innerHTML = `<form class="sec" data-nr>
    <p class="muted">Np. przeniesienie prawdziwych opinii z poprzedniego sklepu albo opinia przekazana mailowo. Publikuje się od razu.</p>
    <label class="field">Produkt<select class="input" name="product_id">${productsList.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>
    <div class="row2"><label class="field">Autor<input class="input" name="author_name" required /></label><label class="field">Ocena<select class="input" name="rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${starsTxt(n)} (${n})</option>`).join('')}</select></label></div>
    <label class="field">Data opinii<input class="input" name="created_at" type="date" /></label>
    <label class="field">Tytuł<input class="input" name="title" /></label>
    <label class="field">Treść<textarea class="input" name="body" rows="4" required></textarea></label>
    <label class="check"><input type="checkbox" name="verified_purchase" /> Zweryfikowany zakup (autor kupił produkt)</label>
    <div class="actions"><button class="btn btn--sm">Dodaj opinię</button></div></form>`;
  body.querySelector<HTMLFormElement>('[data-nr]')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    try {
      await api('/api/admin/opinie', { action: 'create', product_id: fd.get('product_id'), author_name: fd.get('author_name'), rating: Number(fd.get('rating')), created_at: fd.get('created_at'), title: fd.get('title'), body: fd.get('body'), verified_purchase: fd.get('verified_purchase') !== null });
      toast('Dodano opinię.'); openDrawer(false); rStatus = 'approved'; document.querySelectorAll<HTMLElement>('[data-rstatus]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.rstatus === 'approved'))); loadReviews();
    } catch (err) { toast((err as Error).message, true); }
  });
}
document.querySelectorAll<HTMLButtonElement>('[data-rstatus]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-rstatus]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
  b.setAttribute('aria-pressed', 'true'); rStatus = b.dataset.rstatus || ''; loadReviews();
}));
$('[data-new-review]').addEventListener('click', newReview);
