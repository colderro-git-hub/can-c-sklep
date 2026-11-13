// Panel admina - moduł „seo” (wydzielony z admin/index.astro).
import { $, api, esc, toast } from './core';
import { fileFrom, shrink } from './products';
import { fillRobots } from './settings';
import { fmtDate, loadRedirects } from './redirects';

// ---------- SEO ----------
export type SeoPageDef = { path: string; label: string; title: string; description: string };
export let seoData: { seo: any; pages: SeoPageDef[]; limits: { title: number; description: number } } | null = null;
export const OG_ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';

// Pole obrazu OG: podgląd 1200×630 (proporcje), wybór pliku, usunięcie; adres w ukrytym polu
export function ogSlotHtml(url: string) {
  return `<div class="og-slot" data-og>
    <input type="hidden" name="ogImage" value="${esc(url)}" />
    <div class="og-slot__prev">${url ? `<img src="${esc(url)}" alt="" />` : ''}<span class="muted small" data-og-empty ${url ? 'hidden' : ''}>Brak obrazu</span></div>
    <div class="actions"><label class="btn btn--sm">${url ? 'Zmień plik' : 'Wybierz plik'}<input type="file" accept="${OG_ACCEPT}" hidden data-og-file /></label>
    <button type="button" class="btn btn--outline btn--sm" data-og-remove ${url ? '' : 'hidden'}>Usuń</button></div>
  </div>`;
}
export function wireOgSlot(slot: HTMLElement, onChange: (url: string) => Promise<void>) {
  const hidden = slot.querySelector<HTMLInputElement>('input[name="ogImage"]')!;
  const prev = slot.querySelector<HTMLElement>('.og-slot__prev')!;
  const pick = slot.querySelector<HTMLLabelElement>('label.btn')!;
  const rm = slot.querySelector<HTMLButtonElement>('[data-og-remove]')!;
  const show = (url: string) => {
    hidden.value = url; prev.querySelector('img')?.remove();
    if (url) { const im = document.createElement('img'); im.src = url; im.alt = ''; prev.prepend(im); }
    prev.querySelector<HTMLElement>('[data-og-empty]')!.hidden = !!url; rm.hidden = !url;
    pick.firstChild!.textContent = url ? 'Zmień plik' : 'Wybierz plik';
  };
  slot.querySelector<HTMLInputElement>('[data-og-file]')!.addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement; const file = input.files?.[0]; input.value = '';
    if (!file) return;
    const before = hidden.value;
    try {
      toast(`Wysyłanie ${file.name}…`);
      const fd = new FormData(); fd.append('file', fileFrom(await shrink(file))); fd.append('product', 'seo');
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Błąd wysyłania pliku.');
      show(d.url); await onChange(d.url);
    } catch (err) { show(before); toast((err as Error).message, true); }
  });
  rm.addEventListener('click', async () => {
    if (!confirm('Usunąć obraz?')) return;
    const before = hidden.value;
    try { show(''); await onChange(''); } catch (err) { show(before); toast((err as Error).message, true); }
  });
}
// Licznik znaków: zielony do limitu Google, potem ostrzeżenie (tekst będzie skrócony w wynikach)
export function counter(el: HTMLInputElement | HTMLTextAreaElement, out: HTMLElement, limit: number) {
  const upd = () => {
    const n = (el.value || el.placeholder).length, own = el.value.length > 0;
    out.textContent = `${n}/${limit}${own ? '' : ' (domyślny)'}`;
    out.className = `small ${n > limit ? 'err' : 'muted'}`;
  };
  el.addEventListener('input', upd); upd();
}

export async function loadSeo() {
  const list = $<HTMLElement>('[data-seo-pages]');
  try { seoData = await api('/api/admin/seo'); } catch (e) { list.innerHTML = `<p class="err">${esc((e as Error).message)}</p>`; return; }
  const { seo, pages, limits } = seoData!;
  list.innerHTML = pages.map((p) => {
    const o = seo.pages[p.path] || {};
    const own = Boolean(o.title || o.description || o.ogImage);
    return `<details class="card seo-page" data-seo-path="${esc(p.path)}">
      <summary class="seo-page__sum">
        <span class="seo-page__name"><strong>${esc(p.label)}</strong><span class="muted small">${esc(p.path)}</span></span>
        <span class="seo-page__pills">${o.noindex ? '<span class="pill pill--warn">Nie indeksuj</span>' : ''}<span class="pill ${own ? 'pill--ok' : ''}">${own ? 'Własne' : 'Domyślne'}</span></span>
      </summary>
      <form class="stack seo-page__form" novalidate>
        <div class="seo-grid">
          <div class="stack">
            <label class="field">Tytuł strony (title) <span data-cnt-title></span><input class="input" name="title" maxlength="90" value="${esc(o.title || '')}" placeholder="${esc(p.title)}" /></label>
            <label class="field">Opis (meta description) <span data-cnt-desc></span><textarea class="input" name="description" rows="3" maxlength="300" placeholder="${esc(p.description)}">${esc(o.description || '')}</textarea></label>
            <label class="check"><input type="checkbox" name="noindex" ${o.noindex ? 'checked' : ''} /> Nie indeksuj tej strony w Google (noindex)</label>
          </div>
          <div class="stack">
            <div class="serp" aria-label="Podgląd w Google"><span class="serp__url">can-c.pl${esc(p.path === '/' ? '' : p.path.replace(/\/$/, '').replace(/\//g, ' › '))}</span><span class="serp__t" data-serp-t></span><span class="serp__d" data-serp-d></span></div>
            <div class="field">Obraz do udostępniania <span class="muted small">puste = obraz domyślny z „Udostępniania”</span>${ogSlotHtml(o.ogImage || '')}</div>
          </div>
        </div>
        <div class="actions"><button class="btn btn--sm">Zapisz</button><a class="btn btn--outline btn--sm" href="${esc(p.path)}" target="_blank" rel="noopener">Otwórz stronę</a></div>
      </form>
    </details>`;
  }).join('');

  list.querySelectorAll<HTMLElement>('[data-seo-path]').forEach((card) => {
    const path = card.dataset.seoPath!;
    const form = card.querySelector<HTMLFormElement>('form')!;
    const t = form.elements.namedItem('title') as HTMLInputElement;
    const d = form.elements.namedItem('description') as HTMLTextAreaElement;
    counter(t, card.querySelector('[data-cnt-title]')!, limits.title);
    counter(d, card.querySelector('[data-cnt-desc]')!, limits.description);
    const serp = () => {
      const tt = t.value || t.placeholder, dd = d.value || d.placeholder;
      card.querySelector('[data-serp-t]')!.textContent = tt.length > limits.title + 2 ? tt.slice(0, limits.title).trimEnd() + '…' : tt;
      card.querySelector('[data-serp-d]')!.textContent = dd.length > limits.description + 3 ? dd.slice(0, limits.description).trimEnd() + '…' : dd;
    };
    t.addEventListener('input', serp); d.addEventListener('input', serp); serp();
    const save = async (msg = 'Zapisano SEO strony.') => {
      const fd = new FormData(form);
      const r = await api('/api/admin/seo', { action: 'page', path, title: fd.get('title'), description: fd.get('description'), ogImage: fd.get('ogImage'), noindex: fd.get('noindex') !== null });
      seoData!.seo = r.seo;
      const o = r.seo.pages[path] || {};
      const own = Boolean(o.title || o.description || o.ogImage);
      card.querySelector('.seo-page__pills')!.innerHTML = `${o.noindex ? '<span class="pill pill--warn">Nie indeksuj</span>' : ''}<span class="pill ${own ? 'pill--ok' : ''}">${own ? 'Własne' : 'Domyślne'}</span>`;
      toast(msg);
    };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ni = form.elements.namedItem('noindex') as HTMLInputElement;
      if (ni.checked && !seoData!.seo.pages[path]?.noindex && !confirm('Strona zniknie z wyników Google. Kontynuować?')) return;
      try { await save(); } catch (err) { toast((err as Error).message, true); }
    });
    wireOgSlot(card.querySelector<HTMLElement>('[data-og]')!, () => save('Zapisano obraz do udostępniania.'));
  });

  // Udostępnianie
  const sf = $<HTMLFormElement>('[data-seo-share]');
  (sf.elements.namedItem('siteName') as HTMLInputElement).value = seo.share.siteName || '';
  (sf.elements.namedItem('twitter') as HTMLInputElement).value = seo.share.twitter || '';
  const slotWrap = sf.querySelector<HTMLElement>('[data-og-slot="share"]')!;
  slotWrap.innerHTML = ogSlotHtml(seo.share.ogImage || '');
  const fbPrev = () => {
    const url = (sf.querySelector<HTMLInputElement>('input[name="ogImage"]')!).value;
    const box = sf.querySelector<HTMLElement>('[data-fb-img]')!;
    box.innerHTML = url ? `<img src="${esc(url)}" alt="" />` : '<span>Brak obrazu</span>';
    const home = pages.find((p) => p.path === '/'); const ho = seo.pages['/'] || {};
    sf.querySelector('[data-fb-title]')!.textContent = ho.title || home?.title || '';
    sf.querySelector('[data-fb-desc]')!.textContent = ho.description || home?.description || '';
  };
  const saveShare = async (msg = 'Zapisano ustawienia udostępniania.') => {
    const fd = new FormData(sf);
    const r = await api('/api/admin/seo', { action: 'share', ogImage: fd.get('ogImage'), siteName: fd.get('siteName'), twitter: fd.get('twitter') });
    seoData!.seo = r.seo; fbPrev(); toast(msg);
  };
  wireOgSlot(slotWrap.querySelector<HTMLElement>('[data-og]')!, () => saveShare('Zapisano domyślny obraz.'));
  sf.onsubmit = async (e) => { e.preventDefault(); try { await saveShare(); } catch (err) { toast((err as Error).message, true); } };
  fbPrev();
  fillOrg(seoData as any);
  fillBots(seoData as any);
  fillVerify(seoData as any);
}

// Weryfikacje i IndexNow
export function fillVerify(d: any) {
  const vf = $<HTMLFormElement>('[data-verify-form]');
  const v = d.seo.verify || {};
  for (const k of ['google', 'bing', 'meta']) {
    (vf.elements.namedItem(k) as HTMLInputElement).value = v[k] || '';
    const st = vf.querySelector<HTMLElement>(`[data-v-st="${k}"]`)!;
    st.textContent = v[k] ? 'Kod na stronie' : 'Brak'; st.className = `pill ${v[k] ? 'pill--ok' : ''}`;
  }
  vf.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(vf);
    try { const r = await api('/api/admin/seo', { action: 'verify', google: fd.get('google'), bing: fd.get('bing'), meta: fd.get('meta') }); seoData!.seo = r.seo; fillVerify(seoData); toast('Zapisano kody weryfikacyjne.'); }
    catch (err) { toast((err as Error).message, true); }
  };
  const inf = $<HTMLFormElement>('[data-indexnow-form]');
  const ix = d.seo.indexnow || {};
  (inf.elements.namedItem('enabled') as HTMLInputElement).checked = !!ix.enabled;
  (inf.elements.namedItem('auto') as HTMLInputElement).checked = ix.auto !== false;
  const st = $<HTMLElement>('[data-in-st]');
  const last = (ix.log || [])[0];
  st.textContent = !ix.enabled ? 'Wyłączony' : last ? (last.ok ? 'Działa' : 'Błąd ostatniego zgłoszenia') : 'Włączony';
  st.className = `pill ${!ix.enabled ? '' : last && !last.ok ? 'pill--warn' : 'pill--ok'}`;
  $('[data-in-key]').textContent = ix.key || 'zostanie wygenerowany przy zapisie';
  const link = $<HTMLAnchorElement>('[data-in-keylink]');
  link.hidden = !ix.key; if (ix.key) link.href = `/${ix.key}.txt`;
  const saveIx = async (regenerate = false) => {
    const fd = new FormData(inf);
    const r = await api('/api/admin/seo', { action: 'indexnow', enabled: fd.get('enabled') !== null, auto: fd.get('auto') !== null, regenerate });
    seoData!.seo = r.seo; fillVerify(seoData);
  };
  inf.onsubmit = async (e) => { e.preventDefault(); try { await saveIx(); toast('Zapisano ustawienia IndexNow.'); } catch (err) { toast((err as Error).message, true); } };
  ($('[data-in-regen]') as HTMLButtonElement).onclick = async () => {
    if (!confirm('Wygenerować nowy klucz? Stary przestanie działać od razu.')) return;
    try { await saveIx(true); toast('Wygenerowano nowy klucz.'); } catch (err) { toast((err as Error).message, true); }
  };
  $('[data-in-log]').innerHTML = (ix.log || []).length ? ix.log.map((l: any) => `<tr><td class="nowrap">${fmtDate(l.at)}${l.auto ? ' <span class="muted small">auto</span>' : ''}</td><td class="r">${l.count}</td><td class="${l.ok ? 'ok' : 'err'}">${esc(l.message)}${l.status ? ` (${l.status})` : ''}</td><td class="small muted">${esc(l.by)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="muted">Brak zgłoszeń.</td></tr>';
  const sf = $<HTMLFormElement>('[data-indexnow-submit]');
  const submit = async (body: any) => {
    try { const r = await api('/api/admin/seo', { action: 'indexnow-submit', ...body }); seoData!.seo = r.seo; fillVerify(seoData); toast(`Zgłoszono ${r.count} adres(ów): ${r.message}.`); return true; }
    catch (err) { toast((err as Error).message, true); try { seoData = await api('/api/admin/seo'); fillVerify(seoData); } catch { /* bez odświeżenia */ } return false; }
  };
  sf.onsubmit = async (e) => { e.preventDefault(); if (await submit({ urls: new FormData(sf).get('urls') })) sf.reset(); };
  ($('[data-in-all]') as HTMLButtonElement).onclick = () => submit({ all: true });
}

// Roboty i AI
export function fillBots(d: any) {
  if (d.robots) fillRobots(d.robots);
  const blocked = new Set<string>(d.seo.ai?.block || []);
  const groups: [string, string, string][] = [
    ['search', 'Wyszukiwarki i asystenci AI', 'Cytują i polecają sklep w odpowiedziach. Zalecamy zezwolić.'],
    ['training', 'Trening modeli AI', 'Zbierają treści do uczenia modeli. Decyzja biznesowa - blokada nie wpływa na wyszukiwarki.'],
  ];
  $('[data-ai-groups]').innerHTML = groups.map(([g, t, h]) => `
    <fieldset class="ai-group">
      <legend><strong>${t}</strong> <span class="muted small">${h}</span></legend>
      <div class="actions" style="margin:6px 0 10px"><button type="button" class="btn btn--outline btn--sm" data-ai-all="${g}" data-v="allow">Zezwól wszystkim</button><button type="button" class="btn btn--outline btn--sm" data-ai-all="${g}" data-v="block">Zablokuj wszystkie</button></div>
      ${d.aiBots.filter((b: any) => b.group === g).map((b: any) => `
        <label class="ai-bot"><span class="ai-bot__n"><code>${esc(b.id)}</code><span class="muted small">${esc(b.owner)} · ${esc(b.note)}</span></span>
          <span class="ai-sw"><input type="checkbox" name="allow" value="${esc(b.id)}" ${blocked.has(b.id) ? '' : 'checked'} data-ai-group="${g}" /><span class="ai-sw__l" data-on="Dozwolony" data-off="Zablokowany"></span></span>
        </label>`).join('')}
    </fieldset>`).join('');
  const form = $<HTMLFormElement>('[data-ai-form]');
  form.querySelectorAll<HTMLButtonElement>('[data-ai-all]').forEach((b) => b.addEventListener('click', () => {
    form.querySelectorAll<HTMLInputElement>(`input[data-ai-group="${b.dataset.aiAll}"]`).forEach((i) => { i.checked = b.dataset.v === 'allow'; });
  }));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const block = d.aiBots.map((b: any) => b.id).filter((id: string) => !form.querySelector<HTMLInputElement>(`input[value="${id}"]`)!.checked);
    const searchBlocked = d.aiBots.filter((b: any) => b.group === 'search' && block.includes(b.id)).length;
    if (searchBlocked && !confirm(`Blokujesz ${searchBlocked} bot(y) wyszukiwarek AI - te serwisy nie zacytują ani nie polecą sklepu. Kontynuować?`)) return;
    try { const r = await api('/api/admin/seo', { action: 'ai', block }); Object.assign(seoData!, r); fillRobots(r.robots); toast(block.length ? `Zapisano. Zablokowane boty: ${block.length}.` : 'Zapisano. Wszystkie boty AI mają dostęp.'); }
    catch (err) { toast((err as Error).message, true); }
  };
  const lf = $<HTMLFormElement>('[data-llms-form]');
  const ll = d.seo.llms || {};
  (lf.elements.namedItem('enabled') as HTMLInputElement).checked = ll.enabled !== false;
  (lf.elements.namedItem('summary') as HTMLTextAreaElement).value = ll.summary || '';
  (lf.elements.namedItem('extra') as HTMLTextAreaElement).value = ll.extra || '';
  $('[data-llms-preview]').textContent = d.llmsPreview || '';
  lf.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(lf);
    try {
      const r = await api('/api/admin/seo', { action: 'llms', enabled: fd.get('enabled') !== null, summary: fd.get('summary'), extra: fd.get('extra') });
      Object.assign(seoData!, r); $('[data-llms-preview]').textContent = fd.get('enabled') !== null ? r.llmsPreview : '(wyłączone - /llms.txt zwraca 404)';
      toast('Zapisano llms.txt.');
    } catch (err) { toast((err as Error).message, true); }
  };
}

// Dane firmy
export function fillOrg(d: any) {
  const f = $<HTMLFormElement>('[data-seo-org]');
  const o = d.seo.org || {}, def = d.orgDefaults || {};
  const set = (n: string, v: string, ph = '') => { const el = f.elements.namedItem(n) as HTMLInputElement; el.value = v || ''; if (ph) el.placeholder = ph; };
  set('name', o.name, def.name); set('legalName', o.legalName, def.legalName); set('description', o.description);
  set('street', o.street, def.street); set('postcode', o.postcode, def.postcode); set('city', o.city, def.city);
  set('sameAs', (o.sameAs || []).join('\n')); set('foundingDate', o.foundingDate);
  (f.elements.namedItem('breadcrumbs') as HTMLInputElement).checked = o.breadcrumbs !== false;
  $('[data-org-contact]').innerHTML = [def.email ? `E-mail: ${esc(def.email)}` : '<span class="err">Brak e-maila</span>', def.phone ? `Telefon: ${esc(def.phone)}` : '<span class="err">Brak telefonu - uzupełnij w Ustawieniach sklepu</span>', def.taxID ? `NIP: ${esc(def.taxID)}` : ''].filter(Boolean).join('<br>');
  $('[data-org-json]').textContent = JSON.stringify(d.orgJsonLd, null, 2);
  $('[data-crumb-json]').textContent = JSON.stringify(d.crumbExample, null, 2);
  const wrap = $<HTMLElement>('[data-org-logo]');
  wrap.innerHTML = ogSlotHtml(o.logo || '');
  if (!o.logo && def.logo) wrap.querySelector('.og-slot__prev')!.insertAdjacentHTML('afterbegin', `<img src="${esc(def.logo)}" alt="" class="org-logo__fallback" />`), (wrap.querySelector('[data-og-empty]') as HTMLElement).hidden = true;
  wireOgSlot(wrap.querySelector<HTMLElement>('[data-og]')!, () => saveOrg('Zapisano logo dla wyszukiwarek.'));
  f.onsubmit = async (e) => { e.preventDefault(); try { await saveOrg(); } catch (err) { toast((err as Error).message, true); } };
}
export async function saveOrg(msg = 'Zapisano dane firmy.') {
  const f = $<HTMLFormElement>('[data-seo-org]');
  const fd = new FormData(f);
  const r = await api('/api/admin/seo', { action: 'org', name: fd.get('name'), legalName: fd.get('legalName'), description: fd.get('description'),
    logo: fd.get('ogImage'), street: fd.get('street'), postcode: fd.get('postcode'), city: fd.get('city'), sameAs: fd.get('sameAs'),
    foundingDate: fd.get('foundingDate'), breadcrumbs: fd.get('breadcrumbs') !== null });
  seoData = { ...seoData!, ...r, seo: r.seo };
  $('[data-org-json]').textContent = JSON.stringify(r.orgJsonLd, null, 2);
  toast(msg);
}
document.querySelectorAll<HTMLButtonElement>('[data-seo-tab]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-seo-tab]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll<HTMLElement>('[data-seo-pane]').forEach((p) => { p.hidden = p.dataset.seoPane !== b.dataset.seoTab; });
  if (b.dataset.seoTab === 'redirects') loadRedirects();
}));
