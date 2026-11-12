// Promocje automatyczne (panel: Kody rabatowe → Promocje). Moduł bez zależności serwerowych –
// ten sam kod liczy cenę w koszyku (podgląd) i na serwerze (kwota do zapłaty).
//
//  • quantity – rabat ilościowy: progi „od N sztuk” (procent albo kwota na każdą sztukę) dla wybranych produktów;
//               sztuki liczone osobno dla każdego produktu albo łącznie dla wszystkich produktów z listy (combined)
//  • bundle   – zestaw: komplet produktów (np. krople + kapsułki); rabat procentowy albo kwotowy za każdy komplet
//
// Jedna sztuka dostaje najwyżej jeden rabat. Liczymy dwa warianty – „najpierw zestawy, resztę ilościowo” oraz
// „tylko ilościowo” – i wybieramy korzystniejszy dla klienta. Kwoty zawsze w groszach.

export type PromoTier = { min: number; type: 'percent' | 'amount'; value: number }; // amount: grosze za sztukę
export type BundleItem = { product_id: string; qty: number };
export type Promotion = {
  id: string;
  name: string;               // nazwa wewnętrzna (panel)
  label: string | null;       // nazwa dla klienta (koszyk, zamówienie); puste = name
  kind: 'quantity' | 'bundle';
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  product_ids: string[];      // quantity: produkty objęte rabatem
  combined: boolean;          // quantity: sumuj sztuki różnych produktów z listy
  tiers: PromoTier[];         // quantity: progi
  items: BundleItem[];        // bundle: skład kompletu
  type: 'percent' | 'amount'; // bundle: rodzaj rabatu
  value: number;              // bundle: % albo grosze za komplet
  max_sets: number | null;    // bundle: maks. kompletów w zamówieniu (null = bez limitu)
  with_codes: boolean;        // czy łączy się z kodami rabatowymi
  sort_order: number;
  code: string | null;        // promocja uruchamiana kodem (null = automatyczna)
};
export type PromoLine = { product_id: string; qty: number; unit_price: number };
export type AppliedPromo = { id: string; name: string; label: string; kind: Promotion['kind']; amount: number; with_codes: boolean; code: string | null };
export type PromoResult = { discounts: Record<string, number>; applied: AppliedPromo[]; total: number };

export const promoLabel = (p: Pick<Promotion, 'label' | 'name'>) => (p.label || '').trim() || p.name;

export function promoActive(p: Promotion, now = Date.now()) {
  if (!p.active) return false;
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return false;
  if (p.ends_at && new Date(p.ends_at).getTime() < now) return false;
  return true;
}

const tierDiscount = (t: PromoTier, unit: number, qty: number) =>
  t.type === 'percent' ? Math.round((unit * qty * Math.min(100, t.value)) / 100) : Math.min(t.value * qty, unit * qty);

// Najwyższy osiągnięty próg
export function tierFor(p: Promotion, qty: number): PromoTier | null {
  let best: PromoTier | null = null;
  for (const t of p.tiers) if (qty >= t.min && (!best || t.min > best.min)) best = t;
  return best;
}

type Acc = { per: Map<string, Map<string, number>>; total: number }; // produkt → (promocja → kwota)
const add = (acc: Acc, pid: string, promo: string, amount: number) => {
  if (amount <= 0) return;
  const m = acc.per.get(pid) ?? new Map<string, number>();
  m.set(promo, (m.get(promo) ?? 0) + amount);
  acc.per.set(pid, m);
  acc.total += amount;
};

// Rabaty ilościowe na pozostałe sztuki: dla każdego produktu wygrywa promocja dająca najwięcej
function runQuantity(promos: Promotion[], lines: PromoLine[], remaining: Map<string, number>, acc: Acc) {
  const best = new Map<string, { promo: string; amount: number }>();
  for (const p of promos) {
    if (p.kind !== 'quantity' || !p.tiers.length) continue;
    const covered = lines.filter((l) => p.product_ids.includes(l.product_id) && (remaining.get(l.product_id) ?? 0) > 0);
    if (!covered.length) continue;
    const pooled = p.combined ? covered.reduce((s, l) => s + (remaining.get(l.product_id) ?? 0), 0) : 0;
    for (const l of covered) {
      const q = remaining.get(l.product_id) ?? 0;
      const t = tierFor(p, p.combined ? pooled : q);
      if (!t) continue;
      const amount = tierDiscount(t, l.unit_price, q);
      const cur = best.get(l.product_id);
      if (!cur || amount > cur.amount) best.set(l.product_id, { promo: p.id, amount });
    }
  }
  for (const [pid, b] of best) add(acc, pid, b.promo, b.amount);
}

// Zestawy: kolejno według sort_order, każdy komplet „zużywa” sztuki
function runBundles(promos: Promotion[], lines: PromoLine[], remaining: Map<string, number>, acc: Acc) {
  const unit = new Map(lines.map((l) => [l.product_id, l.unit_price]));
  for (const p of promos) {
    if (p.kind !== 'bundle' || !p.items.length) continue;
    let sets = Infinity;
    for (const it of p.items) sets = Math.min(sets, Math.floor((remaining.get(it.product_id) ?? 0) / Math.max(1, it.qty)));
    if (p.max_sets !== null && p.max_sets !== undefined) sets = Math.min(sets, p.max_sets);
    if (!Number.isFinite(sets) || sets <= 0) continue;
    const setValue = p.items.reduce((s, it) => s + (unit.get(it.product_id) ?? 0) * it.qty, 0);
    if (setValue <= 0) continue;
    const perSet = p.type === 'percent' ? (setValue * Math.min(100, p.value)) / 100 : Math.min(p.value, setValue);
    const total = Math.round(perSet * sets);
    // Rozdział rabatu na produkty proporcjonalnie do wartości w komplecie (reszta z zaokrągleń na ostatni)
    let left = total;
    p.items.forEach((it, i) => {
      const share = i === p.items.length - 1 ? left : Math.round((total * (unit.get(it.product_id) ?? 0) * it.qty) / setValue);
      left -= share;
      add(acc, it.product_id, p.id, share);
      remaining.set(it.product_id, (remaining.get(it.product_id) ?? 0) - it.qty * sets);
    });
  }
}

// code – kod wpisany w zamówieniu: włącza promocję z tym kodem (bez kodu działają tylko promocje automatyczne)
export function applyPromotions(lines: PromoLine[], all: Promotion[], now = Date.now(), code: string | null = null): PromoResult {
  const want = code ? code.trim().toUpperCase() : null;
  const promos = all.filter((p) => promoActive(p, now) && (!p.code || (want !== null && p.code.toUpperCase() === want))).sort((a, b) => a.sort_order - b.sort_order);
  const empty: PromoResult = { discounts: {}, applied: [], total: 0 };
  if (!promos.length || !lines.length) return empty;
  const qtyMap = () => new Map(lines.map((l) => [l.product_id, l.qty]));

  const withBundles: Acc = { per: new Map(), total: 0 };
  const rem = qtyMap();
  runBundles(promos, lines, rem, withBundles);
  runQuantity(promos, lines, rem, withBundles);

  const onlyQty: Acc = { per: new Map(), total: 0 };
  runQuantity(promos, lines, qtyMap(), onlyQty);

  const acc = withBundles.total >= onlyQty.total ? withBundles : onlyQty;
  const byId = new Map(promos.map((p) => [p.id, p]));
  const discounts: Record<string, number> = {};
  const applied = new Map<string, AppliedPromo>();
  for (const l of lines) {
    const m = acc.per.get(l.product_id);
    if (!m) continue;
    let room = l.unit_price * l.qty; // rabat nigdy większy niż wartość pozycji
    for (const [pid, raw] of m) {
      const amount = Math.min(raw, room);
      room -= amount;
      if (amount <= 0) continue;
      discounts[l.product_id] = (discounts[l.product_id] ?? 0) + amount;
      const p = byId.get(pid)!;
      const a = applied.get(pid) ?? { id: p.id, name: p.name, label: promoLabel(p), kind: p.kind, amount: 0, with_codes: p.with_codes, code: p.code };
      a.amount += amount;
      applied.set(pid, a);
    }
  }
  const list = [...applied.values()];
  return { discounts, applied: list, total: list.reduce((s, a) => s + a.amount, 0) };
}

// Najbliższy wyższy próg ilościowy dla produktu (do podpowiedzi w koszyku)
export function nextTier(productId: string, qty: number, all: Promotion[], now = Date.now()) {
  let best: { promo: Promotion; tier: PromoTier } | null = null;
  for (const p of all) {
    if (p.kind !== 'quantity' || p.code || !promoActive(p, now) || !p.product_ids.includes(productId) || p.combined) continue;
    for (const t of p.tiers) if (t.min > qty && (!best || t.min < best.tier.min)) best = { promo: p, tier: t };
  }
  return best;
}

// Opcje ilości na karcie produktu: 1 + progi rabatów ilościowych (maks. 4 pozycje); bez progów – 1, 2, 3
export function qtyOptions(productId: string, all: Promotion[], now = Date.now()) {
  const mins = new Set<number>([1]);
  for (const p of all) {
    if (p.kind !== 'quantity' || p.code || !promoActive(p, now) || !p.product_ids.includes(productId)) continue;
    for (const t of p.tiers) if (t.min > 1 && t.min <= 20) mins.add(t.min);
  }
  const list = [...mins].sort((a, b) => a - b).slice(0, 4);
  return list.length > 1 ? list : [1, 2, 3];
}

export const describeDiscount = (type: 'percent' | 'amount', value: number, perUnit = false) =>
  type === 'percent' ? `−${value}%` : `−${(value / 100).toFixed(2).replace('.', ',').replace(',00', '')} zł${perUnit ? '/szt.' : ''}`;

// Dane z bazy / API → bezpieczny kształt (puste pola, złe typy)
export function normalizePromotion(r: any): Promotion {
  const num = (x: unknown, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);
  return {
    id: String(r.id), name: String(r.name || ''), label: r.label ? String(r.label) : null,
    kind: r.kind === 'bundle' ? 'bundle' : 'quantity', active: r.active !== false,
    starts_at: r.starts_at || null, ends_at: r.ends_at || null,
    product_ids: Array.isArray(r.product_ids) ? r.product_ids.map(String) : [],
    combined: r.combined === true,
    tiers: (Array.isArray(r.tiers) ? r.tiers : []).map((t: any) => ({ min: Math.max(1, Math.round(num(t.min, 1))), type: t.type === 'amount' ? 'amount' : 'percent', value: num(t.value) })).filter((t: PromoTier) => t.value > 0),
    items: (Array.isArray(r.items) ? r.items : []).map((i: any) => ({ product_id: String(i.product_id), qty: Math.max(1, Math.round(num(i.qty, 1))) })),
    type: r.type === 'amount' ? 'amount' : 'percent', value: num(r.value),
    max_sets: r.max_sets === null || r.max_sets === undefined || r.max_sets === '' ? null : Math.max(1, Math.round(num(r.max_sets, 1))),
    with_codes: r.with_codes !== false, sort_order: num(r.sort_order),
    code: r.code ? String(r.code).trim().toUpperCase() : null,
  };
}
