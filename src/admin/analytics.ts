// Panel admina - moduł „analytics” (wydzielony z admin/index.astro).
import { $, api, esc } from './core';

// ---------- Analityka ----------
export const anBody = $<HTMLElement>('[data-an-body]');
export const anRange = $<HTMLSelectElement>('[data-an-range]');

export function zl_an(g: number) { return new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(g/100); }
export function pct(a: number, b: number) { return b ? Math.round((a/b)*10)/10+'%' : '-'; }
export function delta(cur: number, prev: number) {
  if (!prev) return '';
  const d = Math.round(((cur-prev)/prev)*100);
  return `<span class="${d>=0?'ok':'err'}">${d>=0?'+':''}${d}% vs poprzedni okres</span>`;
}
export function kpiCard(label: string, value: string, sub = '') {
  return `<div class="an__kpi"><span class="an__kpi_v">${value}</span><span class="an__kpi_l">${label}</span>${sub?`<span class="an__kpi_d">${sub}</span>`:''}</div>`;
}

// Wykres liniowy SVG - minimalistyczny
export function lineChart(data: {date:string;revenue:number;orders:number}[], h=200): string {
  if (!data.length) return '';
  const W2=680, PL=52, PR=16, PT=16, PB=32, IW=W2-PL-PR, IH=h-PT-PB;
  const vals = data.map(d=>d.revenue);
  const max = Math.max(...vals, 1);
  const px = (i:number) => PL + (i/(data.length-1||1))*IW;
  const py = (v:number) => PT + IH - (v/max)*IH;
  // Bezier
  const pts = data.map((d,i)=>({x:px(i),y:py(d.revenue)}));
  function bezier(pp:{x:number;y:number}[]) {
    let d=''; for(let i=0;i<pp.length;i++) {
      if(i===0){d+=`M${pp[0].x.toFixed(1)},${pp[0].y.toFixed(1)}`;continue;}
      const p0=pp[i-1],p1=pp[i],t=0.35;
      d+=` C${(p0.x+(p1.x-p0.x)*t).toFixed(1)},${p0.y.toFixed(1)} ${(p0.x+(p1.x-p0.x)*(1-t)).toFixed(1)},${p1.y.toFixed(1)} ${p1.x.toFixed(1)},${p1.y.toFixed(1)}`;
    } return d;
  }
  const linePath = bezier(pts);
  const areaPath = linePath+` L${px(data.length-1).toFixed(1)},${(PT+IH).toFixed(1)} L${PL},${(PT+IH).toFixed(1)} Z`;
  // Oś Y - 4 linie
  const yLines = [0,.33,.67,1].map(f=>{
    const v=max*f, y=PT+IH-f*IH;
    const lbl=v>0?new Intl.NumberFormat('pl-PL',{notation:'compact',maximumFractionDigits:0}).format(v/100):'0';
    return `<line x1="${PL}" y1="${y.toFixed(1)}" x2="${(PL+IW)}" y2="${y.toFixed(1)}" stroke="#e5e7eb" stroke-width="1"/>
      <text x="${PL-6}" y="${(y+4).toFixed(1)}" font-size="10" text-anchor="end" fill="#9ca3af" font-family="system-ui,sans-serif">${lbl}</text>`;
  }).join('');
  // Oś X
  const step=Math.max(1,Math.ceil(data.length/6));
  const xLabels=data.filter((_,i)=>i%step===0||i===data.length-1).map(d=>{
    const i=data.indexOf(d);
    return `<text x="${px(i).toFixed(1)}" y="${h-4}" font-size="10" text-anchor="middle" fill="#9ca3af" font-family="system-ui,sans-serif">${d.date.slice(5)}</text>`;
  }).join('');
  // Dot tylko na wartościach > 0
  const dots=pts.map((pt,i)=>data[i].revenue>0
    ?`<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="3" fill="#fff" stroke="#6366f1" stroke-width="1.5"><title>${data[i].date}: ${new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(data[i].revenue/100)}</title></circle>`:''
  ).join('');
  return `<svg viewBox="0 0 ${W2} ${h}" class="an__chart" aria-label="Wykres przychodu dziennego">
    <defs><linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6366f1" stop-opacity="0.08"/><stop offset="100%" stop-color="#6366f1" stop-opacity="0"/></linearGradient></defs>
    ${yLines}
    <path d="${areaPath}" fill="url(#ag2)"/>
    <path d="${linePath}" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${dots}${xLabels}
  </svg>`;
}

// Wykres słupkowy poziomy - minimalistyczny
export function barChart(labels: string[], values: number[], h=0): string {
  if (!labels.length) return '';
  const maxV = Math.max(...values, 1);
  const rows = labels.map((l,i) => {
    const pct = Math.round((values[i]/maxV)*100);
    const val = values[i]>0 ? new Intl.NumberFormat('pl-PL',{notation:'compact',maximumFractionDigits:1}).format(values[i]/100)+' zł' : '-';
    const name = l.length>28 ? l.slice(0,28)+'…' : l;
    return `<div class="an__bar_row">
      <span class="an__bar_name">${esc(name)}</span>
      <span class="an__bar_track"><span class="an__bar_fill" style="width:${pct}%"></span></span>
      <span class="an__bar_val">${val}</span>
    </div>`;
  }).join('');
  return `<div class="an__bars">${rows}</div>`;
}

// Lejek
export function funnelBar(label: string, val: number, max: number, cls='') {
  const w = max ? Math.round((val/max)*100) : 0;
  return `<div class="an__funnel_row"><span class="an__funnel_l">${esc(label)}</span><span class="an__funnel_bar"><span class="an__funnel_fill ${cls}" style="width:${w}%"></span></span><strong>${val}</strong></div>`;
}

export async function loadAnalytics() {
  if (!anBody) return;
  const range = anRange?.value || '30';
  anBody.innerHTML = '<p class="muted">Ładowanie danych…</p>';
  let d: any;
  try { d = await api(`/api/admin/analytics?range=${range}`); }
  catch (e) { anBody.innerHTML = `<p class="err">${esc((e as Error).message)}</p>`; return; }
  const { kpi, prev, funnel, daily, topProducts, byShipping, byPayment, topCodes } = d;
  const env_ga4_missing = !d.ga4 && true; // ga4 null = brak konfiguracji lub błąd
  const ship: Record<string,string> = { inpost_locker:'InPost Paczkomat', dpd:'Kurier DPD' };

  anBody.innerHTML = `<div class="an__body">` + `
    <!-- KPI -->
    <div class="card">
      <div class="card__head"><h2 class="card__title">Przychód i zamówienia</h2>${delta(kpi.revenue, prev.revenue)}</div>
      <div class="an__kpis">
        ${kpiCard('Przychód', zl_an(kpi.revenue), delta(kpi.revenue, prev.revenue))}
        ${kpiCard('Zamówień opłaconych', kpi.orders, delta(kpi.orders, prev.orders))}
        ${kpiCard('Średnia wartość', zl_an(kpi.avgOrder))}
        ${kpiCard('Konwersja', kpi.convRate+'%')}
        ${kpi.avgPayMin!==null ? kpiCard('Śr. czas do płatności', kpi.avgPayMin < 60 ? kpi.avgPayMin+'min' : Math.round(kpi.avgPayMin/60)+'h '+kpi.avgPayMin%60+'min') : ''}
      </div>
    </div>

    <!-- Wykres przychodu -->
    <div class="card">
      <div class="card__head"><h2 class="card__title">Przychód dzienny</h2></div>
      ${lineChart(daily)}
    </div>

    <!-- Lejek zamówień -->
    <div class="card">
      <div class="card__head"><h2 class="card__title">Lejek zamówień</h2><span class="muted small">Ostatnie ${range} dni</span></div>
      <div class="an__funnel">
        ${funnelBar('Złożone', funnel.placed, funnel.placed)}
        ${funnelBar('Opłacone', funnel.paid, funnel.placed, 'an__funnel_fill--ok')}
        ${funnelBar('Wysłane', funnel.shipped, funnel.placed, 'an__funnel_fill--ok')}
        ${funnelBar('Zrealizowane', funnel.completed, funnel.placed, 'an__funnel_fill--ok')}
        ${funnelBar('Anulowane', funnel.cancelled, funnel.placed, 'an__funnel_fill--err')}
        ${funnel.refunded ? funnelBar('Zwrócone', funnel.refunded, funnel.placed, 'an__funnel_fill--err') : ''}
        ${funnelBar('Oczekujące na płatność', funnel.pending, funnel.placed)}
      </div>
      <p class="muted small" style="padding-top:8px">Konwersja (złożone→opłacone): <strong>${pct(funnel.paid,funnel.placed)}</strong></p>
      ${kpi.refunds?.count ? `<p class="muted small">Zwroty: <strong>${kpi.refunds.count}</strong> na kwotę <strong>${zl_an(kpi.refunds.amount)}</strong> (nie wliczone do przychodu)</p>` : ''}
    </div>

    <!-- Top produkty -->
    <div class="card">
      <div class="card__head"><h2 class="card__title">Top produkty</h2></div>
      ${barChart(topProducts.map((p:any)=>p.name.replace(/Can-C\s*/,'')), topProducts.map((p:any)=>p.revenue))}
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Produkt</th><th class="r">Sprzedanych szt.</th><th class="r">Przychód</th></tr></thead>
        <tbody>${topProducts.map((p:any)=>`<tr><td>${esc(p.name)}</td><td class="r">${p.qty}</td><td class="r nowrap">${zl_an(p.revenue)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>

    <!-- Klienci -->
    <div class="card">
      <div class="card__head"><h2 class="card__title">Konto użytkownika</h2></div>
      <div class="an__kpis">
        ${kpiCard('Nowi klienci', kpi.newCustomers)}
        ${kpiCard('Powracający', kpi.returning)}
        ${kpiCard('Bez konta (gość)', kpi.guests)}
      </div>
    </div>

    <!-- Metody dostawy i płatności -->
    <div class="an__row2">
      <div class="card">
        <div class="card__head"><h2 class="card__title">Metoda dostawy</h2></div>
        <div class="an__funnel">
          ${Object.entries(byShipping).sort(([,a],[,b])=>(b as number)-(a as number)).map(([k,v])=>funnelBar(ship[k]||k,v as number,kpi.orders)).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card__head"><h2 class="card__title">Metoda płatności</h2></div>
        <div class="an__funnel">
          ${Object.entries(byPayment).sort(([,a],[,b])=>(b as number)-(a as number)).map(([k,v])=>funnelBar(k,v as number,kpi.orders)).join('')}
        </div>
      </div>
    </div>

    <!-- GA4 Data API -->
    ${d.ga4 ? `
    <div class="card">
      <div class="card__head"><h2 class="card__title">GA4 - Ruch i zdarzenia</h2><span class="muted small">Google Analytics · ostatnie ${range} dni</span></div>
      <div class="an__kpis">
        ${kpiCard('Sesje', d.ga4.sessions.toLocaleString('pl-PL'))}
        ${kpiCard('Użytkownicy', d.ga4.users.toLocaleString('pl-PL'))}
        ${kpiCard('Nowi użytkownicy', d.ga4.newUsers.toLocaleString('pl-PL'))}
        ${kpiCard('Współczynnik odrzuceń', d.ga4.bounceRate+'%')}
      </div>
    </div>
    <div class="an__row2">
      <div class="card">
        <div class="card__head"><h2 class="card__title">GA4 - Produkty i koszyk</h2></div>
        <div class="an__funnel">
          ${[
            ['Wyświetlenia list produktów', d.ga4.view_item_list],
            ['Wybór produktu z listy', d.ga4.select_item],
            ['Wyświetlenia produktu', d.ga4.view_item],
            ['Dodania do koszyka', d.ga4.add_to_cart],
            ['Usunięcia z koszyka', d.ga4.remove_from_cart],
            ['Wyświetlenia koszyka', d.ga4.view_cart],
          ].map(([l,v]) => funnelBar(l as string, v as number, Math.max(d.ga4.view_item_list, d.ga4.view_item, 1))).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card__head"><h2 class="card__title">GA4 - Proces zamówienia</h2></div>
        <div class="an__funnel">
          ${[
            ['Rozpoczęcie zamówienia', d.ga4.begin_checkout],
            ['Dane dostawy', d.ga4.add_shipping_info],
            ['Dane płatności', d.ga4.add_payment_info],
            ['Zakupy (purchase)', d.ga4.purchase],
            ['Zwroty (refund)', d.ga4.refund],
          ].map(([l,v]) => funnelBar(l as string, v as number, d.ga4.begin_checkout || 1)).join('')}
        </div>
      </div>
    </div>
    <div class="an__row2">
      <div class="card">
        <div class="card__head"><h2 class="card__title">GA4 - Konto użytkownika</h2></div>
        <div class="an__kpis">
          ${kpiCard('Rejestracje (sign_up)', d.ga4.sign_up)}
          ${kpiCard('Logowania (login)', d.ga4.login)}
        </div>
      </div>
      <div class="card">
        <div class="card__head"><h2 class="card__title">GA4 - Formularze</h2></div>
        <div class="an__funnel">
          ${[
            ['Rozpoczęcia formularza', d.ga4.form_start],
            ['Kliknięcia w pola', d.ga4.form_field_click],
            ['Błędy pól', d.ga4.form_field_error],
            ['Wysłania formularza', d.ga4.form_submit],
          ].map(([l,v]) => funnelBar(l as string, v as number, d.ga4.form_start || 1)).join('')}
        </div>
      </div>
    </div>
    <div class="an__row2">
      <div class="card">
        <div class="card__head"><h2 class="card__title">GA4 - Lejek konwersji</h2></div>
        <div class="an__funnel">
          ${d.ga4.funnelRates.map((f: any) => funnelBar(f.step + ' (' + f.rate + '%)', f.count, d.ga4.funnelRates[0]?.count || 1)).join('')}
        </div>
      </div>
      ${d.ga4.topFieldErrors.length ? `<div class="card">
        <div class="card__head"><h2 class="card__title">GA4 - Błędy pól formularzy</h2></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Pole</th><th class="r">Błędów</th></tr></thead>
          <tbody>${d.ga4.topFieldErrors.map((f: any) => `<tr><td>${esc(f.field)}</td><td class="r">${f.count}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>` : ''}
    </div>` : env_ga4_missing ? `<div class="box box--blue"><strong>GA4 nie skonfigurowane</strong><span>Dodaj sekrety GA4_PRIVATE_KEY, GA4_CLIENT_EMAIL i GA4_PROPERTY_ID w Cloudflare Workers → Settings → Variables.</span></div>` : ''}


  ` + `</div>`;
}

anRange?.addEventListener('change', loadAnalytics);
$('[data-an-refresh]')?.addEventListener('click', loadAnalytics);
document.querySelector('[data-tab="analytics"]')?.addEventListener('click', () => setTimeout(loadAnalytics, 50));

// CSS analityki
// CSS analityki przeniesiony do głównego bloku <style>

// ===== CSS dla CMS Stron =====
document.head.insertAdjacentHTML('beforeend', `<style>
  .faq-cms__item { background: var(--card); box-shadow: inset 0 0 0 1px var(--line); margin-bottom: 4px; }
  .faq-cms__q { list-style: none; cursor: pointer; min-height: 56px; padding: 12px 16px; display: flex; align-items: center; gap: 10px; }
  .faq-cms__q::-webkit-details-marker { display: none; }
  .faq-cms__label { flex: 1; font-size: 0.9375rem; }
  .faq-cms__form { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 12px; }
  .faq-cms__check { align-self: flex-end; }
  .pill--ok { background: var(--ok-a08); color: var(--ok); }
</style>`);
