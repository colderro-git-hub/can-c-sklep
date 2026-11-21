// Panel admina - moduł „errors”: dziennik błędów systemu (Ustawienia sklepu → Błędy systemu)
import { $, api, date, esc, toast } from './core';

export async function loadErrors() {
  const list = $('[data-err-list]');
  try {
    const d = await api('/api/admin/bledy');
    $('[data-err-count]').textContent = d.open ? String(d.open) : '';
    $('[data-err-info]').textContent = d.alertTo
      ? `Błędy krytyczne (płatności, zamówienia, maile do klientów, Furgonetka, poczta, automaty, awarie stron) idą też e-mailem na ${d.alertTo} - ten sam błąd najwyżej raz na 6 godzin. Adres zmienisz sekretem ALERT_EMAIL w Workerze. Przejrzane błędy znikają same po 30 dniach, wszystkie po 90.`
      : 'Brak adresu na alerty: ustaw w Workerze sekret ALERT_EMAIL (albo MAIL_NOTIFY). Do tego czasu błędy są tylko na tej liście.';
    list.innerHTML = d.rows.length ? d.rows.map((r: any) => `<tr${r.resolved_at ? ' class="muted"' : ''}>
        <td class="nowrap">${date(r.last_seen)}</td>
        <td>${r.critical ? '<span class="st st--cancelled">krytyczny</span> ' : ''}${esc(r.area)}</td>
        <td style="max-width:520px;word-break:break-word">${esc(r.message)}${r.notified_at ? `<br><span class="muted small">alert e-mail: ${date(r.notified_at)}</span>` : ''}</td>
        <td class="r">${r.count}</td>
        <td>${r.resolved_at ? '<span class="muted small">przejrzane</span>' : `<button type="button" class="link" data-err-ok="${r.id}">Przejrzane</button>`}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="empty">Brak błędów. Tak trzymać.</td></tr>';
    list.querySelectorAll<HTMLButtonElement>('[data-err-ok]').forEach((b) => b.addEventListener('click', async () => {
      try { await api('/api/admin/bledy', { action: 'resolve', id: b.dataset.errOk }); loadErrors(); } catch (e) { toast((e as Error).message, true); }
    }));
  } catch (e) { list.innerHTML = `<tr><td colspan="5" class="empty err">${esc((e as Error).message)}</td></tr>`; }
}

$('[data-err-all]').addEventListener('click', async () => {
  try { await api('/api/admin/bledy', { action: 'resolve_all' }); toast('Oznaczono jako przejrzane.'); loadErrors(); } catch (e) { toast((e as Error).message, true); }
});
document.querySelector('[data-tab="settings"]')?.addEventListener('click', () => loadErrors());

// ifirma: ręczna synchronizacja (brakujące zamówienia i zmiany statusu), po 40 na raz
$('[data-ifirma-sync]').addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  const out = $('[data-ifirma-result]');
  btn.disabled = true; out.textContent = 'Wysyłanie…';
  try {
    let total = 0, failed = 0, firstError: string | null = null;
    for (let i = 0; i < 25; i++) {
      const r = await api('/api/admin/order', { action: 'ifirma_sync', days: Number(($('[data-ifirma-days]') as HTMLInputElement).value) || 60 });
      if (r.skipped) { out.textContent = r.skipped; break; }
      total += r.sent; failed += r.failed; firstError ??= r.firstError;
      out.textContent = `Wysłano: ${total}${failed ? ` · błędy: ${failed}` : ''}${r.left ? ` · zostało: ${r.left}…` : ''}`;
      if (!r.left || (!r.sent && r.failed)) break;
      await new Promise((res) => setTimeout(res, 30000)); // limit ifirma: 100 zapytań na minutę
    }
    if (firstError) out.textContent += ` · pierwszy błąd: ${firstError}`;
    toast(failed ? 'Synchronizacja zakończona z błędami.' : 'Synchronizacja zakończona.', failed > 0);
  } catch (err) { out.textContent = (err as Error).message; }
  finally { btn.disabled = false; }
});

// Czyszczenie dziennika (automatycznie: przejrzane po 30 dniach, wszystkie po 90 dniach)
$('[data-err-clean]').addEventListener('click', async () => {
  try { await api('/api/admin/bledy', { action: 'delete_resolved' }); toast('Usunięto przejrzane błędy.'); loadErrors(); } catch (e) { toast((e as Error).message, true); }
});
$('[data-err-wipe]').addEventListener('click', async () => {
  if (!confirm('Usunąć cały dziennik błędów?')) return;
  try { await api('/api/admin/bledy', { action: 'delete_all' }); toast('Dziennik wyczyszczony.'); loadErrors(); } catch (e) { toast((e as Error).message, true); }
});
