// Karuzela w hero strony głównej: co N sekund zmienia się etykieta, H1, opis, zdjęcie i przyciski.
// Treść slajdów: /admin → Strony → Strona główna → „Hero” (slajd 1) i „Hero - kolejne slajdy” (2-4).
// Dostępność: pauza po najechaniu i przy fokusie, przycisk pauzy, kropki do przełączania; przy „ogranicz ruch”
// slajdy nie zmieniają się same (można je przełączać ręcznie).
import { typoSafe } from './typography';

type Slide = {
  kicker: string; h1: string[]; lead: string; alt: string;
  img: { src: string; srcset: string; msrc: string; msrcset: string } | null;
  c1: { label: string; href: string }; c2: { label: string; href: string };
};

const dataEl = document.getElementById('hero-slides');
const hero = document.querySelector<HTMLElement>('.hero');
if (dataEl && hero) init(JSON.parse(dataEl.textContent || '{}'));

function init(cfg: { interval: number; slides: Slide[] }) {
  const slides = cfg.slides || [];
  if (slides.length < 2) return;
  const section = hero!.closest('section') || hero!;
  const nav = document.querySelector<HTMLElement>('[data-hs-nav]')!;
  const dots = Array.from(nav.querySelectorAll<HTMLButtonElement>('[data-hs-go]'));
  const pauseBtn = nav.querySelector<HTMLButtonElement>('[data-hs-pause]')!;
  const $ = <T extends HTMLElement>(k: string) => section.querySelector<T>(`[data-hs="${k}"]`)!;
  const kicker = $('kicker'), h1 = $('h1'), lead = $('lead'), c1 = $<HTMLAnchorElement>('c1'), c1l = $('c1-label'), c2 = $<HTMLAnchorElement>('c2');
  const imgs = Array.from(section.querySelectorAll<HTMLImageElement>('.hero-fill'));
  const mimg = section.querySelector<HTMLImageElement>('.hero-mobile-img');
  const fading = [kicker, h1, lead, c1, c2, section.querySelector<HTMLElement>('.hero-art'), mimg].filter(Boolean) as HTMLElement[];
  fading.forEach((el) => el.classList.add('hs-fade'));

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ms = Math.max(4, cfg.interval || 10) * 1000;
  nav.style.setProperty('--hs-time', `${ms / 1000}s`);
  let cur = 0, timer = 0, hovered = false, userPaused = reduced, busy = false;
  if (reduced) nav.classList.add('is-static');

  const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const h1Html = (lines: string[]) => lines.map((l, i) => i === 0
    ? `<span style="display:block">${typoSafe(esc(l))}</span>`
    : `<span class="hero-h1__2"><span class="hero-dash" aria-hidden="true"></span>${typoSafe(esc(l))}</span>`).join('');

  // Wcześniejsze wczytanie zdjęcia następnego slajdu - bez pustego mignięcia przy zmianie
  const preload = (s: Slide) => new Promise<void>((res) => {
    if (!s.img) return res();
    const i = new Image();
    i.decoding = 'async';
    i.srcset = s.img.srcset; i.sizes = '100vw'; i.src = s.img.src;
    i.onload = i.onerror = () => res();
    setTimeout(res, 2500);
  });

  const apply = (s: Slide) => {
    kicker.textContent = s.kicker; kicker.hidden = !s.kicker;
    h1.innerHTML = h1Html(s.h1);
    lead.textContent = s.lead; lead.hidden = !s.lead;
    c1.href = s.c1.href; c1l.textContent = s.c1.label;
    c2.href = s.c2.href || '#'; c2.textContent = s.c2.label; c2.hidden = !s.c2.label;
    if (s.img) {
      imgs.forEach((im) => { im.srcset = s.img!.srcset; im.src = s.img!.src; im.alt = ''; });
      if (imgs[0]) imgs[0].alt = s.alt;
      if (mimg) { mimg.srcset = s.img.msrcset; mimg.src = s.img.msrc; }
    }
  };

  const go = async (n: number) => {
    if (busy || n === cur) return;
    busy = true;
    const next = (n + slides.length) % slides.length;
    await preload(slides[next]);
    fading.forEach((el) => el.classList.add('hs-out'));
    await new Promise((r) => setTimeout(r, 450));
    apply(slides[next]);
    cur = next;
    dots.forEach((d, i) => { if (i === cur) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
    // restart animacji paska postępu
    const fill = dots[cur].querySelector<HTMLElement>('.hs-dot__fill');
    if (fill) { fill.style.animation = 'none'; void fill.offsetWidth; fill.style.animation = ''; }
    requestAnimationFrame(() => fading.forEach((el) => el.classList.remove('hs-out')));
    busy = false;
    schedule();
  };

  const schedule = () => {
    clearTimeout(timer);
    const paused = userPaused || hovered;
    nav.classList.toggle('is-paused', paused);
    if (!paused) timer = window.setTimeout(() => go(cur + 1), ms);
  };

  dots.forEach((d, i) => d.addEventListener('click', () => go(i)));
  pauseBtn.addEventListener('click', () => {
    userPaused = !userPaused;
    pauseBtn.setAttribute('aria-pressed', String(userPaused));
    const en = document.documentElement.lang === 'en';
    pauseBtn.setAttribute('aria-label', userPaused ? (en ? 'Resume the slideshow' : 'Wznów zmianę slajdów') : (en ? 'Pause the slideshow' : 'Zatrzymaj zmianę slajdów'));
    if (!userPaused) nav.classList.remove('is-static');
    schedule();
  });
  // Pauza, gdy klient czyta (kursor na hero) albo przechodzi klawiaturą po przyciskach
  section.addEventListener('mouseenter', () => { hovered = true; schedule(); });
  section.addEventListener('mouseleave', () => { hovered = false; schedule(); });
  section.addEventListener('focusin', () => { hovered = true; schedule(); });
  section.addEventListener('focusout', () => { hovered = false; schedule(); });
  // Karta w tle: bez zmian slajdów
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else schedule(); });

  schedule();
}
