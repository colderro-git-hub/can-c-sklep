// Wspólne sprawdzanie danych z formularzy
export const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) : '');
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const POSTCODE_RE = /^\d{2}-\d{3}$/;
export const LOCKER_RE = /^[A-Z0-9-]{4,15}$/;
export const cleanPhone = (v: unknown) => str(v, 20).replace(/[^\d+]/g, '');
export const validPhone = (p: string) => /^(\+48)?\d{9}$/.test(p);
export function validNip(nip: string) {
  if (!/^\d{10}$/.test(nip)) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  return w.reduce((s, x, i) => s + x * Number(nip[i]), 0) % 11 === Number(nip[9]);
}
