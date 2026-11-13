// Panel admina - moduł „automations-reviews” (wydzielony z admin/index.astro).
import { $, api, toast } from './core';
import { loadNewsletter } from './newsletter';
import { loadAutomations } from './automations';

// ---------- Prośba o opinię: zapis i ręczne uruchomienie ----------
$('[data-rr-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target as HTMLFormElement;
  const v = (n: string) => f.elements.namedItem(n) as HTMLInputElement;
  try {
    await api('/api/admin/automaty', { action: 'reviews_save', enabled: v('enabled').checked, daysAfter: Number(v('daysAfter').value), maxPerRun: Number(v('maxPerRun').value), consentOnly: v('consentOnly').checked });
    toast('Zapisano ustawienia prośby o opinię.'); loadAutomations();
  } catch (err) { toast((err as Error).message, true); }
});
$('[data-rr-run]').addEventListener('click', async () => {
  if (!confirm('Wysłać teraz prośby o opinię do osób z listy?')) return;
  try { const r = await api('/api/admin/automaty', { action: 'reviews_run' }); toast(r.skipped || `Wysłano: ${r.sent} z ${r.candidates}${r.errors ? ` · błędy: ${r.errors}` : ''}`, Boolean(r.errors)); loadAutomations(); }
  catch (err) { toast((err as Error).message, true); }
});

// ---------- Automaty: podzakładki ----------
export let autoTab = 'reminders';
document.querySelectorAll<HTMLButtonElement>('[data-auto-tab]').forEach((b) => b.addEventListener('click', () => {
  autoTab = b.dataset.autoTab!;
  document.querySelectorAll('[data-auto-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll<HTMLElement>('[data-auto-pane]').forEach((p) => { p.hidden = p.dataset.autoPane !== autoTab; });
  if (autoTab === 'newsletter') loadNewsletter();
}));
