// Panel admina - moduł „redirects” (wydzielony z admin/index.astro).
import { $, api, esc, toast } from './core';

// ---------- Przekierowania i dziennik 404 ----------
export let rdData: { redirects: any[]; notFound: any[]; ignoredCount: number; targets: { path: string; label: string }[]; migration?: string } | null = null;
export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-');
export async function loadRedirects() {
  try { rdData = await api('/api/admin/redirects'); } catch (e) { toast((e as Error).message, true); return; }
  const mig = $<HTMLElement>('[data-rd-migration]');
  mig.hidden = !rdData!.migration; mig.textContent = rdData!.migration || '';
  $('#rd-targets').innerHTML = rdData!.targets.map((t) => `<option value="${esc(t.path)}">${esc(t.label)}</option>`).join('');
  renderRedirects(); renderNotFound();
}
export function renderRedirects() {
  const q = $<HTMLInputElement>('[data-rd-q]').value.trim().toLowerCase();
  const rows = rdData!.redirects.filter((r) => !q || r.from_path.toLowerCase().includes(q) || r.to_url.toLowerCase().includes(q));
  $('[data-rd-count]').textContent = `(${rdData!.redirects.length})`;
  $('[data-rd-list]').innerHTML = rows.length ? rows.map((r) => `<tr>
    <td class="mono rd-path">${esc(r.from_path)}${r.note ? `<div class="muted small">${esc(r.note)}</div>` : ''}</td>
    <td class="mono rd-path"><a href="${esc(r.to_url)}" target="_blank" rel="noopener">${esc(r.to_url)}</a></td>
    <td>${r.code}</td><td class="r">${r.hits}</td><td class="nowrap">${fmtDate(r.last_hit_at)}</td>
    <td class="nowrap r"><button type="button" class="btn btn--outline btn--sm" data-rd-edit="${esc(r.id)}">Edytuj</button> <button type="button" class="btn btn--outline btn--sm" data-rd-del="${esc(r.id)}">Usuń</button></td></tr>`).join('')
    : `<tr><td colspan="6" class="muted">${q ? 'Brak wyników.' : 'Brak przekierowań. Dodaj pierwsze albo zaimportuj listę.'}</td></tr>`;
}
export function renderNotFound() {
  const rows = rdData!.notFound;
  $('[data-nf-count]').textContent = `(${rows.length})`;
  $('[data-nf-ignored]').textContent = rdData!.ignoredCount ? `Zignorowane: ${rdData!.ignoredCount}.` : '';
  $('[data-nf-list]').innerHTML = rows.length ? rows.map((r) => `<tr>
    <td class="mono rd-path">${esc(r.path)}</td><td class="r">${r.hits}</td><td class="nowrap">${fmtDate(r.last_seen)}</td>
    <td class="rd-path small muted">${r.referrer ? esc(r.referrer) : '-'}</td>
    <td class="nowrap r"><button type="button" class="btn btn--sm" data-nf-go="${esc(r.path)}">Przekieruj</button> <button type="button" class="btn btn--outline btn--sm" data-nf-ignore="${esc(r.path)}">Ignoruj</button></td></tr>`).join('')
    : '<tr><td colspan="5" class="muted">Brak błędów 404.</td></tr>';
}
export const rdForm = $<HTMLFormElement>('[data-rd-form]');
export const rdSet = (n: string, v: string) => { (rdForm.elements.namedItem(n) as HTMLInputElement).value = v; };
export const rdReset = () => { rdForm.reset(); rdSet('id', ''); $('[data-rd-form-title]').textContent = 'Dodaj przekierowanie'; $<HTMLElement>('[data-rd-cancel]').hidden = true; };
$('[data-rd-cancel]').addEventListener('click', rdReset);
$('[data-rd-q]').addEventListener('input', () => rdData && renderRedirects());
rdForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(rdForm);
  try {
    const r = await api('/api/admin/redirects', { action: 'save', id: fd.get('id') || undefined, from: fd.get('from'), to: fd.get('to'), code: Number(fd.get('code')), note: fd.get('note') });
    toast(r.note ? `Zapisano. ${r.note}` : 'Zapisano przekierowanie.'); rdReset(); await loadRedirects();
  } catch (err) { toast((err as Error).message, true); }
});
$('[data-rd-list]').addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  const edit = t.closest<HTMLElement>('[data-rd-edit]'), del = t.closest<HTMLElement>('[data-rd-del]');
  if (edit) {
    const r = rdData!.redirects.find((x) => x.id === edit.dataset.rdEdit)!;
    rdSet('id', r.id); rdSet('from', r.from_path); rdSet('to', r.to_url); rdSet('code', String(r.code)); rdSet('note', r.note || '');
    $('[data-rd-form-title]').textContent = 'Edytuj przekierowanie'; $<HTMLElement>('[data-rd-cancel]').hidden = false;
    rdForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (del) {
    const r = rdData!.redirects.find((x) => x.id === del.dataset.rdDel)!;
    if (!confirm(`Usunąć przekierowanie ${r.from_path} → ${r.to_url}?`)) return;
    try { await api('/api/admin/redirects', { action: 'delete', id: r.id }); toast('Usunięto.'); await loadRedirects(); } catch (err) { toast((err as Error).message, true); }
  }
});
$('[data-nf-list]').addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  const go = t.closest<HTMLElement>('[data-nf-go]'), ign = t.closest<HTMLElement>('[data-nf-ignore]');
  if (go) { rdReset(); rdSet('from', go.dataset.nfGo!); rdForm.scrollIntoView({ behavior: 'smooth', block: 'start' }); (rdForm.elements.namedItem('to') as HTMLInputElement).focus(); }
  if (ign) { try { await api('/api/admin/redirects', { action: 'ignore', path: ign.dataset.nfIgnore }); await loadRedirects(); } catch (err) { toast((err as Error).message, true); } }
});
$('[data-nf-clear]').addEventListener('click', async () => {
  if (!confirm('Wyczyścić dziennik 404? Zignorowane adresy zostaną.')) return;
  try { await api('/api/admin/redirects', { action: 'clear404' }); toast('Wyczyszczono dziennik.'); await loadRedirects(); } catch (err) { toast((err as Error).message, true); }
});
$<HTMLFormElement>('[data-rd-import]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget as HTMLFormElement;
  const out = $('[data-rd-import-result]');
  try {
    const r = await api('/api/admin/redirects', { action: 'import', text: new FormData(f).get('text') });
    out.innerHTML = `<p class="ok">Dodano lub zaktualizowano: ${r.added}.</p>`
      + (r.errorCount ? `<p class="err">Pominięto ${r.errorCount}:</p><ul>${r.errors.map((x: string) => `<li>${esc(x)}</li>`).join('')}</ul>` : '')
      + (r.notes.length ? `<ul class="muted">${r.notes.map((x: string) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
    if (r.added) { f.reset(); await loadRedirects(); }
  } catch (err) { toast((err as Error).message, true); }
});
$('[data-rd-csv]').addEventListener('click', () => {
  if (!rdData) return;
  const csv = ['stary_adres,nowy_adres,typ,trafienia', ...rdData.redirects.map((r) => [r.from_path, r.to_url, r.code, r.hits].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'przekierowania.csv'; a.click(); URL.revokeObjectURL(a.href);
});
