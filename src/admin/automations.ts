// Panel admina - moduł „automations” (wydzielony z admin/index.astro).
import { $, api, date, esc, toast } from './core';
import { dnum } from './customers';
import { bindLinks } from './navigation';
import { pct } from './analytics';

// ---------- Automaty ----------
export const autoForm = $<HTMLFormElement>('[data-auto-form]');
export async function loadAutomations() {
  try {
    const d = await api('/api/admin/automaty');
    // Prośba o opinię
    if (d.reviews) {
      const rf = $<HTMLFormElement>('[data-rr-form]');
      for (const [k, v] of Object.entries(d.reviews.settings)) { const el = rf.elements.namedItem(k) as HTMLInputElement | null; if (!el) continue; if (el.type === 'checkbox') el.checked = Boolean(v); else el.value = String(v); }
      const rst = $('[data-rr-state]');
      rst.textContent = d.reviews.settings.enabled ? 'Włączony' : 'Wyłączony';
      rst.className = `st ${d.reviews.settings.enabled ? 'st--shipped' : 'st--pending_payment'}`;
      $('[data-rr-k="total"]').textContent = String(d.reviews.total);
      $('[data-rr-k="verified"]').textContent = String(d.reviews.stats.verifiedReviews);
      $('[data-rr-k="pending"]').textContent = String(d.reviews.stats.pending);
      $('[data-rr-list]').innerHTML = d.reviews.candidates.length ? d.reviews.candidates.map((c: any) => `<tr><td><strong>${c.number}</strong></td><td>${esc(c.email)}</td><td class="nowrap">${dnum(c.shipped_at)}</td><td>${c.items.map(esc).join(', ')}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">Nikt nie spełnia dziś warunków.</td></tr>';
      $('[data-rr-hist]').innerHTML = d.reviews.history.length ? d.reviews.history.map((h: any) => `<tr><td class="nowrap">${date(h.sent_at)}</td><td>${esc([h.customers?.first_name, h.customers?.last_name].filter(Boolean).join(' ') || '')} <span class="muted">${esc(h.customers?.email || '')}</span></td></tr>`).join('') : '<tr><td colspan="2" class="empty">Jeszcze nic nie wysłano.</td></tr>';
    }
    for (const [k, v] of Object.entries(d.settings)) { const el = autoForm.elements.namedItem(k) as HTMLInputElement | null; if (!el) continue; if (el.type === 'checkbox') el.checked = Boolean(v); else el.value = String(v); }
    const st = $('[data-auto-state]');
    st.textContent = d.settings.enabled ? 'Włączony' : 'Wyłączony';
    st.className = `st ${d.settings.enabled ? 'st--shipped' : 'st--pending_payment'}`;
    const warn = $('[data-auto-warn]');
    warn.hidden = d.cronReady;
    warn.textContent = 'Brak sekretu CRON_SECRET w Workerze - automat i linki „wypisz się” nie zadziałają. Instrukcja w opisie wdrożenia.';
    $('[data-auto-count]').textContent = `(${d.total})`;
    const pct = d.settings.regularCodePercent;
    $('[data-auto-list]').innerHTML = d.candidates.length ? d.candidates.map((c: any) => `<tr><td><button type="button" class="link" data-open-customer="${c.id}">${esc(c.first_name || '-')}</button></td><td>${esc(c.email)}</td><td class="r">${c.orders_count}</td><td class="r">${c.last_order_packs}</td><td>${dnum(c.treatment_end_at)}</td><td>${pct && c.orders_count >= 2 ? `−${pct}%` : '-'}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">Dziś nikt nie spełnia warunków.</td></tr>';
    $('[data-auto-hist]').innerHTML = d.history.length ? d.history.map((h: any) => `<tr><td>${date(h.sent_at)}</td><td>${esc([h.customers?.first_name, h.customers?.last_name].filter(Boolean).join(' ') || h.customers?.email || '')}</td><td>${esc(h.code || '-')}</td></tr>`).join('') : '<tr><td colspan="3" class="empty">Jeszcze nic nie wysłano.</td></tr>';
    bindLinks($('[data-auto-list]').closest('table') as HTMLElement);
  } catch (e) { toast((e as Error).message, true); }
}
autoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(autoForm);
  const p: Record<string, unknown> = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  p.enabled = fd.get('enabled') !== null;
  try { await api('/api/admin/automaty', { action: 'save', ...p }); toast('Zapisano.'); loadAutomations(); } catch (err) { toast((err as Error).message, true); }
});
$('[data-auto-run]').addEventListener('click', async () => {
  if (!confirm('Wysłać przypomnienia teraz do osób z listy?')) return;
  try { const r = await api('/api/admin/automaty', { action: 'run' }); toast(`Wysłano ${r.sent} z ${r.candidates}${r.errors ? ` (błędy: ${r.errors})` : ''}.`, Boolean(r.errors)); loadAutomations(); }
  catch (err) { toast((err as Error).message, true); }
});
