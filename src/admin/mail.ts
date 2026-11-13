// Panel admina - moduł „mail” (wydzielony z admin/index.astro).
import { $, STATUS, api, date, esc, pln, toast } from './core';
import { act, openOrder } from './orders';
import { bindLinks } from './navigation';

// ---------- Podpis w korespondencji (podgląd jak w mailu) ----------
export let sigSite: Record<string, string> = {};
// Zmiana z innych modułów (importy są tylko do odczytu)
export function setSigSite(v: typeof sigSite) { sigSite = v; }
export function drawSig() {
  const f = $<HTMLFormElement>('[data-sig-form]');
  const text = (f.elements.namedItem('text') as HTMLTextAreaElement).value;
  const withLogo = (f.elements.namedItem('logo') as HTMLInputElement).checked;
  const logo = [sigSite.mailLogo, sigSite.logoHeader].find((u) => u && /\.(png|jpe?g|gif)$/i.test(u)) || '';
  const lines = text.replace(/\{email\}/g, sigSite.email || '').replace(/\{company\}/g, sigSite.company || '').split('\n').map((l) => esc(l)
    .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:600;color:#141C2B">$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="#" style="color:#107571;text-decoration:none">$1</a>'));
  $('[data-sig-prev]').innerHTML = `<p style="margin:0 0 12px">Dzień dobry,</p><p style="margin:0">dziękujemy za wiadomość…</p>
    <table style="margin-top:20px;border-collapse:collapse"><tr>${withLogo && logo ? `<td style="padding:2px 14px 0 0;vertical-align:top"><img src="${esc(logo)}" alt="" style="height:28px;width:auto;display:block"></td>` : ''}
    <td style="font-size:13px;line-height:1.55;color:#545D6E;vertical-align:top;${withLogo && logo ? 'padding-left:14px;border-left:1px solid #DCE2EC' : ''}">${lines.join('<br>')}</td></tr></table>
    ${withLogo && !logo ? '<p class="muted small" style="margin-top:10px">Logo nie pojawi się - wgraj poniżej „Logo do maili” (PNG/JPG).</p>' : ''}`;
}
$('[data-sig-form]').addEventListener('input', drawSig);
$('[data-sig-form]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target as HTMLFormElement;
  try {
    await api('/api/admin/ustawienia', { action: 'signature', text: (f.elements.namedItem('text') as HTMLTextAreaElement).value, logo: (f.elements.namedItem('logo') as HTMLInputElement).checked });
    toast('Zapisano podpis.');
  } catch (err) { toast((err as Error).message, true); }
});

// ---------- Korespondencja ----------
export const mb = { folder: 'inbox', q: '', page: 1, current: '' as string };
export const mbDate = (iso: string) => {
  const d = new Date(iso), now = new Date();
  return d.toDateString() === now.toDateString() ? d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
};
export const fmtSize = (n: number | null) => (!n ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} kB`);
export function setMailBadge(n: number) { const el = $('[data-count-mail]'); el.textContent = n ? String(n) : ''; }

export async function loadMail(keepThread = true) {
  const list = $('[data-mb-list]');
  try {
    const p = new URLSearchParams({ folder: mb.folder, page: String(mb.page), ...(mb.q ? { q: mb.q } : {}) });
    const d = await api(`/api/admin/poczta?${p}`);
    $('[data-mb-warn]').hidden = !d.fromWarning;
    for (const [k, v] of Object.entries(d.counts as Record<string, number>)) { const el = document.querySelector(`[data-mb-count="${k}"]`); if (el) el.textContent = v ? String(v) : ''; }
    setMailBadge(d.counts.inbox || 0);
    list.innerHTML = (d.threads.length ? d.threads.map((t: any) => `<button type="button" class="mb__item${t.unread ? ' is-unread' : ''}" data-mb-id="${t.id}" aria-current="${t.id === mb.current}">
        <span class="mb__who">${esc(t.contact_name || t.contact_email)}</span><span class="mb__date">${mbDate(t.last_message_at)}</span>
        <span class="mb__subj">${esc(t.subject)}</span>
        <span class="mb__snip">${esc(t.snippet || '')}</span>
        <span class="mb__tags">${t.message_count > 1 ? `<span class="mb__tag">${t.message_count}</span>` : ''}${t.last_direction === 'out' ? '<span class="mb__tag mb__tag--out">odpowiedziano</span>' : ''}${t.order_number ? `<span class="mb__tag">zam. ${t.order_number}</span>` : ''}${t.customer_id ? '<span class="mb__tag">klient</span>' : ''}</span>
      </button>`).join('') : `<p class="muted" style="padding:20px">${mb.q ? 'Nic nie znaleziono.' : 'Brak wiadomości w tym folderze.'}</p>`)
      + (d.pages > 1 ? `<div class="mb__pager"><button type="button" class="btn btn--outline btn--sm" data-mb-page="-1" ${d.page <= 1 ? 'disabled' : ''}>←</button><span>${d.page} / ${d.pages}</span><button type="button" class="btn btn--outline btn--sm" data-mb-page="1" ${d.page >= d.pages ? 'disabled' : ''}>→</button></div>` : '');
    if (!keepThread) mb.current = '';
  } catch (e) { list.innerHTML = `<p class="err" style="padding:16px">${esc((e as Error).message)}</p>`; }
}
$('[data-mb-list]').addEventListener('click', (e) => {
  const pg = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mb-page]');
  if (pg) { mb.page += Number(pg.dataset.mbPage); loadMail(); return; }
  const it = (e.target as HTMLElement).closest<HTMLElement>('[data-mb-id]');
  if (it) openThread(it.dataset.mbId!);
});
document.querySelectorAll<HTMLButtonElement>('[data-mb-folder]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-mb-folder]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  mb.folder = b.dataset.mbFolder!; mb.page = 1; mb.q = ''; ($('[data-mb-search]') as HTMLFormElement).reset(); loadMail();
}));
$('[data-mb-search]').addEventListener('submit', (e) => { e.preventDefault(); mb.q = String(new FormData(e.target as HTMLFormElement).get('q') || '').trim(); mb.page = 1; loadMail(); });
$('[data-mb-refresh]').addEventListener('click', () => { loadMail(); if (mb.current) openThread(mb.current, false); });

// HTML wiadomości w odizolowanej ramce: bez skryptów, zdalne obrazy dopiero po kliknięciu (śledzenie otwarć)
export function mailFrame(html: string, remote: boolean) {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data: ${remote ? 'https: http:' : location.protocol === 'https:' ? `${new URL(location.href).origin} https://*.supabase.co` : '*'};`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#141C2B;word-break:break-word}img{max-width:100%;height:auto}blockquote{margin:0 0 0 8px;padding-left:10px;border-left:3px solid #DCE2EC;color:#545D6E}</style></head><body>${html}</body></html>`;
}
export const fitFrame = (f: HTMLIFrameElement) => { try { const h = f.contentDocument?.documentElement.scrollHeight; if (h) f.style.height = `${Math.min(h + 8, 4000)}px`; } catch { f.style.height = '420px'; } };

export async function openThread(id: string, markRead = true) {
  mb.current = id;
  const box = $('[data-mb-thread]');
  $('[data-view="mail"]').classList.add('is-reading');
  document.querySelectorAll('[data-mb-id]').forEach((x) => x.setAttribute('aria-current', String((x as HTMLElement).dataset.mbId === id)));
  box.innerHTML = '<p class="muted">Ładowanie…</p>';
  let d: any;
  try { d = await api(`/api/admin/poczta?id=${encodeURIComponent(id)}`); } catch (e) { box.innerHTML = `<p class="err">${esc((e as Error).message)}</p>`; return; }
  const t = d.thread;
  if (markRead && t.unread) { api('/api/admin/poczta', { action: 'read', id }).then(() => loadMail()).catch(() => {}); }
  history.replaceState(null, '', `#korespondencja/${id}`);
  const many = d.messages.length > 3;
  const orderHit = t.order_number ? d.orders.find((o: any) => o.number === t.order_number) : null;
  box.innerHTML = `
    <button type="button" class="link mb__back" data-mb-back>← Wróć do listy</button>
    <div class="mb__head">
      <h2 class="mb__title">${esc(t.subject)}</h2>
      <div class="mb__actions">
        ${t.status === 'open' ? '<button type="button" class="btn btn--outline btn--sm" data-mb-st="closed">Zamknij</button>' : '<button type="button" class="btn btn--outline btn--sm" data-mb-st="open">Otwórz ponownie</button>'}
        ${t.status === 'spam' ? '<button type="button" class="btn btn--outline btn--sm" data-mb-st="open">To nie spam</button>' : '<button type="button" class="btn btn--outline btn--sm" data-mb-st="spam">Spam</button>'}
        ${t.category !== 'customer' ? '<button type="button" class="btn btn--outline btn--sm" data-mb-cat="customer">Do odebranych</button>' : '<button type="button" class="btn btn--outline btn--sm" data-mb-cat="system">Do systemowych</button>'}
        <button type="button" class="btn btn--outline btn--sm" data-mb-unread>Nieprzeczytane</button>
      </div>
    </div>
    <div class="mb__ctx">
      <span><strong>${esc(t.contact_name || '')}</strong> ${esc(t.contact_email)}</span>
      ${d.customer ? `<span>Klient: ${d.customer.orders_count} zam. · ${pln(d.customer.total_spent)} <button type="button" class="link" data-open-customer="${d.customer.id}">karta klienta</button></span>` : '<span class="muted">nie ma konta klienta</span>'}
      ${d.orders.length ? `<span>Zamówienia: ${d.orders.map((o: any) => `<button type="button" class="link" data-mb-order="${o.id}" title="${esc(STATUS[o.status] || o.status)} · ${pln(o.total)}">${o.number}${o.id === orderHit?.id ? ' ★' : ''}</button>`).join(', ')}</span>` : t.order_number ? `<span>W treści: zamówienie ${t.order_number}</span>` : ''}
    </div>
    <div class="mb__msgs">${d.messages.map((m: any, i: number) => {
      const atts = (m.attachments || []).filter((a: any) => !a.inline || !a.cid);
      const authBad = m.auth && (m.auth.dmarc === 'fail' || (m.auth.spf === 'fail' && m.auth.dkim === 'fail'));
      return `<article class="mb__msg${m.direction === 'out' ? ' mb__msg--out' : ''}${many && i < d.messages.length - 2 ? ' is-collapsed' : ''}" data-mb-msg="${i}">
        <div class="mb__mhead" data-mb-toggle><span><strong>${esc(m.direction === 'out' ? `Can-C${m.sent_by ? ` (${m.sent_by})` : ''}` : m.from_name || m.from_email)}</strong>${m.direction === 'in' && m.from_name ? ` <span class="muted">${esc(m.from_email)}</span>` : ''}${m.source === 'form' ? ' <span class="mb__tag">formularz</span>' : ''}${authBad ? ' <span class="mb__tag" style="background:#FDE8E8;color:#B3261E">nadawca niepotwierdzony</span>' : ''}</span><span class="muted">${date(m.sent_at)}</span></div>
        <div class="mb__body">${m.html_body ? `<iframe class="mb__frame" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" data-mb-frame="${i}" title="Treść wiadomości"></iframe>${/<img[^>]+src=["']?https?:/i.test(m.html_body) ? `<button type="button" class="link small" data-mb-imgs="${i}">Pokaż obrazy z internetu</button>` : ''}` : `<pre class="mb__text">${esc(m.text_body || '')}</pre>`}</div>
        ${atts.length ? `<div class="mb__atts">${atts.map((a: any) => `<a class="mb__att" href="/api/admin/poczta?att=${m.id}&i=${m.attachments.indexOf(a)}" target="_blank" rel="noopener">📎 ${esc(a.name)} <span class="muted">${fmtSize(a.size)}</span></a>`).join('')}</div>` : ''}
      </article>`;
    }).join('')}</div>
    ${t.status === 'spam' ? '' : `<form class="mb__reply" data-mb-reply>
      <label class="field">Odpowiedź do ${esc(t.contact_email)}<textarea class="input" name="text" required>Dzień dobry,

</textarea></label>
      <div class="mb__sig"><span class="muted small">Podpis (Ustawienia sklepu → Podpis w korespondencji):</span>${d.signature || ''}</div>
      <div class="mb__files" data-mb-files></div>
      <div class="actions" style="justify-content:space-between">
        <span class="actions"><label class="btn btn--outline btn--sm">Załącz pliki<input type="file" multiple hidden data-mb-file /></label>
        <label class="check"><input type="checkbox" name="close" ${t.category === 'customer' ? 'checked' : ''} /> Zamknij wątek po wysłaniu</label></span>
        <button class="btn btn--sm">Wyślij odpowiedź</button>
      </div>
    </form>`}`;

  // Ramki HTML: wstawienie treści i dopasowanie wysokości
  box.querySelectorAll<HTMLIFrameElement>('[data-mb-frame]').forEach((f) => {
    const m = d.messages[Number(f.dataset.mbFrame)];
    f.addEventListener('load', () => fitFrame(f));
    f.srcdoc = mailFrame(m.html_body, false);
  });
  box.querySelectorAll<HTMLButtonElement>('[data-mb-imgs]').forEach((b) => b.addEventListener('click', () => {
    const f = box.querySelector<HTMLIFrameElement>(`[data-mb-frame="${b.dataset.mbImgs}"]`);
    if (f) f.srcdoc = mailFrame(d.messages[Number(b.dataset.mbImgs)].html_body, true);
    b.remove();
  }));
  box.querySelectorAll<HTMLElement>('[data-mb-toggle]').forEach((h) => h.addEventListener('click', () => {
    const a = h.closest('.mb__msg')!; a.classList.toggle('is-collapsed');
    a.querySelectorAll<HTMLIFrameElement>('iframe').forEach(fitFrame);
  }));
  bindLinks(box);
  box.querySelectorAll<HTMLButtonElement>('[data-mb-order]').forEach((b) => b.addEventListener('click', () => openOrder(b.dataset.mbOrder!)));
  box.querySelector('[data-mb-back]')?.addEventListener('click', () => { $('[data-view="mail"]').classList.remove('is-reading'); mb.current = ''; history.replaceState(null, '', '#korespondencja'); loadMail(); });
  const act = async (body: Record<string, unknown>, msg: string) => {
    try { await api('/api/admin/poczta', { id, ...body }); toast(msg); loadMail(); openThread(id, false); } catch (e) { toast((e as Error).message, true); }
  };
  box.querySelectorAll<HTMLButtonElement>('[data-mb-st]').forEach((b) => b.addEventListener('click', () => act({ action: 'status', status: b.dataset.mbSt }, b.dataset.mbSt === 'spam' ? 'Przeniesiono do spamu.' : b.dataset.mbSt === 'closed' ? 'Wątek zamknięty.' : 'Wątek otwarty.')));
  box.querySelectorAll<HTMLButtonElement>('[data-mb-cat]').forEach((b) => b.addEventListener('click', () => act({ action: 'category', category: b.dataset.mbCat }, 'Przeniesiono.')));
  box.querySelector('[data-mb-unread]')?.addEventListener('click', async () => { try { await api('/api/admin/poczta', { action: 'read', id, unread: true }); toast('Oznaczono jako nieprzeczytane.'); loadMail(); } catch (e) { toast((e as Error).message, true); } });

  // Odpowiedź z załącznikami (base64, łącznie do 10 MB)
  const form = box.querySelector<HTMLFormElement>('[data-mb-reply]');
  if (!form) return;
  const files: { name: string; type: string; data: string; size: number }[] = [];
  const drawFiles = () => {
    box.querySelector('[data-mb-files]')!.innerHTML = files.map((f, i) => `<span class="mb__att">📎 ${esc(f.name)} <span class="muted">${fmtSize(f.size)}</span> <button type="button" class="link" data-mb-unfile="${i}" aria-label="Usuń załącznik">×</button></span>`).join('');
  };
  box.querySelector('[data-mb-files]')!.addEventListener('click', (e) => { const x = (e.target as HTMLElement).closest<HTMLElement>('[data-mb-unfile]'); if (x) { files.splice(Number(x.dataset.mbUnfile), 1); drawFiles(); } });
  box.querySelector<HTMLInputElement>('[data-mb-file]')!.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    for (const f of [...(input.files || [])]) {
      if (files.reduce((s, x) => s + x.size, 0) + f.size > 10 * 1024 * 1024) { toast('Załączniki mogą mieć łącznie do 10 MB.', true); break; }
      const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
      files.push({ name: f.name, type: f.type || 'application/octet-stream', data, size: f.size });
    }
    input.value = ''; drawFiles();
  });
  const ta = form.querySelector('textarea')!;
  ta.setSelectionRange(14, 14);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = form.querySelector<HTMLButtonElement>('button:not([type])')!;
    btn.disabled = true; btn.textContent = 'Wysyłanie…';
    try {
      await api('/api/admin/poczta', { action: 'reply', id, text: fd.get('text'), close: fd.get('close') !== null, attachments: files.map(({ name, type, data }) => ({ name, type, data })) });
      toast('Odpowiedź wysłana.');
      loadMail(); openThread(id, false);
    } catch (err) { toast((err as Error).message, true); btn.disabled = false; btn.textContent = 'Wyślij odpowiedź'; }
  });
}

// Licznik nieprzeczytanych przy menu (start panelu) i wejście z linku w powiadomieniu (#korespondencja/<id>)
api('/api/admin/poczta?folder=inbox').then((d) => setMailBadge(d.counts?.inbox || 0)).catch(() => {});
if (location.hash.startsWith('#korespondencja')) {
  const tid = location.hash.split('/')[1];
  setTimeout(() => { document.querySelector<HTMLButtonElement>('[data-tab="mail"]')?.click(); if (tid && /^[0-9a-f-]{36}$/i.test(tid)) openThread(tid); }, 0);
}
