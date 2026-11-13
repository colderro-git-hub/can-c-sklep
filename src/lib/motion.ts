// Animacje sklepu: GSAP (ScrollTrigger, SplitText) + Lenis (płynne przewijanie). Bez Reacta.
// Zasady: wszystkie strony sklepu poza koszykiem, zamówieniem i kontem; systemowe „ogranicz ruch” = brak animacji
// i natywne przewijanie; treść jest w HTML od początku - animacja ją tylko odsłania.
// GSAP ładuje się tylko na stronach z animacjami (import dynamiczny); pozostałe strony dostają sam Lenis (kilka kB).
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

const path = location.pathname;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Koszyk, zamówienie i konto: treść rysuje skrypt po wczytaniu danych - animujemy wejście elementów, gdy się pojawią.
const APP = /^\/(zamowienie|koszyk|konto)(\/|$)/.test(path);
// Bez Lenisa tylko formularz zamówienia (mapa paczkomatów i bramka płatności w okienkach - natywne przewijanie pewniejsze)
const NO_SMOOTH = /^\/zamowienie\/?$/.test(path);
const ANIMATED = true;

// Grupy elementów odsłanianych przy przewijaniu (kolejno, z małym opóźnieniem)
const REVEAL_GROUPS = [
  '.hero-bottom > *',
  '.ben > *',
  '.why2__card', '.why2__side > *',
  '.products-grid > *', '.bundles-grid > *',
  '.rv-grid > *', '.home-side > *',
  '.k9-img, .home-split--center > .home-split__main',
  '.cta-box > *',
  '.us-step', '.us-split__l', '.us-sec .h2', '.us-drops',
  '.og > *',
  '.ip-prose > section, .ip-side > *',
  // Sklep
  '.sk-head .p', '.sk-gh', '.sk-grid > *',
  // Karta produktu: tylko sekcje pod blokiem zakupu (zdjęcia, cena i przycisk od razu, bez animacji)
  '.pr-sec', '.pr-also > *', '.pr-rsum',
  // FAQ
  // (lista pytań jako całość - wyszukiwarka FAQ ukrywa i pokazuje pojedyncze pytania)
  '.fq-head__l > :not(h1)', '.fq-search', '.fq-list', '.fq-side > *',
  // Kontakt
  '.kt-head__l > :not(h1)', '.kt-quick > *', '.kt-info', '.kt-form',
  // 404 i newsletter
  '.nf__head > :not(h1)', '.nf__grid > *', '.nlp__state:not([hidden]) > :not(h1)',
];
// Nagłówki H1 wjeżdżające słowami
const SPLIT_H1 = '.hero-h1, .us-hero h1, .ip-head h1, .sk-head h1, .fq-head h1, .kt-head h1, .nf__head h1, .nlp__state:not([hidden]) h1, .pr-title';
const PARALLAX = '.ben__img img, .why2__img img, .k9-img img, .og__img img';

function done() { document.documentElement.classList.add('motion-ready'); }

async function start() {
  if (reduced) { done(); return; }
  const lenisOptions = {
    lerp: 0.1,                 // łagodnie, bez „pływania” strony
    anchors: { offset: -96 },  // linki #kotwica (np. #newsletter, spis treści) - z miejscem na nagłówek
    autoRaf: !ANIMATED, // bez GSAP: Lenis ma własny zegar
    // Przewijane wnętrza (podgląd koszyka, panel menu, mapa paczkomatów) przewijają się natywnie
    prevent: (node: HTMLElement) => Boolean(node.closest?.('[data-lenis-prevent], #hd-panel, .hd__preview, iframe, [class*="furgonetka"]')),
  };
  if (!ANIMATED) {
    if (!NO_SMOOTH) (window as any).__lenis = new Lenis(lenisOptions);
    done();
    return;
  }

  const [{ default: gsap }, { ScrollTrigger }, { SplitText }] = await Promise.all([
    import('gsap'), import('gsap/ScrollTrigger'), import('gsap/SplitText'),
  ]);
  gsap.registerPlugin(ScrollTrigger, SplitText);

  // ---------- Lenis + GSAP na wspólnym zegarze ----------
  if (!NO_SMOOTH) {
    const lenis = new Lenis(lenisOptions);
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time: number) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    (window as any).__lenis = lenis;
  }

  if (APP) { appMotion(gsap, SplitText); done(); return; }

  // ---------- H1 w hero: słowa wjeżdżają od dołu ----------
  document.querySelectorAll<HTMLElement>(SPLIT_H1).forEach((h) => {
    SplitText.create(h, {
      type: 'words', mask: 'words', autoSplit: true,
      onSplit: (self) => gsap.from(self.words, { yPercent: 110, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.06, delay: 0.1 }),
    });
  });

  // ---------- Liczniki w boksach pod hero („14 dni”) ----------
  document.querySelectorAll<HTMLElement>('.trust-box__num').forEach((el) => {
    const m = (el.textContent || '').match(/^(\D*)(\d+)(.*)$/s);
    if (!m || Number(m[2]) <= 1) return;
    const [, pre, num, post] = m;
    const o = { v: 0 };
    gsap.to(o, {
      v: Number(num), duration: 1.2, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
      onUpdate: () => { el.textContent = `${pre}${Math.round(o.v)}${post}`; },
    });
  });

  // ---------- Odsłanianie sekcji ----------
  for (const sel of REVEAL_GROUPS) {
    const els = gsap.utils.toArray<HTMLElement>(sel).filter((el) => !el.closest('.hero-h1'));
    if (!els.length) continue;
    gsap.set(els, { opacity: 0, y: 32 });
    ScrollTrigger.batch(els, {
      start: 'top 88%', once: true,
      onEnter: (batch) => gsap.to(batch, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.1, overwrite: true }),
    });
  }

  // ---------- Paralaksa zdjęć (delikatna; zdjęcie lekko powiększone, żeby nie było widać krawędzi) ----------
  gsap.utils.toArray<HTMLElement>(PARALLAX).forEach((img) => {
    gsap.fromTo(img, { yPercent: -6, scale: 1.12 }, {
      yPercent: 6, scale: 1.12, ease: 'none',
      scrollTrigger: { trigger: img.parentElement, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  });

  // Po wczytaniu fontów i zdjęć wysokości się zmieniają - przelicz pozycje
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true });
  done();
}

// ---------- Koszyk, zamówienie, konto: wejście sekcji, gdy skrypt strony je pokaże ----------
// Sekcje są ukryte (atrybut hidden) do chwili wczytania danych; obserwujemy ich pojawienie się i dopiero wtedy animujemy.
const APP_SPLIT = '.ct__title, .co__title, .ty__state h1, .ac__lhead h1, .ac__hello h1';
const APP_REVEAL = [
  '.steps',
  '.ct__main', '.ct__side > *',
  '.co__grid > *',
  '.ty__head > :not(.ty__state), .ty__state > :not(h1), .ty__hero > :not(.ty__head)',
  '.ac__lcard', '.ac__stats > *', '.ac__chartbox',
];
function appMotion(gsap: any, SplitText: any) {
  const seen = new WeakSet<Element>();
  const shown = (el: HTMLElement) => el.getClientRects().length > 0;
  const animate = () => {
    document.querySelectorAll<HTMLElement>(APP_SPLIT).forEach((h) => {
      if (seen.has(h) || !shown(h)) return;
      seen.add(h);
      SplitText.create(h, { type: 'words', mask: 'words', onSplit: (self: any) => gsap.from(self.words, { yPercent: 110, opacity: 0, duration: 0.8, ease: 'power3.out', stagger: 0.06 }) });
    });
    for (const sel of APP_REVEAL) {
      const els = Array.from(document.querySelectorAll<HTMLElement>(sel)).filter((el) => !seen.has(el) && shown(el));
      if (!els.length) continue;
      els.forEach((el) => seen.add(el));
      gsap.from(els, { opacity: 0, y: 24, duration: 0.7, ease: 'power3.out', stagger: 0.08, clearProps: 'opacity,transform' });
    }
  };
  animate();
  // Pokazanie sekcji (zdjęcie atrybutu hidden, zmiana stanu strony) - animujemy nowo widoczne elementy
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; animate(); });
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
}

start().catch((e) => { console.error('Animacje: ' + (e instanceof Error ? e.message : String(e))); done(); });
