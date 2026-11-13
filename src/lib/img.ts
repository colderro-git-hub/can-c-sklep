// Zmniejszone wersje zdjęć z Supabase Storage (WebP/AVIF z Cloudflare Images przez /img).
// Dotyczy tylko zdjęć z własnego magazynu; inne adresy zostają bez zmian. Działa po stronie serwera i w przeglądarce.
export const IMG_WIDTHS = [160, 320, 480, 640, 800, 1200, 1600, 2000] as const;

const isStorage = (src: string) => /\/storage\/v1\/object\/public\//.test(src) && !/\.svg(\?|$)/i.test(src);

// Najmniejsza dozwolona szerokość >= żądanej
const snap = (w: number) => IMG_WIDTHS.find((x) => x >= w) ?? IMG_WIDTHS[IMG_WIDTHS.length - 1];

export function imgUrl(src: string | null | undefined, width: number): string {
  if (!src) return '';
  return isStorage(src) ? `/img?w=${snap(width)}&u=${encodeURIComponent(src)}` : src;
}

// srcset dla <img>: przeglądarka sama wybiera rozmiar według szerokości ekranu i atrybutu sizes
export function srcset(src: string | null | undefined, widths: readonly number[] = [320, 480, 640, 800, 1200, 1600]): string | undefined {
  if (!src || !isStorage(src)) return undefined;
  return widths.map((w) => `${imgUrl(src, w)} ${snap(w)}w`).join(', ');
}
