// Panel admina - moduł „new-order” (wydzielony z admin/index.astro).
import { applyPromotions, normalizePromotion, type Promotion } from '../lib/promotions';
import { $, api, esc, pln, toast } from './core';
import { drawerNav, loadOrders, openDrawer, openOrder } from './orders';

// ---------- Nowe zamówienie (ręcznie) ----------
export let productCache: any[] = [];
export async function openNewOrder() {
  $('[data-drawer]').classList.toggle('drawer--wide', false);
  openDrawer(true); drawerNav(openNewOrder, false);
  $('[data-d-title]').textContent = 'Nowe zamówienie';
  const body = $('[data-d-body]');
  body.innerHTML = '<p class="muted">Ładowanie…</p>';
  try { productCache = (await api('/api/admin/products')).rows.filter((p: any) => p.active && p.price !== null); }
  catch (e) { body.innerHTML = `<p class="err">${esc((e as Error).message)}</p>`; return; }
  const opts = productCache.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} - ${pln(p.price)}</option>`).join('');
  body.innerHTML = `
    <form class="sec" data-no>
      <div class="sec"><h3 class="sec__t">Klient</h3>
        <label class="field">Szukaj istniejącego klienta<input class="input" data-no-find placeholder="imię, e-mail, telefon" autocomplete="off" /></label>
        <ul class="items picks" data-no-picks></ul>
        <div class="row2"><label class="field">Imię<input class="input" name="firstName" required /></label><label class="field">Nazwisko<input class="input" name="lastName" required /></label></div>
        <div class="row2"><label class="field">E-mail<input class="input" name="email" type="email" required /></label><label class="field">Telefon<input class="input" name="phone" /></label></div>
      </div>
      <div class="sec"><h3 class="sec__t">Produkty</h3>
        <div data-no-lines></div>
        <button type="button" class="btn btn--outline btn--sm" data-no-add>+ Dodaj produkt</button>
      </div>
      <div class="sec"><h3 class="sec__t">Dostawa</h3>
        <label class="field">Sposób<select class="input" name="shippingMethod" data-no-method><option value="inpost_locker">InPost Paczkomat</option><option value="dpd">Kurier DPD</option></select></label>
        <label class="field" data-no-locker>Kod Paczkomatu<input class="input" name="locker" /></label>
        <div data-no-addr hidden><label class="field">Ulica i numer<input class="input" name="street" /></label>
          <div class="row2"><label class="field">Kod pocztowy<input class="input" name="postcode" placeholder="00-000" /></label><label class="field">Miejscowość<input class="input" name="city" /></label></div></div>
      </div>
      <details class="sec manual"><summary>Faktura na firmę</summary>
        <label class="check"><input type="checkbox" name="invoice" /> Wystaw fakturę</label>
        <div class="row2"><label class="field">Firma<input class="input" name="company" /></label><label class="field">NIP<input class="input" name="nip" /></label></div>
        <label class="field">Adres firmy<input class="input" name="invStreet" /></label>
        <div class="row2"><label class="field">Kod<input class="input" name="invPostcode" /></label><label class="field">Miejscowość<input class="input" name="invCity" /></label></div>
      </details>
      <div class="sec"><h3 class="sec__t">Płatność</h3>
        <label class="check"><input type="radio" name="payment" value="link" checked /> Wyślij klientowi link do płatności (BLIK, przelew, karta) - ważny 7 dni</label>
        <label class="check"><input type="radio" name="payment" value="paid" /> Opłacone poza sklepem (przelew, gotówka)</label>
        <label class="field" data-no-pnote hidden>Jak zapłacono<input class="input" name="paymentNote" placeholder="np. przelew 12.11" /></label>
        <label class="check"><input type="radio" name="payment" value="pending" /> Czeka na płatność (bez wysyłania linku)</label>
        <label class="field">Dodatkowy rabat (zł)<input class="input" name="extraDiscount" inputmode="decimal" placeholder="0" /></label>
        <label class="field">Uwagi<textarea class="input" name="note" rows="2" maxlength="500"></textarea></label>
        <label class="check"><input type="checkbox" name="notify" checked /> Wyślij klientowi e-mail (link do płatności albo potwierdzenie)</label>
      </div>
      <ul class="items"><li><span>Produkty</span><span data-no-sub></span></li><li><span>Rabaty</span><span data-no-disc></span></li><li class="sum"><span>Razem</span><span data-no-total></span></li></ul>
      <div class="actions"><button class="btn">Utwórz zamówienie</button></div>
    </form>`;
  const f = body.querySelector<HTMLFormElement>('[data-no]')!;
  const linesEl = f.querySelector<HTMLElement>('[data-no-lines]')!;
  const addLine = (slug = productCache[0]?.id, qty = 1) => {
    const row = document.createElement('div'); row.className = 'row3';
    row.innerHTML = `<select class="input" data-l-slug>${opts}</select><input class="input" data-l-qty type="number" min="1" max="100" value="${qty}" aria-label="Ilość" /><button type="button" class="icon-btn" data-l-del aria-label="Usuń"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg></button>`;
    (row.querySelector('[data-l-slug]') as HTMLSelectElement).value = slug;
    row.querySelector('[data-l-del]')!.addEventListener('click', () => { row.remove(); recalc(); });
    row.querySelectorAll('select,input').forEach((el) => el.addEventListener('input', recalc));
    linesEl.append(row); recalc();
  };
  const items = () => [...linesEl.querySelectorAll('.row3')].map((r) => ({ slug: (r.querySelector('[data-l-slug]') as HTMLSelectElement).value, qty: Number((r.querySelector('[data-l-qty]') as HTMLInputElement).value) || 0 })).filter((i) => i.qty > 0);
  function recalc() {
    const per: Record<string, number> = {};
    for (const i of items()) per[i.slug] = (per[i.slug] || 0) + i.qty;
    let sub = 0;
    const lines: { product_id: string; qty: number; unit_price: number }[] = [];
    for (const [slug, qty] of Object.entries(per)) {
      const p = productCache.find((x) => x.id === slug); if (!p) continue;
      sub += p.price * qty;
      lines.push({ product_id: slug, qty, unit_price: p.price });
    }
    // Promocje (rabaty ilościowe i zestawy) - podgląd; kwotę i tak liczy serwer
    const disc = applyPromotions(lines, noPromos).total;
    const extra = Math.round(Number(String((f.elements.namedItem('extraDiscount') as HTMLInputElement).value || 0).replace(',', '.')) * 100) || 0;
    f.querySelector('[data-no-sub]')!.textContent = pln(sub);
    f.querySelector('[data-no-disc]')!.textContent = disc + extra ? `−${pln(disc + extra)}` : pln(0);
    f.querySelector('[data-no-total]')!.textContent = pln(Math.max(0, sub - disc - extra));
  }
  let noPromos: Promotion[] = [];
  api('/api/admin/promocje').then((d) => { noPromos = (d.rows || []).map(normalizePromotion); recalc(); }).catch(() => {});
  f.querySelector('[data-no-add]')!.addEventListener('click', () => addLine());
  (f.elements.namedItem('extraDiscount') as HTMLInputElement).addEventListener('input', recalc);
  addLine();
  const syncShip = () => { const dpd = (f.elements.namedItem('shippingMethod') as HTMLSelectElement).value === 'dpd'; (f.querySelector('[data-no-locker]') as HTMLElement).hidden = dpd; (f.querySelector('[data-no-addr]') as HTMLElement).hidden = !dpd; };
  f.querySelector('[data-no-method]')!.addEventListener('change', syncShip);
  f.querySelectorAll<HTMLInputElement>('input[name="payment"]').forEach((r) => r.addEventListener('change', () => { (f.querySelector('[data-no-pnote]') as HTMLElement).hidden = r.value !== 'paid' || !r.checked; }));
  // Wyszukiwanie klienta
  let t = 0;
  const picks = f.querySelector<HTMLElement>('[data-no-picks]')!;
  f.querySelector<HTMLInputElement>('[data-no-find]')!.addEventListener('input', (e) => {
    clearTimeout(t);
    const q = (e.target as HTMLInputElement).value.trim();
    if (q.length < 2) { picks.innerHTML = ''; return; }
    t = window.setTimeout(async () => {
      try {
        const d = await api(`/api/admin/klienci?q=${encodeURIComponent(q)}&size=50&sort=last_active`);
        picks.innerHTML = d.rows.slice(0, 6).map((c: any) => `<li class="clickable" data-pick='${esc(JSON.stringify(c.id))}'><span><strong>${esc(c.full_name || '-')}</strong><br><span class="muted">${esc(c.email)}${c.phone ? ` · ${esc(c.phone)}` : ''}</span></span><span>${c.orders_count} zam.</span></li>`).join('') || '<li class="muted">Brak - wpisz dane nowego klienta poniżej.</li>';
        picks.querySelectorAll<HTMLElement>('[data-pick]').forEach((li) => li.addEventListener('click', async () => {
          const { customer: c } = await api(`/api/admin/klienci?id=${JSON.parse(li.dataset.pick!)}`);
          const set = (n: string, v: unknown) => { const el = f.elements.namedItem(n) as HTMLInputElement | null; if (el) el.value = String(v ?? ''); };
          set('firstName', c.first_name); set('lastName', c.last_name); set('email', c.email); set('phone', c.phone); set('locker', c.default_locker);
          set('street', c.default_address?.street); set('postcode', c.default_address?.postcode); set('city', c.default_address?.city);
          if (c.billing?.nip) { (f.elements.namedItem('invoice') as HTMLInputElement).checked = true; set('company', c.billing.company); set('nip', c.billing.nip); set('invStreet', c.billing.street); set('invPostcode', c.billing.postcode); set('invCity', c.billing.city); }
          if (!c.default_locker && c.default_address?.street) { (f.elements.namedItem('shippingMethod') as HTMLSelectElement).value = 'dpd'; syncShip(); }
          picks.innerHTML = `<li class="muted">Wybrano: ${esc(c.full_name || c.email)}</li>`;
        }));
      } catch { /* bez podpowiedzi */ }
    }, 300);
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const p: Record<string, unknown> = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
    p.items = items(); p.invoice = fd.get('invoice') !== null; p.notify = fd.get('notify') !== null;
    const btn = f.querySelector<HTMLButtonElement>('button:not([type])')!; btn.disabled = true;
    try {
      const r = await api('/api/admin/order-create', p);
      toast(`Utworzono zamówienie ${r.number}${r.mailed ? ' i wysłano e-mail' : ''}.`);
      loadOrders();
      await openOrder(r.id, false);
      if (r.paymentUrl) {
        const box = document.createElement('div'); box.className = 'box box--blue';
        box.innerHTML = `<strong>Link do płatności</strong><input class="input" readonly value="${esc(r.paymentUrl)}" /><div class="actions"><button type="button" class="btn btn--sm" data-copy>Kopiuj link</button></div>`;
        box.querySelector('[data-copy]')!.addEventListener('click', () => navigator.clipboard.writeText(r.paymentUrl).then(() => toast('Skopiowano link.')));
        $('[data-d-body]').prepend(box);
      }
    } catch (err) { toast((err as Error).message, true); btn.disabled = false; }
  });
}
$('[data-new-order]').addEventListener('click', openNewOrder);
