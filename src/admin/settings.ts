// Panel admina - moduł „settings” (wydzielony z admin/index.astro).
import { $, api, toast } from './core';
import { drawSig, setSigSite, sigSite } from './mail';

// ---------- Ustawienia sklepu ----------
export const settingsForm = $<HTMLFormElement>('[data-settings-form]');
export async function loadSettings() {
  try {
    const { site } = await api('/api/admin/ustawienia');
    const gtmInput = document.querySelector<HTMLInputElement>('[data-s-gtmId]');
    if (gtmInput) gtmInput.value = String((site as any).gtmId ?? '');
    const local = (iso: string) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
    for (const [k, v] of Object.entries(site)) {
      const el = settingsForm.elements.namedItem(k) as HTMLInputElement | null;
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = v === 'true';
      else if (el.type === 'datetime-local') el.value = local(String(v || ''));
      else el.value = String(v ?? '');
    }
    fillLogo('header', String((site as any).logoHeader || ''));
    fillLogo('footer', String((site as any).logoFooter || ''));
    fillLogo('favicon-light', String((site as any).faviconLight || ''));
    fillLogo('favicon-dark', String((site as any).faviconDark || ''));
    fillLogo('favicon-apple', String((site as any).faviconApple || ''));
    fillLogo('mail-logo', String((site as any).mailLogo || ''));
    setSigSite(site as any);
    const sf = $<HTMLFormElement>('[data-sig-form]');
    (sf.elements.namedItem('text') as HTMLTextAreaElement).value = String((site as any).mailSignature || '');
    (sf.elements.namedItem('logo') as HTMLInputElement).checked = (site as any).mailSignatureLogo === 'true';
    drawSig();
    const st = $('[data-notice-state]');
    st.textContent = site.noticeActive ? 'Widoczny teraz' : 'Niewidoczny';
    st.className = `st ${site.noticeActive ? 'st--on_hold' : 'st--pending_payment'}`;
  } catch (e) { toast((e as Error).message, true); }
}
// Logo sklepu (menu górne i stopka)
export function fillLogo(target: string, url: string) {
  const slot = document.querySelector<HTMLElement>(`[data-logo-slot="${target}"]`);
  if (!slot) return;
  const img = slot.querySelector<HTMLImageElement>('[data-logo-img]')!;
  img.hidden = !url; if (url) img.src = url; else img.removeAttribute('src');
  slot.querySelector<HTMLElement>('[data-logo-empty]')!.hidden = !!url;
  slot.querySelector<HTMLElement>('[data-logo-remove]')!.hidden = !url;
}
export const LOGO_LABEL: Record<string, string> = {
  header: 'logo (menu górne)', footer: 'logo (stopka)',
  'favicon-light': 'favicon (jasny motyw)', 'favicon-dark': 'favicon (ciemny motyw)', 'favicon-apple': 'ikonę Apple', 'mail-logo': 'logo do maili',
};
document.querySelectorAll<HTMLElement>('[data-logo-slot]').forEach((slot) => {
  const target = slot.dataset.logoSlot!;
  const input = slot.querySelector<HTMLInputElement>('[data-logo-file]')!;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      toast(`Wysyłanie ${file.name}…`);
      const fd = new FormData(); fd.append('file', file); fd.append('product', 'logo');
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Błąd wysyłania pliku.');
      await api('/api/admin/ustawienia', { action: 'logo', target, url: d.url });
      fillLogo(target, d.url);
      if (target === 'mail-logo') { sigSite.mailLogo = d.url; drawSig(); }
      toast(`Zapisano ${LOGO_LABEL[target] ?? 'logo'}.`);
    } catch (err) { toast((err as Error).message, true); }
  });
  slot.querySelector<HTMLButtonElement>('[data-logo-remove]')!.addEventListener('click', async () => {
    const isFav = target.startsWith('favicon');
    if (!confirm(isFav ? `Usunąć ${LOGO_LABEL[target]}?` : 'Usunąć logo? Na stronie wróci logo tekstowe „Can-C”.')) return;
    try { await api('/api/admin/ustawienia', { action: 'logo', target, url: '' }); fillLogo(target, ''); if (target === 'mail-logo') { sigSite.mailLogo = ''; drawSig(); } toast(`Usunięto ${LOGO_LABEL[target] ?? 'logo'}.`); }
    catch (err) { toast((err as Error).message, true); }
  });
});

// robots.txt
export const robotsForm = $<HTMLFormElement>('[data-robots-form]');
export const robotsText = $<HTMLTextAreaElement>('[data-robots-text]');
export let robotsDefault = '';
export const robotsWarn = () => {
  // Ostrzeżenie: „Disallow: /” (cała strona) w grupie dla wszystkich robotów
  const lines = robotsText.value.split('\n').map((l) => l.replace(/#.*/, '').trim().toLowerCase());
  let all = false, blocked = false;
  for (const l of lines) {
    if (l.startsWith('user-agent:')) all = l.replace('user-agent:', '').trim() === '*';
    else if (all && /^disallow:\s*\/\s*$/.test(l)) blocked = true;
  }
  $('[data-robots-warn]').hidden = !blocked;
};
export const fillRobots = (r: any) => {
  robotsDefault = r.default; robotsText.value = r.text; robotsText.placeholder = r.default;
  $('[data-robots-preview]').textContent = r.preview; robotsWarn();
};
robotsText.addEventListener('input', robotsWarn);
$('[data-robots-default]').addEventListener('click', () => { robotsText.value = robotsDefault; robotsWarn(); });
robotsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try { const r = await api('/api/admin/ustawienia', { action: 'robots', text: robotsText.value }); fillRobots(r.robots); toast('Zapisano robots.txt. Google pobierze go przy najbliższej wizycie.'); }
  catch (err) { toast((err as Error).message, true); }
});

// GTM ID: walidacja i zapis
export const gtmInput = document.querySelector<HTMLInputElement>('[data-s-gtmId]');
gtmInput?.addEventListener('input', function() {
  const v = this.value.trim().toUpperCase();
  this.setCustomValidity(v && !/^GTM-[A-Z0-9]{4,10}$/.test(v) ? 'Format: GTM-XXXXXXX' : '');
  this.value = v;
});
gtmInput?.closest('form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!gtmInput.checkValidity()) { gtmInput.reportValidity(); return; }
  try {
    await api('/api/admin/ustawienia', { action: 'gtm', gtmId: gtmInput.value.trim() });
    toast(gtmInput.value ? 'GTM podłączony. Sprawdź na stronie po pushu.' : 'GTM odłączony.');
    loadSettings();
  } catch (err) { toast((err as Error).message, true); }
});

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(settingsForm);
  const body: Record<string, unknown> = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
  body.noticeEnabled = fd.get('noticeEnabled') !== null;
  for (const k of ['noticeFrom', 'noticeTo']) if (body[k]) body[k] = new Date(String(body[k])).toISOString();
  try { await api('/api/admin/ustawienia', body); toast('Zapisano ustawienia.'); loadSettings(); }
  catch (err) { toast((err as Error).message, true); }
});
