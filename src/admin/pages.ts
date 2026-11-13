// Panel admina - moduł „pages” (wydzielony z admin/index.astro).
import { $, api, date, esc, toast } from './core';
import { fileFrom, shrink } from './products';

// ---------- Strony (CMS) ----------
export const PAGES_META: Record<string, any> = {
  home: { label: 'Strona główna', previewHref: '/', sections: [
    { key: 'home.hero', label: 'Hero (baner)', schema: {
      kicker: { type: 'text', label: 'Kicker (etykieta nad H1, puste = ukryj)' },
      h1: { type: 'text', label: 'Nagłówek H1', hint: 'Druga linia po znaku |, np. „Krople do oczu Can-C | z N-acetylokarnozyną” - druga linia jest wcięta.' },
      lead: { type: 'textarea', label: 'Tekst lead' },
      cta_primary_label: { type: 'text', label: 'Przycisk główny - etykieta' },
      cta_primary_href: { type: 'url', label: 'Przycisk główny - link' },
      cta_secondary_label: { type: 'text', label: 'Przycisk drugorzędny - etykieta (puste = ukryj)' },
      cta_secondary_href: { type: 'url', label: 'Przycisk drugorzędny - link' },
      image_url: { type: 'image', label: 'Zdjęcie w hero', hint: 'Wypełnia cały kształt baneru (szare pola). Poziome, min. 2000 px szerokości; najważniejszy motyw po prawej stronie. Na telefonie pokazuje się pod tekstem w proporcji 4:3.' },
      image_alt: { type: 'text', label: 'Alt zdjęcia' },
      trust_boxes: { type: 'list', label: 'Boksy pod banerem (3 linie: „liczba | opis”)', hint: 'Np. „0 zł | InPost i DPD”. Ikony wg kolejności: dostawa, zwrot, płatność.' },
    }},
    { key: 'home.products', label: 'Produkty (nagłówek sekcji)', schema: {
      h2: { type: 'text', label: 'Nagłówek', hint: '| = nowa linia' },
      lead: { type: 'textarea', label: 'Tekst pod nagłówkiem (puste = ukryj)' },
      link_label: { type: 'text', label: 'Link po prawej - etykieta (puste = ukryj)' },
      link_href: { type: 'url', label: 'Link po prawej - adres' },
    }},
    { key: 'home.benefits', label: 'Korzyści (3 kolumny: karta · zdjęcie · lista)', schema: {
      h2: { type: 'text', label: 'Prawa kolumna - nagłówek sekcji' },
      lead: { type: 'textarea', label: 'Prawa kolumna - tekst pod nagłówkiem', hint: '1-2 zdania; puste = bez tekstu' },
      items: { type: 'list', label: 'Prawa kolumna - punkty (jedna linia = jeden punkt)', hint: '**tekst** = pogrubienie. Najlepiej 4-6 punktów.' },
      cta_label: { type: 'text', label: 'Prawa kolumna - przycisk, etykieta (puste = ukryj)' },
      cta_href: { type: 'url', label: 'Prawa kolumna - przycisk, link' },
      image_url: { type: 'image', label: 'Środkowa kolumna - duże zdjęcie', hint: 'Pionowe, min. 900 px wysokości. Górny lewy róg jest mocno zaokrąglony - ważny motyw nie przy tym rogu.' },
      image_alt: { type: 'text', label: 'Środkowa kolumna - alt zdjęcia' },
      card_image_url: { type: 'image', label: 'Lewa karta - zdjęcie w łuku', hint: 'Np. opakowanie kropli; kadr poziomy lub kwadratowy.' },
      card_image_alt: { type: 'text', label: 'Lewa karta - alt zdjęcia' },
      card_title: { type: 'text', label: 'Lewa karta - tytuł', hint: 'Np. „Z N-acetylokarnozyną”' },
      card_text: { type: 'textarea', label: 'Lewa karta - opis (2-3 zdania)' },
      card_items: { type: 'list', label: 'Lewa karta - punkty (jedna linia = jeden punkt)', hint: 'Najlepiej 3 krótkie punkty. Puste = pierwsze 3 punkty z prawej kolumny.' },
    }},
    { key: 'home.bundles', label: '„Kupuj więcej, płać mniej” (zestawy)', schema: {
      h2: { type: 'text', label: 'Nagłówek', hint: '| = nowa linia, np. „Kupuj więcej, | płać mniej”' },
      lead: { type: 'textarea', label: 'Tekst po prawej (puste = ukryj)' },
      badge: { type: 'text', label: 'Etykieta polecanego zestawu', hint: 'Np. „Polecany” - rabat w % dopisuje się sam' },
      perks: { type: 'list', label: 'Dodatkowe punkty na każdej karcie (jedna linia = jeden punkt)', hint: 'Np. „Darmowa dostawa”. Punkty „X miesięcy kuracji” i „Oszczędzasz X%” liczą się same z promocji.' },
      button: { type: 'text', label: 'Tekst przycisku na kartach' },
    }},
    { key: 'home.why', label: '„Dlaczego Can-C” (mozaika: punkty po lewej, grafika i tekst po prawej)', schema: {
      h2: { type: 'text', label: 'Prawa kolumna - nagłówek', hint: '| = nowa linia' },
      lead: { type: 'textarea', label: 'Prawa kolumna - tekst (puste = ukryj)' },
      link_label: { type: 'text', label: 'Prawa kolumna - link, etykieta (puste = ukryj)' }, link_href: { type: 'url', label: 'Prawa kolumna - link, adres' },
      image_url: { type: 'image', label: 'Prawa kolumna - grafika', hint: 'Pionowa albo kwadratowa; prawy górny róg jest mocno zaokrąglony.' },
      image_alt: { type: 'text', label: 'Alt grafiki' },
      p1_title: { type: 'text', label: 'Punkt 01 (wyróżniony) - tytuł' }, p1_text: { type: 'textarea', label: 'Punkt 01 - tekst' },
      p2_title: { type: 'text', label: 'Punkt 02 - tytuł' }, p2_text: { type: 'textarea', label: 'Punkt 02 - tekst' },
      p3_title: { type: 'text', label: 'Punkt 03 - tytuł' }, p3_text: { type: 'textarea', label: 'Punkt 03 - tekst' },
      p4_title: { type: 'text', label: 'Punkt 04 (na całą szerokość) - tytuł' }, p4_text: { type: 'textarea', label: 'Punkt 04 - tekst' },
    }},
    { key: 'home.reviews', label: 'Opinie na stronie głównej', schema: {
      h2: { type: 'text', label: 'Nagłówek sekcji' },
      cta_text: { type: 'text', label: 'Karta „Napisz opinię” - tekst' },
      cta_label: { type: 'text', label: 'Karta „Napisz opinię” - przycisk (puste = ukryj)' },
      cta_href: { type: 'url', label: 'Karta „Napisz opinię” - link' },
      items: { type: 'array', label: 'Opinie zapasowe JSON [{quote, author}]', hint: 'Pokazywane tylko, gdy w bazie nie ma żadnej zatwierdzonej opinii.' },
    }},
    { key: 'home.k9', label: 'Sekcja Can-C K9', schema: {
      tag: { type: 'text', label: 'Etykieta (np. „DLA PSA")' }, h2: { type: 'text', label: 'Nagłówek' },
      lead: { type: 'textarea', label: 'Tekst lead' }, cta_label: { type: 'text', label: 'Przycisk - etykieta' },
      cta_href: { type: 'url', label: 'Przycisk - link' },
      image_url: { type: 'image', label: 'Zdjęcie' }, image_alt: { type: 'text', label: 'Alt' },
    }},
    { key: 'home.faq', label: 'FAQ na stronie głównej (nagłówek)', schema: {
      h2: { type: 'text', label: 'Nagłówek', hint: '| = nowa linia. Pytania wybierasz w zakładce FAQ (pole „na głównej”).' },
      link_label: { type: 'text', label: 'Link - etykieta (puste = ukryj)' },
      link_href: { type: 'url', label: 'Link - adres' },
    }},
    { key: 'home.newsletter', label: 'Newsletter (sekcja zapisu)', schema: {
      h2: { type: 'text', label: 'Nagłówek', hint: '| = nowa linia' },
      text: { type: 'textarea', label: 'Tekst pod nagłówkiem (puste = ukryj)' },
    }},
  ]},
  faq: { label: 'FAQ', previewHref: '/faq/', sections: [] },
  about: { label: 'O nas', previewHref: '/o-nas/', sections: [
    { key: 'about.intro', label: 'Lead strony', schema: { lead: { type: 'textarea', label: 'Tekst lead' } } },
    { key: 'about.who', label: '„Kim jesteśmy"', schema: {
      h2: { type: 'text', label: 'Nagłówek' },
      paragraphs: { type: 'list', label: 'Akapity (jedna linia = jeden akapit)', hint: 'Token {company} = nazwa firmy' },
    }},
    { key: 'about.promise', label: '„Na co możesz liczyć"', schema: {
      h2: { type: 'text', label: 'Nagłówek' },
      items: { type: 'list', label: 'Elementy listy', hint: 'Token {hours} = godziny obsługi' },
    }},
  ]},
  how_to_use: { label: 'Stosowanie', previewHref: '/stosowanie/', sections: [
    { key: 'how_to_use.intro', label: 'Nagłówek strony', schema: { h1: { type: 'text', label: 'Nagłówek H1' }, lead: { type: 'textarea', label: 'Tekst lead' } } },
    { key: 'how_to_use.dosage', label: 'Dawkowanie', schema: { h2: { type: 'text', label: 'Nagłówek' }, note: { type: 'textarea', label: 'Notatka ostrzegawcza' }, doses: { type: 'array', label: 'Dawki JSON [{num, title, desc}]' } } },
    { key: 'how_to_use.opening', label: 'Otwieranie fiolki', schema: {
      h2: { type: 'text', label: 'Nagłówek' },
      lead: { type: 'textarea', label: 'Lead' },
      steps: { type: 'list', label: 'Kroki (jedna linia = jeden krok)' },
      step_images: { type: 'images', count: 4, itemLabel: 'Krok', label: 'Ilustracje kroków', hint: 'Bez ilustracji na stronie jest szare tło zastępcze. Grafika jest pokazywana w całości.' },
    },},
    { key: 'how_to_use.applying', label: 'Zakraplanie', schema: {
      h2: { type: 'text', label: 'Nagłówek' },
      lead: { type: 'textarea', label: 'Tekst pod nagłówkiem (puste = ukryj)' },
      steps: { type: 'array', label: 'Kroki JSON [{title, desc}]' },
      image_url: { type: 'image', label: 'Zdjęcie przy sekcji zakraplania' },
      image_alt: { type: 'text', label: 'Alt zdjęcia' },
    },},
  ]},
  product: { label: 'Karta produktu', previewHref: '/produkt/krople-can-c/', sections: [
    { key: 'product.original', label: 'Oryginalny produkt (sekcja pod zakupem)', schema: {
      products: { type: 'list', label: 'Na których produktach (identyfikatory, jedna linia = jeden)', hint: 'Np. krople-can-c. Puste = na wszystkich.' },
      badge: { type: 'text', label: 'Etykieta nad nagłówkiem (puste = ukryj)' },
      h2: { type: 'text', label: 'Nagłówek' },
      lead: { type: 'textarea', label: 'Tekst pod nagłówkiem' },
      items: { type: 'list', label: 'Jak rozpoznać oryginał (jedna linia = jeden punkt)' },
      image_url: { type: 'image', label: 'Zdjęcie (np. opakowanie z oznaczeniem IVP)', hint: 'Najlepiej zbliżenie oznaczenia na pudełku; kadr poziomy lub kwadratowy.' },
      image_alt: { type: 'text', label: 'Alt zdjęcia' },
      link_label: { type: 'text', label: 'Link - etykieta (puste = ukryj)' },
      link_href: { type: 'url', label: 'Link - adres' },
    }},
  ]},
  footer: { label: 'Stopka', previewHref: '/', sections: [
    { key: 'footer.columns', label: 'Kolumny linków', schema: { columns: { type: 'array', label: 'Kolumny JSON [{title, links:[{href,label}]}]' } } },
    { key: 'footer.badges', label: 'Metody płatności / dostawy', schema: { items: { type: 'list', label: 'Elementy (jedna linia = jeden element)' } } },
  ]},
};

// Sekcje, których nie da się wyłączyć (nagłówki stron, stopka) - pozostałe mają przełącznik „Sekcja widoczna”
export const ALWAYS_ON = new Set(['how_to_use.intro', 'about.intro', 'footer.columns', 'footer.badges']);
// Pola bez regulacji rozmiaru (linki, alt, etykiety przycisków)
export const NO_SIZE = /(href|_alt|_label|button|badge|^cta_label)$/;
export const pageSelect = $<HTMLSelectElement>('[data-page-select]');
export const pagesList = $<HTMLElement>('[data-pages-list]');
export const pagePreview = $<HTMLAnchorElement>('[data-page-preview]');

export async function loadPages(page = pageSelect?.value ?? 'home') {
  if (!pagesList) return;
  pagesList.innerHTML = '<p class="muted">Ładowanie…</p>';
  if (pagePreview) pagePreview.href = PAGES_META[page]?.previewHref ?? '/';
  // „Dodaj pytanie” w pasku obok „Podgląd strony” - tylko dla FAQ
  const faqAdd = document.querySelector<HTMLButtonElement>('[data-faq-add]');
  if (faqAdd) faqAdd.hidden = page !== 'faq';
  try {
    const { rows } = await api(`/api/admin/pages?page=${encodeURIComponent(page)}`);
    renderPageSections(page, rows);
  } catch (e) { pagesList.innerHTML = `<p class="err">${esc((e as Error).message)}</p>`; }
}

// Pole obrazu: podgląd + „Wybierz plik” / „Usuń”; adres trzymany w ukrytym polu formularza sekcji
export const IMG_ACCEPT = '.svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp';
export function imgSlot(name: string, url: string, caption = ''): string {
  return `<div class="img-slot" data-img-slot>
    ${caption ? `<span class="img-slot__cap">${esc(caption)}</span>` : ''}
    <input type="hidden" name="${name}" value="${esc(url)}" />
    <div class="img-slot__prev">${url ? `<img src="${esc(url)}" alt="" />` : ''}<span class="muted small" data-img-empty ${url ? 'hidden' : ''}>Brak zdjęcia</span></div>
    <div class="actions">
      <label class="btn btn--sm">${url ? 'Zmień plik' : 'Wybierz plik'}<input type="file" accept="${IMG_ACCEPT}" data-img-file hidden /></label>
      <button type="button" class="btn btn--outline btn--sm" data-img-remove ${url ? '' : 'hidden'}>Usuń</button>
    </div>
  </div>`;
}

export function fieldHtml(fk: string, schema: any, value: unknown, size?: number | null): string {
  const val = value === null || value === undefined ? '' : value;
  // Rozmiar tekstu (px) dla pól tekstowych - puste = jak w projekcie
  const sizable = ['text', 'textarea', 'markdown', 'list', undefined].includes(schema.type) && !NO_SIZE.test(fk);
  const sz = sizable ? `<span class="fsz" title="Rozmiar tekstu w px (puste = jak w projekcie). Na telefonie duże rozmiary same się zmniejszają."><input class="input" type="number" name="${fk}__size" min="10" max="160" step="1" value="${size ?? ''}" placeholder="auto" aria-label="Rozmiar tekstu ${esc(schema.label)} (px)" /> px</span>` : '';
  const hint = (schema.hint ? `<span class="muted small">${esc(schema.hint)}</span>` : '') + sz;
  switch (schema.type) {
    case 'textarea': case 'markdown':
      return `<label class="field">${esc(schema.label)}${hint}<textarea class="input mono" name="${fk}" rows="4">${esc(String(val))}</textarea></label>`;
    case 'list':
      return `<label class="field">${esc(schema.label)}${hint}<textarea class="input mono" name="${fk}" rows="5">${esc(Array.isArray(val) ? (val as string[]).join('\n') : String(val))}</textarea></label>`;
    case 'array':
      return `<label class="field">${esc(schema.label)}${hint}<textarea class="input mono" name="${fk}" rows="8">${esc(typeof val === 'string' ? val : JSON.stringify(val, null, 2))}</textarea></label>`;
    case 'image':
      return `<div class="field">${esc(schema.label)}${hint}${imgSlot(fk, String(val))}</div>`;
    case 'images': {
      const arr = Array.isArray(val) ? (val as (string | null)[]) : [];
      const n = schema.count || 4;
      return `<div class="field">${esc(schema.label)}${hint}<div class="img-grid">${Array.from({ length: n }, (_, i) => imgSlot(`${fk}__${i}`, arr[i] || '', `${schema.itemLabel || 'Zdjęcie'} ${i + 1}`)).join('')}</div></div>`;
    }
    default:
      return `<label class="field">${esc(schema.label)}${hint}<input class="input" name="${fk}" type="text" value="${esc(String(val))}" /></label>`;
  }
}

export function collectData(form: HTMLFormElement, schema: Record<string, any>): Record<string, unknown> {
  const fd = new FormData(form);
  const data: Record<string, unknown> = {};
  // Ustawienia sekcji: widoczność i rozmiary tekstów
  const vis = form.querySelector<HTMLInputElement>('[name="__visible"]');
  if (vis) data.__hidden = !vis.checked;
  const sizes: Record<string, number> = {};
  for (const fk of Object.keys(schema)) {
    const n = Math.round(Number(fd.get(`${fk}__size`)));
    if (n >= 10 && n <= 160) sizes[fk] = n;
  }
  if (Object.keys(sizes).length) data.__sizes = sizes;
  for (const [fk, s] of Object.entries(schema)) {
    const raw = String(fd.get(fk) ?? '');
    switch (s.type) {
      case 'list': data[fk] = raw.split('\n').map((x: string) => x.trim()).filter(Boolean); break;
      case 'array': try { data[fk] = JSON.parse(raw); } catch { data[fk] = raw; } break;
      case 'images': data[fk] = Array.from({ length: s.count || 4 }, (_, i) => String(fd.get(`${fk}__${i}`) ?? '') || null); break;
      default: data[fk] = raw; break;
    }
  }
  return data;
}

export function renderPageSections(page: string, rows: any[]) {
  const meta = PAGES_META[page];
  if (!meta || !pagesList) return;
  const rowMap = Object.fromEntries(rows.map((r: any) => [r.key, r]));

  if (page === 'faq') {
    const cats: Record<string, string> = { produkt: 'Produkt', stosowanie: 'Stosowanie', zamowienia: 'Zamówienia i dostawa', zwroty: 'Płatności i zwroty' };
    pagesList.innerHTML = `<div class="faq-cms">
      <p class="muted small" style="margin:0">Edytuj pytania i odpowiedzi. Kolejność: mniejsza liczba = wyżej. Zmiany widoczne po zapisie (do minuty).</p>
      <div data-faq-list>
        ${rows.map((r) => `<details class="faq-cms__item" data-faq-key="${esc(r.key)}">
          <summary class="faq-cms__q">
            <span class="faq-cms__label">${esc(r.data.q || '(bez pytania)')}</span>
            <span class="pill">${esc(cats[r.data.cat] || r.data.cat || '')}</span>
            ${r.data.home ? '<span class="pill pill--ok">Na głównej</span>' : ''}${r.data.__hidden ? '<span class="pill pill--warn">Ukryte</span>' : ''}
          </summary>
          <form class="faq-cms__form">
            <div class="row2">
              <label class="field">Kategoria<select class="input" name="cat">${Object.entries(cats).map(([id, lbl]) => `<option value="${id}" ${r.data.cat===id?'selected':''}>${lbl}</option>`).join('')}</select></label>
              <label class="check faq-cms__check"><input type="checkbox" name="home" ${r.data.home?'checked':''} /> Pokaż na stronie głównej</label>
            </div>
            <div class="row2">
              <label class="field">Kolejność<input class="input" type="number" name="sort_order" value="${esc(r.sort_order ?? '')}" min="0" max="9999" /></label>
              <label class="check faq-cms__check"><input type="checkbox" name="visible" ${r.data.__hidden ? '' : 'checked'} /> Pytanie widoczne</label>
            </div>
            <label class="field">Pytanie<input class="input" name="q" value="${esc(r.data.q||'')}" required /></label>
            <label class="field">Odpowiedź <span class="muted small">(pusta linia = nowy akapit; {shippingTime} = czas wysyłki)</span><textarea class="input mono" name="a" rows="5">${esc(r.data.a||'')}</textarea></label>
            <div class="actions"><button class="btn btn--sm">Zapisz</button><button type="button" class="btn btn--danger btn--sm" data-faq-del>Usuń pytanie</button></div>
          </form>
        </details>`).join('')}
      </div>
    </div>`;
    pagesList.querySelectorAll<HTMLFormElement>('[data-faq-list] .faq-cms__form').forEach((form) => {
      const key = form.closest<HTMLElement>('[data-faq-key]')!.dataset.faqKey!;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const data = { cat: fd.get('cat'), home: fd.get('home') !== null, q: String(fd.get('q')||'').trim(), a: String(fd.get('a')||'').trim(), __hidden: fd.get('visible') === null };
        if (!data.q || !data.a) { toast('Uzupełnij pytanie i odpowiedź.', true); return; }
        try { await api('/api/admin/pages', { key, data, sort_order: Number(fd.get('sort_order')) || 0 }); toast('Zapisano pytanie.'); loadPages('faq'); }
        catch (err) { toast((err as Error).message, true); }
      });
      form.querySelector('[data-faq-del]')?.addEventListener('click', async () => {
        if (!confirm('Usunąć to pytanie? Tej operacji nie można cofnąć.')) return;
        try { await api('/api/admin/pages', { action: 'delete_faq', key }); toast('Usunięto pytanie.'); loadPages('faq'); }
        catch (err) { toast((err as Error).message, true); }
      });
    });
    return;
  }

  pagesList.innerHTML = meta.sections.map((sec: any) => {
    const data = rowMap[sec.key]?.data ?? {};
    const fields = Object.entries(sec.schema).map(([fk, fSchema]: [string, any]) => fieldHtml(fk, fSchema, data[fk], data.__sizes?.[fk])).join('');
    const hidden = data.__hidden === true;
    const missing = !rowMap[sec.key];
    return `<form class="card${hidden ? ' is-off' : ''}" data-page-form="${esc(sec.key)}">
      <div class="card__head"><h2 class="card__title">${esc(sec.label)}</h2>
        <span class="actions">${rowMap[sec.key]?.updated_at ? `<span class="muted small">Zmienione: ${date(rowMap[sec.key].updated_at)}</span>` : ''}
        ${ALWAYS_ON.has(sec.key) ? '' : `<label class="check sec-vis"><input type="checkbox" name="__visible" ${hidden ? '' : 'checked'} /> Sekcja widoczna</label>`}</span></div>
      ${missing ? '<p class="err small">Tej sekcji nie ma jeszcze w bazie - uruchom najnowszy skrypt SQL z paczki (supabase/), inaczej zapis się nie uda.</p>' : ''}
      ${fields}
      <div class="actions"><button class="btn btn--sm">Zapisz sekcję</button></div>
    </form>`;
  }).join('');

  const saveSection = async (form: HTMLFormElement, msg?: string) => {
    const key = form.dataset.pageForm!;
    const sec = meta.sections.find((s: any) => s.key === key)!;
    await api('/api/admin/pages', { key, data: collectData(form, sec.schema) });
    toast(msg || `Zapisano „${sec.label}".`);
  };
  pagesList.querySelectorAll<HTMLFormElement>('[data-page-form]').forEach((form) => {
    // Przełącznik widoczności zapisuje sekcję od razu
    form.querySelector<HTMLInputElement>('[name="__visible"]')?.addEventListener('change', async (e) => {
      const on = (e.target as HTMLInputElement).checked;
      form.classList.toggle('is-off', !on);
      try { await saveSection(form, on ? 'Sekcja włączona.' : 'Sekcja wyłączona - nie pokazuje się na stronie.'); }
      catch (err) { (e.target as HTMLInputElement).checked = !on; form.classList.toggle('is-off', on); toast((err as Error).message, true); }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await saveSection(form); } catch (err) { toast((err as Error).message, true); }
    });
  });

  // Grafiki: wysłanie pliku (zdjęcia zmniejszone do 1600 px WebP, SVG bez zmian) i od razu zapis sekcji - jak logo w Ustawieniach
  pagesList.querySelectorAll<HTMLElement>('[data-img-slot]').forEach((slot) => {
    const form = slot.closest<HTMLFormElement>('[data-page-form]')!;
    const hidden = slot.querySelector<HTMLInputElement>('input[type="hidden"]')!;
    const prev = slot.querySelector<HTMLElement>('.img-slot__prev')!;
    const pick = slot.querySelector<HTMLLabelElement>('label.btn')!;
    const input = slot.querySelector<HTMLInputElement>('[data-img-file]')!;
    const removeBtn = slot.querySelector<HTMLButtonElement>('[data-img-remove]')!;
    const show = (url: string) => {
      hidden.value = url;
      prev.querySelector('img')?.remove();
      if (url) { const im = document.createElement('img'); im.src = url; im.alt = ''; prev.prepend(im); }
      prev.querySelector<HTMLElement>('[data-img-empty]')!.hidden = !!url;
      removeBtn.hidden = !url;
      pick.firstChild!.textContent = url ? 'Zmień plik' : 'Wybierz plik';
    };
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      const before = hidden.value;
      try {
        toast(`Wysyłanie ${file.name}…`);
        const svg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
        const fd = new FormData(); fd.append('file', svg ? file : fileFrom(await shrink(file))); fd.append('product', 'cms');
        const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || 'Błąd wysyłania pliku.');
        show(d.url);
        await saveSection(form, 'Zapisano zdjęcie.');
      } catch (err) { show(before); toast((err as Error).message, true); }
    });
    removeBtn.addEventListener('click', async () => {
      if (!confirm('Usunąć zdjęcie? Na stronie pojawi się szare tło zastępcze.')) return;
      const before = hidden.value;
      try { show(''); await saveSection(form, 'Usunięto zdjęcie.'); }
      catch (err) { show(before); toast((err as Error).message, true); }
    });
  });
}

pageSelect?.addEventListener('change', () => loadPages());
document.querySelector('[data-tab="pages"]')?.addEventListener('click', () => setTimeout(() => loadPages(), 50));

// Nowe pytanie FAQ (przycisk w pasku narzędzi Stron, jeden nasłuch na stałe)
document.querySelector<HTMLButtonElement>('[data-faq-add]')?.addEventListener('click', async () => {
  try {
    const d = await api('/api/admin/pages', { action: 'create_faq' });
    await loadPages('faq');
    const el = pagesList?.querySelector<HTMLDetailsElement>(`[data-faq-key="${d.key}"]`);
    if (el) { el.open = true; el.scrollIntoView({ block: 'center' }); el.querySelector<HTMLInputElement>('[name="q"]')?.focus(); }
    toast('Dodano pytanie - uzupełnij treść i zapisz.');
  } catch (err) { toast((err as Error).message, true); }
});
