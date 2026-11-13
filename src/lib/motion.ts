// Animacje sklepu: GSAP (ScrollTrigger, SplitText) + Lenis (płynne przewijanie). Bez Reacta.
// Zasady: tylko strony treści (nie karta produktu, koszyk, zamówienie, konto); systemowe „ogranicz ruch” = brak animacji
// i natywne przewijanie; treść jest w HTML od początku - animacja ją tylko odsłania.
// GSAP ładuje się tylko na stronach z animacjami (import dynamiczny); pozostałe strony dostają sam Lenis (kilka kB).
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

const path = location.pathname;
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Strony z animacjami (reszta: tylko płynne przewijanie albo nic)
const ANIMATED = path === '/' || /^\/(stosowanie|o-nas)\/?$/.test(path);
// Bez Lenisa: formularze i strony z mapą/modalami (natywne przewijanie jest tam pewniejsze)
const NO_SMOOTH = /^\/(zamowienie|koszyk|konto)(\/|$)/.test(path);

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
];
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

  // ---------- H1 w hero: słowa wjeżdżają od dołu ----------
  document.querySelectorAll<HTMLElement>('.hero-h1, .us-hero h1, .ip-head h1').forEach((h) => {
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

start().catch((e) => { console.error('Animacje: ' + (e instanceof Error ? e.message : String(e))); done(); });
