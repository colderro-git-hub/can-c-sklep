// Panel admina - moduł „newsletter” (wydzielony z admin/index.astro).
import { $, api, date, esc, toast } from './core';
import { drawerNav, openDrawer } from './orders';

// ---------- Newsletter: kampanie ----------
export const NL_STATUS: Record<string, [string, string]> = { draft: ['Szkic', 'st--pending_payment'], sending: ['Wysyłanie…', 'st--on_hold'], sent: ['Wysłana', 'st--shipped'] };
export let nlMeta: { products: { id: string; name: string; active: boolean }[]; audiences: Record<string, string> } = { products: [], audiences: {} };
export async function loadNewsletter() {
  const tbody = $('[data-nl-list]');
  tbody.innerHTML = '<tr><td colspan="5" class="empty">Ładowanie…</td></tr>';
  try {
    const d = await api('/api/admin/newsletter');
    nlMeta = { products: d.products, audiences: d.audiences };
    for (const [k, v] of Object.entries(d.stats)) { const el = document.querySelector(`[data-nl-k="${k}"]`); if (el) el.textContent = String(v); }
    const warn = $('[data-nl-warn]'); warn.hidden = !d.fromWarning; warn.textContent = d.fromWarning || '';
    tbody.innerHTML = d.campaigns.length ? d.campaigns.map((c: any) => `<tr data-nlid="${c.id}" tabindex="0" class="clickrow">
        <td><strong>${esc(c.name)}</strong><br><span class="muted">${esc(c.subject || '(bez tematu)')}</span></td>
        <td>${esc(d.audiences[c.audience] || c.audience)}</td>
        <td><span class="st ${NL_STATUS[c.status]?.[1] || ''}">${NL_STATUS[c.status]?.[0] || esc(c.status)}</span></td>
        <td class="r">${c.status === 'draft' ? '-' : `${c.sent_count} / ${c.recipients}${c.failed_count ? `<br><span class="err">błędy: ${c.failed_count}</span>` : ''}`}</td>
        <td class="nowrap">${date(c.sent_at || c.started_at || c.created_at)}</td>
      </tr>`).join('') : '<tr><td colspan="5" class="empty">Brak kampanii. Utwórz pierwszą.</td></tr>';
    tbody.querySelectorAll<HTMLElement>('tr[data-nlid]').forEach((tr) => {
      const go = () => openCampaign(tr.dataset.nlid!);
      tr.addEventListener('click', go); tr.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') go(); });
    });
  } catch (e) { tbody.innerHTML = `<tr><td colspan="5" class="empty err">${esc((e as Error).message)}</td></tr>`; }
}
$('[data-nl-new]').addEventListener('click', () => openCampaign(null));

export const BLOCK_LABEL: Record<string, string> = { heading: 'Nagłówek', text: 'Tekst', image: 'Obraz', button: 'Przycisk', products: 'Produkty', code: 'Kod rabatowy', divider: 'Linia' };
export const newBlock = (type: string): any => ({
  heading: { type, text: '' }, text: { type, text: '' }, image: { type, url: '', alt: '', href: '' }, button: { type, label: 'Przejdź do sklepu', url: '/sklep/' },
  products: { type, ids: [] }, code: { type, code: '', caption: 'Wpisz kod przy zamówieniu' }, divider: { type },
} as any)[type];

export async function openCampaign(id: string | null, push = true) {
  openDrawer(true); drawerNav(() => openCampaign(id, false), push);
  $('[data-drawer]').classList.add('drawer--wide');
  const body = $('[data-d-body]');
  body.innerHTML = '<p class="muted">Ładowanie…</p>';
  let c: any, failed: any[] = [];
  try {
    if (!nlMeta.products.length) { const d = await api('/api/admin/newsletter'); nlMeta = { products: d.products, audiences: d.audiences }; }
    if (id) { const d = await api(`/api/admin/newsletter?id=${encodeURIComponent(id)}`); c = d.campaign; failed = d.failed; }
  } catch (e) { body.innerHTML = `<p class="err">${esc((e as Error).message)}</p>`; return; }
  c ??= { name: '', subject: '', preheader: '', audience: 'all', status: 'draft', blocks: [
    { type: 'heading', text: 'Dzień dobry {imie}!' },
    { type: 'text', text: 'Mamy dla Ciebie coś specjalnego…' },
    { type: 'button', label: 'Przejdź do sklepu', url: '/sklep/' },
  ] };
  let campaignId: string | null = id;
  const blocks: any[] = JSON.parse(JSON.stringify(c.blocks || []));
  const editable = c.status === 'draft';
  $('[data-d-title]').textContent = id ? c.name : 'Nowa kampania';

  body.innerHTML = `
    ${c.status !== 'draft' ? `<div class="meta"><span class="st ${NL_STATUS[c.status][1]}">${NL_STATUS[c.status][0]}</span><span>Wysłane: ${c.sent_count} / ${c.recipients}</span>${c.failed_count ? `<span class="err">Błędy: ${c.failed_count}</span>` : ''}${c.sent_at ? `<span>${date(c.sent_at)}</span>` : ''}</div>` : ''}
    ${failed.length ? `<div class="box box--amber"><strong>Nie wysłano</strong>${failed.slice(0, 10).map((f) => `<span class="small">${esc(f.email)} - ${esc(f.error || '')}</span>`).join('')}</div>` : ''}
    <div class="nl-ed">
      <form class="nl-ed__form" data-nl-form novalidate>
        <fieldset ${editable ? '' : 'disabled'} class="nl-ed__fs">
          <div class="code-form">
            <label class="field">Nazwa kampanii (wewnętrzna, utm_campaign)<input class="input" name="name" value="${esc(c.name)}" maxlength="100" placeholder="np. Black Friday 2026" /></label>
            <label class="field">Odbiorcy<select class="input" name="audience">${Object.entries(nlMeta.audiences).map(([k, v]) => `<option value="${k}" ${c.audience === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select><span class="muted small" data-nl-count></span></label>
            <label class="field code-form__wide">Temat wiadomości<input class="input" name="subject" value="${esc(c.subject)}" maxlength="150" placeholder="np. −20% na krople Can-C tylko do niedzieli" /></label>
            <label class="field code-form__wide">Zajawka (tekst obok tematu w skrzynce)<input class="input" name="preheader" value="${esc(c.preheader)}" maxlength="200" /></label>
          </div>
          <h3 class="sec__t">Treść</h3>
          <p class="muted small">W tekście: <code>**pogrubienie**</code>, <code>*kursywa*</code>, <code>[link](https://…)</code>, lista „- ”, pusty wiersz = nowy akapit. <code>{imie}</code> wstawia imię odbiorcy (bez imienia znika).</p>
          <div class="nl-blocks" data-nl-blocks></div>
          ${editable ? `<div class="actions nl-add">${Object.entries(BLOCK_LABEL).map(([k, v]) => `<button type="button" class="btn btn--outline btn--sm" data-nl-add="${k}">+ ${v}</button>`).join('')}</div>` : ''}
        </fieldset>
        <div class="actions">
          ${editable ? '<button type="button" class="btn btn--outline btn--sm" data-nl-save>Zapisz szkic</button><button type="button" class="btn btn--outline btn--sm" data-nl-test>Wyślij test</button><button type="button" class="btn btn--sm" data-nl-send>Wyślij kampanię</button>' : ''}
          ${c.status === 'sending' ? '<button type="button" class="btn btn--sm" data-nl-resume>Wznów wysyłkę</button>' : ''}
          ${id ? '<button type="button" class="btn btn--outline btn--sm" data-nl-dup>Duplikuj</button>' : ''}
          ${id && editable ? '<button type="button" class="btn btn--danger btn--sm" data-nl-del>Usuń szkic</button>' : ''}
        </div>
        <div class="nl-progress" data-nl-progress hidden><div class="nl-progress__bar"><span data-nl-bar></span></div><span class="small" data-nl-ptext></span></div>
      </form>
      <div class="nl-ed__preview">
        <div class="nl-ed__ph"><strong>Podgląd</strong><span class="muted small">imię w podglądzie: Anna</span></div>
        <iframe title="Podgląd wiadomości" data-nl-frame sandbox=""></iframe>
      </div>
    </div>`;

  const form = body.querySelector<HTMLFormElement>('[data-nl-form]')!;
  const list = body.querySelector<HTMLElement>('[data-nl-blocks]')!;
  const frame = body.querySelector<HTMLIFrameElement>('[data-nl-frame]')!;
  const fields = () => {
    const fd = new FormData(form);
    return { name: String(fd.get('name') ?? c.name), subject: String(fd.get('subject') ?? c.subject), preheader: String(fd.get('preheader') ?? c.preheader), audience: String(fd.get('audience') ?? c.audience), blocks };
  };

  const blockHtml = (b: any, i: number) => {
    const head = `<div class="nl-block__h"><strong>${BLOCK_LABEL[b.type]}</strong>${editable ? `<span class="nl-block__tools">
      <button type="button" class="icon-btn" data-mv="${i}:-1" aria-label="W górę" ${i === 0 ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6" /></svg></button>
      <button type="button" class="icon-btn" data-mv="${i}:1" aria-label="W dół" ${i === blocks.length - 1 ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg></button>
      <button type="button" class="icon-btn" data-rm="${i}" aria-label="Usuń blok"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg></button></span>` : ''}</div>`;
    const f = (k: string, label: string, v: string, attrs = '') => `<label class="field">${label}<input class="input" data-b="${i}" data-k="${k}" value="${esc(v ?? '')}" ${attrs} /></label>`;
    let inner = '';
    if (b.type === 'heading') inner = f('text', 'Tekst nagłówka', b.text, 'maxlength="150"');
    if (b.type === 'text') inner = `<label class="field">Tekst<textarea class="input" rows="5" data-b="${i}" data-k="text" maxlength="4000">${esc(b.text)}</textarea></label>`;
    if (b.type === 'image') inner = `<div class="nl-img">${b.url ? `<img src="${esc(b.url)}" alt="" />` : '<span class="muted small">brak obrazu</span>'}<label class="btn btn--outline btn--sm">${b.url ? 'Zmień' : 'Wgraj'} obraz<input type="file" accept="image/png,image/jpeg,image/webp" data-img="${i}" hidden /></label></div>
      ${f('alt', 'Opis obrazu (alt)', b.alt, 'maxlength="150"')}${f('href', 'Link po kliknięciu (opcjonalnie)', b.href || '', 'placeholder="/produkt/krople-can-c/"')}`;
    if (b.type === 'button') inner = `<div class="row2">${f('label', 'Tekst przycisku', b.label, 'maxlength="60"')}${f('url', 'Adres', b.url, 'placeholder="/sklep/ albo https://…"')}</div>`;
    if (b.type === 'products') inner = `<div class="pm-prods">${nlMeta.products.map((p) => `<label class="check"><input type="checkbox" data-prod="${i}" value="${esc(p.id)}" ${b.ids.includes(p.id) ? 'checked' : ''} /> ${esc(p.name)}${p.active ? '' : ' <span class="muted">(nieaktywny)</span>'}</label>`).join('')}</div>`;
    if (b.type === 'code') inner = `<div class="row2">${f('code', 'Kod', b.code, 'maxlength="30" style="text-transform:uppercase" placeholder="np. NEWSLETTER10"')}${f('caption', 'Podpis', b.caption || '', 'maxlength="150"')}</div><p class="muted small">Utwórz kod w Kody rabatowe (albo promocję z kodem) - tu tylko go pokazujesz.</p>`;
    return `<div class="nl-block">${head}${inner}</div>`;
  };
  const renderBlocks = () => { list.innerHTML = blocks.length ? blocks.map(blockHtml).join('') : '<p class="muted">Dodaj bloki treści przyciskami poniżej.</p>'; };

  let pvT = 0;
  const preview = () => {
    clearTimeout(pvT);
    pvT = window.setTimeout(async () => {
      try { const d = await api('/api/admin/newsletter', { action: 'preview', ...fields() }); frame.srcdoc = d.html; }
      catch (e) { frame.srcdoc = `<p style="font-family:sans-serif;color:#B3261E;padding:20px">${esc((e as Error).message)}</p>`; }
    }, 500);
  };
  const countAudience = async () => {
    const el = body.querySelector('[data-nl-count]')!;
    el.textContent = '…';
    try { const d = await api(`/api/admin/newsletter?audience=${encodeURIComponent(fields().audience)}`); el.textContent = `${d.count} odbiorców teraz`; } catch { el.textContent = ''; }
  };

  list.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.b !== undefined) { blocks[Number(t.dataset.b)][t.dataset.k!] = t.value; preview(); }
  });
  list.addEventListener('change', async (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.prod !== undefined) {
      const b = blocks[Number(t.dataset.prod)];
      b.ids = t.checked ? [...new Set([...b.ids, t.value])] : b.ids.filter((x: string) => x !== t.value);
      preview();
    }
    if (t.dataset.img !== undefined) {
      const file = t.files?.[0]; if (!file) return;
      try {
        toast('Wysyłanie obrazu…');
        // Do maili JPG (Outlook nie wyświetla WebP), szerokość maks. 1200 px
        const bmp = await createImageBitmap(file);
        const scale = Math.min(1, 1200 / bmp.width);
        const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * scale); cv.height = Math.round(bmp.height * scale);
        const ctx = cv.getContext('2d')!; ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
        const blob = await new Promise<Blob>((res, rej) => cv.toBlob((x) => (x ? res(x) : rej(new Error('Nie udało się przygotować obrazu.'))), 'image/jpeg', 0.86));
        const fd = new FormData(); fd.append('file', new File([blob], 'newsletter.jpg', { type: 'image/jpeg' })); fd.append('product', 'newsletter');
        const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || 'Błąd wysyłania obrazu.');
        blocks[Number(t.dataset.img)].url = d.url; renderBlocks(); preview(); toast('Obraz dodany.');
      } catch (err) { toast((err as Error).message, true); }
    }
  });
  list.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mv],[data-rm]');
    if (!t) return;
    if (t.dataset.rm !== undefined) blocks.splice(Number(t.dataset.rm), 1);
    else { const [i, d] = t.dataset.mv!.split(':').map(Number); const j = i + d; if (j < 0 || j >= blocks.length) return; [blocks[i], blocks[j]] = [blocks[j], blocks[i]]; }
    renderBlocks(); preview();
  });
  body.querySelectorAll<HTMLButtonElement>('[data-nl-add]').forEach((b) => b.addEventListener('click', () => { blocks.push(newBlock(b.dataset.nlAdd!)); renderBlocks(); preview(); }));
  form.addEventListener('input', (e) => { if (!(e.target as HTMLElement).dataset.b) preview(); });
  form.querySelector('[name="audience"]')?.addEventListener('change', countAudience);

  const save = async () => {
    const d = await api('/api/admin/newsletter', { action: 'save', ...(campaignId ? { id: campaignId } : {}), ...fields() });
    campaignId = d.id;
    return d.id as string;
  };
  const runSending = async (cid: string) => {
    const prog = body.querySelector<HTMLElement>('[data-nl-progress]')!;
    const bar = body.querySelector<HTMLElement>('[data-nl-bar]')!;
    const txt = body.querySelector<HTMLElement>('[data-nl-ptext]')!;
    prog.hidden = false;
    body.querySelectorAll<HTMLButtonElement>('.actions button').forEach((x) => (x.disabled = true));
    let errors = 0;
    for (let guard = 0; guard < 1000; guard++) {
      let d: any;
      try { d = await api('/api/admin/newsletter', { action: 'batch', id: cid }); }
      catch (e) { txt.textContent = `Przerwano: ${(e as Error).message}. Kliknij „Wznów wysyłkę”.`; break; }
      if (d.error) errors++;
      bar.style.width = `${d.recipients ? Math.round(((d.sent + d.failed) / d.recipients) * 100) : 100}%`;
      txt.textContent = `Wysłano ${d.sent} z ${d.recipients}${d.failed ? ` · błędy: ${d.failed}` : ''} - nie zamykaj tego okna.`;
      if (d.done) { txt.textContent = `Gotowe: wysłano ${d.sent} z ${d.recipients}${d.failed ? ` · błędy: ${d.failed}` : ''}.`; toast('Kampania wysłana.'); break; }
      if (errors >= 3) { txt.textContent = 'Kilka paczek zakończyło się błędem - sprawdź konfigurację Resend i kliknij „Wznów wysyłkę”.'; break; }
    }
    loadNewsletter();
    openCampaign(cid, false);
  };

  body.querySelector('[data-nl-save]')?.addEventListener('click', async () => {
    try { const nid = await save(); toast('Zapisano szkic.'); loadNewsletter(); if (!id) openCampaign(nid, false); } catch (e) { toast((e as Error).message, true); }
  });
  body.querySelector('[data-nl-test]')?.addEventListener('click', async () => {
    const to = prompt('Adres do wiadomości testowej (puste = Twój adres z logowania do panelu):', '') ?? null;
    if (to === null) return;
    try { const d = await api('/api/admin/newsletter', { action: 'test', to, ...fields() }); toast(`Wysłano test na: ${d.to.join(', ')}`); } catch (e) { toast((e as Error).message, true); }
  });
  body.querySelector('[data-nl-send]')?.addEventListener('click', async () => {
    try {
      const cid = await save();
      const n = await api(`/api/admin/newsletter?audience=${encodeURIComponent(fields().audience)}`);
      if (!confirm(`Wysłać kampanię „${fields().subject}” do ${n.count} odbiorców? Tej operacji nie można cofnąć.`)) return;
      await api('/api/admin/newsletter', { action: 'start', id: cid });
      await runSending(cid);
    } catch (e) { toast((e as Error).message, true); }
  });
  body.querySelector('[data-nl-resume]')?.addEventListener('click', () => runSending(id!));
  body.querySelector('[data-nl-dup]')?.addEventListener('click', async () => {
    try { const d = await api('/api/admin/newsletter', { action: 'duplicate', id }); toast('Utworzono kopię.'); loadNewsletter(); openCampaign(d.id, false); } catch (e) { toast((e as Error).message, true); }
  });
  body.querySelector('[data-nl-del]')?.addEventListener('click', async () => {
    if (!confirm('Usunąć szkic kampanii?')) return;
    try { await api('/api/admin/newsletter', { action: 'delete', id }); toast('Usunięto.'); loadNewsletter(); openDrawer(false); } catch (e) { toast((e as Error).message, true); }
  });

  renderBlocks();
  preview();
  if (editable) countAudience();
}
