// Panel admina - moduł „products” (wydzielony z admin/index.astro).
import { $, api, date, esc, pln, toast } from './core';
import { drawerNav, openDrawer } from './orders';

// ---------- Produkty ----------
export const AVAIL: Record<string, string> = { in_stock: 'Dostępny', out_of_stock: 'Niedostępny', preorder: 'Przedsprzedaż', backorder: 'Na zamówienie' };
export let productsList: any[] = [];
// Zmiana z innych modułów (importy są tylko do odczytu)
export function setProductsList(v: typeof productsList) { productsList = v; }
export async function loadProducts() {
  const tbody = $('[data-products]');
  tbody.innerHTML = '<tr><td colspan="7" class="empty">Ładowanie…</td></tr>';
  try {
    const { rows } = await api('/api/admin/products');
    productsList = rows;
    const pend = rows.reduce((s: number, r: any) => s + r.reviewsPending, 0);
    $('[data-count-reviews]').textContent = pend ? String(pend) : '';
    tbody.innerHTML = rows.map((p: any) => {
      const sale = p.sale_price !== null && p.sale_price < p.price;
      const low = p.stock <= p.low_stock_alert && !p.availability;
      return `<tr data-pid="${esc(p.id)}" tabindex="0" class="clickrow">
        <td>${p.images?.[0] ? `<img class="thumb-sm" src="${esc(p.images[0].url)}" alt="" />` : '<span class="thumb-sm thumb-sm--empty"></span>'}</td>
        <td><strong>${esc(p.name)}</strong><br><span class="muted">/${esc(p.id)}/${p.subtitle ? ` · ${esc(p.subtitle)}` : ''}</span></td>
        <td class="r nowrap">${sale ? `<strong>${pln(p.sale_price)}</strong><br><s class="muted">${pln(p.price)}</s>` : `<strong>${pln(p.price)}</strong>`}</td>
        <td class="r ${low ? 'err' : ''}">${p.stock}${low ? '<br><span class="small">mało</span>' : ''}</td>
        <td>${AVAIL[p.avail] || p.avail}${p.availability ? ' <span class="muted">(ręcznie)</span>' : ''}</td>
        <td>${p.ratingAvg ? `★ ${String(p.ratingAvg).replace('.', ',')} (${p.reviewsApproved})` : '-'}${p.reviewsPending ? ` <span class="badge-inline">${p.reviewsPending} nowe</span>` : ''}${p.notifyWaiting ? `<br><span class="badge-inline" title="Osoby czekające na powiadomienie o dostępności">🔔 ${p.notifyWaiting} czeka</span>` : ''}</td>
        <td><span class="st ${p.active ? 'st--shipped' : 'st--pending_payment'}">${p.active ? 'Aktywny' : 'Ukryty'}</span></td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="empty">Brak produktów.</td></tr>';
    tbody.querySelectorAll<HTMLElement>('tr[data-pid]').forEach((tr) => {
      const go = () => openProduct(tr.dataset.pid!);
      tr.addEventListener('click', go); tr.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') go(); });
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty err">${esc((e as Error).message)}</td></tr>`;
  }
}

// Zmniejszenie zdjęcia w przeglądarce (maks. 1600 px, WebP) przed wysłaniem.
// Przezroczyste tło z PNG zostaje (WebP obsługuje przezroczystość). Safari nie zapisuje WebP - wtedy wychodzi PNG.
export const MAX_PX = 1600;
export async function toCanvas(src: Blob) {
  const img = await createImageBitmap(src);
  const scale = Math.min(1, MAX_PX / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
export const canvasBlob = (c: HTMLCanvasElement, fallback?: Blob) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : fallback ? res(fallback) : rej(new Error('Nie udało się zapisać zdjęcia.'))), 'image/webp', 0.88));
export async function shrink(file: File): Promise<Blob> { return canvasBlob(await toCanvas(file), file); }
export const fileFrom = (b: Blob) => new File([b], b.type === 'image/png' ? 'img.png' : b.type === 'image/jpeg' ? 'img.jpg' : 'img.webp', { type: b.type || 'image/webp' });

// Usunięcie jednolitego jasnego tła (packshot na białym tle → przezroczyste tło).
// Wypełnianie od krawędzi zdjęcia: znika tylko tło połączone z brzegiem, białe elementy w środku produktu zostają.
export async function removeLightBackground(url: string): Promise<Blob> {
  const res = await fetch(`/api/admin/upload?src=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Nie udało się pobrać zdjęcia.');
  const c = await toCanvas(await res.blob());
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const W = c.width, H = c.height;
  const im = ctx.getImageData(0, 0, W, H), px = im.data;
  // Kolor tła: średnia z narożników 6 × 6 px
  let r = 0, g = 0, b = 0, n = 0;
  for (const [x0, y0] of [[0, 0], [W - 6, 0], [0, H - 6], [W - 6, H - 6]]) for (let y = y0; y < y0 + 6; y++) for (let x = x0; x < x0 + 6; x++) { const i = (y * W + x) * 4; if (px[i + 3] < 128) continue; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
  if (!n) throw new Error('To zdjęcie ma już przezroczyste tło.');
  r /= n; g /= n; b /= n;
  if (Math.min(r, g, b) < 200) throw new Error('Tło nie jest jasne i jednolite - usuń je w programie graficznym i wgraj PNG.');
  const TOL = 26, SOFT = 40;
  const dist = (i: number) => Math.max(Math.abs(px[i] - r), Math.abs(px[i + 1] - g), Math.abs(px[i + 2] - b));
  const seen = new Uint8Array(W * H), queue = new Int32Array(W * H);
  let head = 0, tail = 0, removed = 0;
  const push = (p: number) => { if (!seen[p] && dist(p * 4) <= TOL) { seen[p] = 1; queue[tail++] = p; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (head < tail) {
    const p = queue[head++], x = p % W, y = (p - x) / W;
    px[p * 4 + 3] = 0; removed++;
    if (x > 0) push(p - 1); if (x < W - 1) push(p + 1); if (y > 0) push(p - W); if (y < H - 1) push(p + W);
  }
  if (removed < W * H * 0.02) throw new Error('Nie znaleziono jasnego tła przy krawędziach zdjęcia.');
  // Miękka krawędź: piksele stykające się z tłem i mu bliskie dostają częściową przezroczystość
  for (let p = 0; p < W * H; p++) {
    if (seen[p]) continue;
    const x = p % W, y = (p - x) / W;
    const touches = (x > 0 && seen[p - 1]) || (x < W - 1 && seen[p + 1]) || (y > 0 && seen[p - W]) || (y < H - 1 && seen[p + W]);
    if (!touches) continue;
    const d = dist(p * 4);
    if (d < TOL + SOFT) px[p * 4 + 3] = Math.min(px[p * 4 + 3], Math.round(((d - TOL) / SOFT) * 255));
  }
  ctx.putImageData(im, 0, 0);
  return canvasBlob(c);
}

export async function openProduct(id: string | null, push = true) {
  $('[data-drawer]').classList.toggle('drawer--wide', true);
  openDrawer(true); drawerNav(() => openProduct(id, false), push);
  $('[data-drawer]').classList.add('drawer--wide');
  const body = $('[data-d-body]');
  body.innerHTML = '<p class="muted">Ładowanie…</p>';
  let p: any = { id: '', name: '', subtitle: '', active: false, price: null, sale_price: null, vat_rate: 23, bundles: false, stock: 0, low_stock_alert: 5, availability: null, short_description: '', description: '', how_to_use: '', lead_time: '', highlights: [], seo_title: '', seo_description: '', tags: [], images: [], brand: 'Can-C', ean: '', mpn: '', google_category: '', condition: 'new', unit_value: null, unit_measure: null, weight_g: null, related_ids: [], sort_order: 0 };
  let history: any[] = [], lowest30: number | null = null;
  if (id) {
    try { const d = await api(`/api/admin/products?id=${encodeURIComponent(id)}`); p = d.product; history = d.history; lowest30 = d.lowest30; }
    catch (e) { body.innerHTML = `<p class="err">${esc((e as Error).message)}</p>`; return; }
  }
  if (!productsList.length) { try { productsList = (await api('/api/admin/products')).rows; } catch { /* lista do powiązań */ } }
  $('[data-d-title]').textContent = id ? p.name : 'Nowy produkt';
  const zl = (g: number | null) => (g === null || g === undefined ? '' : (g / 100).toFixed(2).replace('.', ','));
  const loc = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const images: { url: string; alt: string }[] = (p.images || []).map((i: any) => ({ url: i.url, alt: i.alt || '' }));
  body.innerHTML = `
    <form class="sec pe" data-pe novalidate>
      <div class="pe__bar">
        <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''} /> Widoczny w sklepie</label>
        <div class="actions">${id ? `<a class="btn btn--outline btn--sm" href="/produkt/${esc(p.id)}/" target="_blank" rel="noopener">Podgląd</a><button type="button" class="btn btn--outline btn--sm" data-dup>Duplikuj</button>` : ''}<button class="btn btn--sm">Zapisz produkt</button></div>
      </div>

      <div class="sec"><h3 class="sec__t">Podstawowe</h3>
        <label class="field">Nazwa<input class="input" name="name" value="${esc(p.name)}" maxlength="150" required /></label>
        <div class="row2">
          <label class="field">Adres strony (slug)<input class="input" name="id" value="${esc(p.id)}" ${id ? 'readonly' : ''} placeholder="np. krople-can-c-k9" /></label>
          <label class="field">Opakowanie / wariant<input class="input" name="subtitle" value="${esc(p.subtitle || '')}" placeholder="np. 2 × 5 ml" /></label>
        </div>
        <div class="row2">
          <label class="field">Tagi (po przecinku; etykiety na stronie produktu, na kartach pierwsze 3)<input class="input" name="tags" value="${esc((p.tags || []).join(', '))}" placeholder="Bez konserwantów, Przy soczewkach" /></label>
          <label class="field">Kolejność na liście<input class="input" name="sort_order" type="number" value="${p.sort_order || 0}" /></label>
        </div>
      </div>

      <div class="sec"><h3 class="sec__t">Zdjęcia <span class="muted">(pierwsze = główne)</span></h3>
        <div class="imgs" data-imgs></div>
        <div class="actions"><label class="btn btn--outline btn--sm upload">+ Dodaj zdjęcia<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-upload hidden /></label><button type="button" class="btn btn--outline btn--sm" data-nobg-all>Usuń białe tło ze wszystkich</button></div>
        <p class="muted small">Najlepiej wgrywaj PNG z przezroczystym tłem - przezroczystość zostaje, a zdjęcie dobrze wygląda w trybie jasnym i ciemnym. Zdjęcia na białym tle przerobisz przyciskiem „Usuń białe tło” (zadziała przy jednolitym, jasnym tle; przy cieniach i odbiciach lepiej przygotować PNG w programie graficznym). Zdjęcia zmniejszamy automatycznie do 1600 px (WebP). Google Merchant wymaga min. 100 × 100 px, zaleca 800 × 800 px, bez napisów i znaków wodnych.</p>
      </div>

      <div class="sec"><h3 class="sec__t">Cena</h3>
        <div class="row3c">
          <label class="field">Cena brutto (zł)<input class="input" name="price" value="${zl(p.price)}" inputmode="decimal" /></label>
          <label class="field">Stawka VAT<select class="input" name="vat_rate">${[23, 8, 5, 0].map((v) => `<option value="${v}" ${p.vat_rate === v ? 'selected' : ''}>${v}%</option>`).join('')}</select></label>
          <label class="check pe__bundle" title="Wybór ilości jako opakowania („2 opakowania · 2 miesiące kuracji”). Same rabaty ustawiasz w Kody rabatowe → Promocje."><input type="checkbox" name="bundles" ${p.bundles ? 'checked' : ''} /> Opakowania kuracyjne (wybór zestawu)</label>
        </div>
        <div class="row3c">
          <label class="field">Cena promocyjna (zł)<input class="input" name="sale_price" value="${zl(p.sale_price)}" inputmode="decimal" placeholder="brak" /></label>
          <label class="field">Promocja od<input class="input" name="sale_start" type="datetime-local" value="${loc(p.sale_start)}" /></label>
          <label class="field">Promocja do<input class="input" name="sale_end" type="datetime-local" value="${loc(p.sale_end)}" /></label>
        </div>
        <div class="row3c">
          <label class="field">Ilość w opakowaniu (do ceny jednostkowej)<input class="input" name="unit_value" value="${p.unit_value ?? ''}" inputmode="decimal" placeholder="np. 10" /></label>
          <label class="field">Jednostka<select class="input" name="unit_measure"><option value="">-</option>${['ml', 'l', 'g', 'kg', 'szt'].map((u) => `<option ${p.unit_measure === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
          <div class="field"><span>Najniższa cena z 30 dni</span><strong class="pe__low">${lowest30 !== null ? pln(lowest30) : '-'}</strong></div>
        </div>
        ${history.length ? `<details class="manual"><summary>Historia cen (${history.length})</summary><ul class="items">${history.map((h: any) => `<li><span>${date(h.changed_at)}</span><span>${pln(h.price)}${h.sale_price !== null ? ` → promocja ${pln(h.sale_price)}` : ''}</span></li>`).join('')}</ul></details>` : ''}
      </div>

      <div class="sec"><h3 class="sec__t">Opisy</h3>
        <label class="field">Opis krótki (przy cenie, na listach)<textarea class="input" name="short_description" rows="2" maxlength="300">${esc(p.short_description || '')}</textarea></label>
        <label class="field">Wyróżniki (każdy w nowej linii, maks. 10)<textarea class="input" name="highlights" rows="3">${esc((p.highlights || []).join('\n'))}</textarea></label>
        <label class="field">Opis długi <span class="muted">(## nagłówek, **pogrubienie**, - lista, [link](https://…))</span><textarea class="input mono" name="description" rows="10">${esc(p.description || '')}</textarea></label>
        <label class="field">Stosowanie <span class="muted">(osobna sekcja na stronie produktu; formatowanie jak w opisie; puste = sekcja ukryta)</span><textarea class="input mono" name="how_to_use" rows="6" placeholder="- 1-2 krople do każdego oka, 2 razy dziennie&#10;- Po otwarciu zużyj w ciągu 30 dni">${esc(p.how_to_use || '')}</textarea></label>
      </div>

      <div class="sec"><h3 class="sec__t">SEO</h3>
        <label class="field">Tytuł strony (title) <span class="muted" data-cnt="seo_title">0/60</span><input class="input" name="seo_title" value="${esc(p.seo_title || '')}" maxlength="70" placeholder="${esc(p.name)} | Can-C" /></label>
        <label class="field">Opis (meta description) <span class="muted" data-cnt="seo_description">0/155</span><textarea class="input" name="seo_description" rows="2" maxlength="170">${esc(p.seo_description || '')}</textarea></label>
        <div class="serp"><span class="serp__url">can-c.pl › produkt › ${esc(p.id || 'adres')}</span><span class="serp__title" data-serp-t></span><span class="serp__desc" data-serp-d></span></div>
      </div>

      <div class="sec"><h3 class="sec__t">Magazyn i wysyłka</h3>
        <div class="row3c">
          <label class="field">Stan magazynowy<input class="input" name="stock" type="number" min="0" value="${p.stock}" /></label>
          <label class="field">Alert przy stanie ≤<input class="input" name="low_stock_alert" type="number" min="0" value="${p.low_stock_alert ?? 5}" /></label>
          <label class="field">Waga z opakowaniem (g)<input class="input" name="weight_g" type="number" min="0" value="${p.weight_g ?? ''}" /></label>
        </div>
        <label class="field">Termin realizacji <span class="muted">(pełne zdanie; puste = „Wysyłamy” + czas wysyłki z ustawień sklepu)</span><input class="input" name="lead_time" value="${esc(p.lead_time || '')}" maxlength="120" placeholder="np. Wysyłka do 14 dni roboczych." /></label>
        <label class="field">Dostępność<select class="input" name="availability">
          <option value="" ${!p.availability ? 'selected' : ''}>Według stanu (0 = niedostępny)</option>
          ${Object.entries(AVAIL).map(([k, v]) => `<option value="${k}" ${p.availability === k ? 'selected' : ''}>${v} - ustawione ręcznie</option>`).join('')}
        </select></label>
      </div>

      <div class="sec"><h3 class="sec__t">Google Merchant Center</h3>
        <div class="row2">
          <label class="field">EAN / GTIN<input class="input" name="ean" value="${esc(p.ean || '')}" inputmode="numeric" /></label>
          <label class="field">MPN (kod producenta)<input class="input" name="mpn" value="${esc(p.mpn || '')}" /></label>
        </div>
        <div class="row2">
          <label class="field">Marka<input class="input" name="brand" value="${esc(p.brand || 'Can-C')}" /></label>
          <label class="field">Stan produktu<select class="input" name="condition"><option value="new" ${p.condition === 'new' ? 'selected' : ''}>Nowy</option><option value="refurbished" ${p.condition === 'refurbished' ? 'selected' : ''}>Odnowiony</option><option value="used" ${p.condition === 'used' ? 'selected' : ''}>Używany</option></select></label>
        </div>
        <label class="field">Kategoria Google (ID lub ścieżka)<input class="input" name="google_category" value="${esc(p.google_category || '')}" placeholder="np. 491 - Zdrowie i uroda > Opieka zdrowotna" /></label>
        <p class="muted small">Wymagane przez Google: nazwa, opis, zdjęcie, cena, dostępność, marka oraz GTIN (albo MPN). Bez GTIN i MPN feed wyśle „identifier_exists: no”.</p>
      </div>

      <div class="sec"><h3 class="sec__t">Często kupowane razem</h3>
        <div class="rel">${productsList.filter((x) => x.id !== p.id).map((x) => `<label class="check"><input type="checkbox" name="related" value="${esc(x.id)}" ${(p.related_ids || []).includes(x.id) ? 'checked' : ''} /> ${esc(x.name)}</label>`).join('') || '<span class="muted">Brak innych produktów.</span>'}</div>
      </div>

      <div class="actions"><button class="btn">Zapisz produkt</button></div>
    </form>`;

  const f = body.querySelector<HTMLFormElement>('[data-pe]')!;
  const imgsEl = f.querySelector<HTMLElement>('[data-imgs]')!;
  const renderImgs = () => {
    imgsEl.innerHTML = images.map((im, i) => `
      <div class="img-item">
        <img src="${esc(im.url)}" alt="" />
        <input class="input sm" data-alt="${i}" value="${esc(im.alt)}" placeholder="opis zdjęcia (alt)" />
        <div class="img-item__btns">
          <button type="button" class="icon-btn" data-up="${i}" aria-label="W górę" ${i === 0 ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="m6 14 6-6 6 6" /></svg></button>
          <button type="button" class="icon-btn" data-down="${i}" aria-label="W dół" ${i === images.length - 1 ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="m6 10 6 6 6-6" /></svg></button>
          <button type="button" class="icon-btn" data-del="${i}" aria-label="Usuń"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg></button>
        </div>
        <button type="button" class="btn btn--outline btn--sm" data-nobg="${i}" title="Zamienia białe tło na przezroczyste - zdjęcie dobrze wygląda w trybie ciemnym">Usuń białe tło</button>
        ${i === 0 ? '<span class="badge-inline">główne</span>' : ''}
      </div>`).join('') || '<p class="muted">Brak zdjęć.</p>';
    imgsEl.querySelectorAll<HTMLInputElement>('[data-alt]').forEach((el) => el.addEventListener('input', () => { images[Number(el.dataset.alt)].alt = el.value; }));
    imgsEl.querySelectorAll<HTMLButtonElement>('[data-up]').forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.up); [images[i - 1], images[i]] = [images[i], images[i - 1]]; renderImgs(); }));
    imgsEl.querySelectorAll<HTMLButtonElement>('[data-down]').forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.down); [images[i + 1], images[i]] = [images[i], images[i + 1]]; renderImgs(); }));
    imgsEl.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => b.addEventListener('click', () => { images.splice(Number(b.dataset.del), 1); renderImgs(); }));
    imgsEl.querySelectorAll<HTMLButtonElement>('[data-nobg]').forEach((b) => b.addEventListener('click', () => removeBg([Number(b.dataset.nobg)])));
  };
  // Nowa wersja zdjęcia trafia do Storage obok starej; w produkcie podmieniamy adres (stary plik zostaje - można wrócić)
  const removeBg = async (idx: number[]) => {
    const slug = (f.elements.namedItem('id') as HTMLInputElement).value || 'produkt';
    let ok = 0;
    for (const i of idx) {
      try {
        toast(`Usuwanie tła ze zdjęcia ${i + 1}…`);
        const fd = new FormData(); fd.append('file', fileFrom(await removeLightBackground(images[i].url))); fd.append('product', slug);
        const r = await fetch('/api/admin/upload', { method: 'POST', body: fd });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || 'Błąd wysyłania zdjęcia.');
        images[i] = { ...images[i], url: d.url }; ok++;
        renderImgs();
      } catch (err) { toast(`Zdjęcie ${i + 1}: ${(err as Error).message}`, true); }
    }
    if (ok) toast(`Gotowe (${ok}). Sprawdź podgląd i zapisz produkt.`);
  };
  f.querySelector('[data-nobg-all]')?.addEventListener('click', () => removeBg(images.map((_, i) => i)));
  renderImgs();
  f.querySelector<HTMLInputElement>('[data-upload]')!.addEventListener('change', async (e) => {
    const files = [...((e.target as HTMLInputElement).files || [])];
    const slug = (f.elements.namedItem('id') as HTMLInputElement).value || 'produkt';
    for (const file of files) {
      try {
        toast(`Wysyłanie ${file.name}…`);
        const fd = new FormData(); fd.append('file', fileFrom(await shrink(file))); fd.append('product', slug);
        const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || 'Błąd wysyłania zdjęcia.');
        images.push({ url: d.url, alt: (f.elements.namedItem('name') as HTMLInputElement).value });
        renderImgs();
      } catch (err) { toast((err as Error).message, true); }
    }
    toast('Zdjęcia dodane - pamiętaj o zapisaniu produktu.');
    (e.target as HTMLInputElement).value = '';
  });

  // Liczniki SEO i podgląd w Google
  const seo = () => {
    const t = (f.elements.namedItem('seo_title') as HTMLInputElement).value || `${(f.elements.namedItem('name') as HTMLInputElement).value} | Can-C`;
    const d = (f.elements.namedItem('seo_description') as HTMLTextAreaElement).value || (f.elements.namedItem('short_description') as HTMLTextAreaElement).value;
    f.querySelector('[data-serp-t]')!.textContent = t; f.querySelector('[data-serp-d]')!.textContent = d;
    const c1 = f.querySelector('[data-cnt="seo_title"]')!, c2 = f.querySelector('[data-cnt="seo_description"]')!;
    const l1 = (f.elements.namedItem('seo_title') as HTMLInputElement).value.length, l2 = (f.elements.namedItem('seo_description') as HTMLTextAreaElement).value.length;
    c1.textContent = `${l1}/60`; c1.classList.toggle('err', l1 > 60); c2.textContent = `${l2}/155`; c2.classList.toggle('err', l2 > 155);
  };
  ['seo_title', 'seo_description', 'name', 'short_description'].forEach((n) => (f.elements.namedItem(n) as HTMLElement).addEventListener('input', seo));
  seo();

  f.querySelector('[data-dup]')?.addEventListener('click', async () => {
    try { const r = await api('/api/admin/products', { action: 'duplicate', id: p.id }); toast('Utworzono kopię (ukrytą).'); loadProducts(); openProduct(r.id); }
    catch (err) { toast((err as Error).message, true); }
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const v = (n: string) => String(fd.get(n) ?? '');
    const toIso = (x: string) => (x ? new Date(x).toISOString() : '');
    const payload = {
      action: 'save', isNew: !id, id: v('id'), name: v('name'), subtitle: v('subtitle'), active: fd.get('active') !== null, tags: v('tags'), sort_order: v('sort_order'),
      price: v('price'), vat_rate: Number(v('vat_rate')), bundles: fd.get('bundles') !== null, sale_price: v('sale_price'), sale_start: toIso(v('sale_start')), sale_end: toIso(v('sale_end')),
      unit_value: v('unit_value'), unit_measure: v('unit_measure'), short_description: v('short_description'), highlights: v('highlights').split('\n'), description: v('description'),
      how_to_use: v('how_to_use'), lead_time: v('lead_time'),
      seo_title: v('seo_title'), seo_description: v('seo_description'), stock: Number(v('stock')), low_stock_alert: v('low_stock_alert'), weight_g: v('weight_g'), availability: v('availability'),
      ean: v('ean'), mpn: v('mpn'), brand: v('brand'), condition: v('condition'), google_category: v('google_category'),
      related_ids: fd.getAll('related').map(String), images,
    };
    try { const r = await api('/api/admin/products', payload); toast(r.notified ? `Zapisano produkt i wysłano ${r.notified} powiadomień o dostępności.` : 'Zapisano produkt.'); loadProducts(); openProduct(r.id, false); }
    catch (err) { toast((err as Error).message, true); }
  });
}
$('[data-new-product]').addEventListener('click', () => openProduct(null));
