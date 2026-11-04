// Maile HTML w stylu sklepu. Układ tabelowy i style w atrybutach – tak, żeby wyglądał dobrze
// w Gmailu, Outlooku i Apple Mail (programy pocztowe nie obsługują nowoczesnego CSS).
import type { Site } from './site-settings';

const INK = '#01080F';
const MUTED = '#5B6168';
const LINE = '#E6E6E6';
const BG = '#F4F4F2';
const TINT = '#EAF4FD';
const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const zl = (g: number) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(g / 100);

// ---------- Klocki ----------
export const h1 = (t: string) =>
  `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:26px;line-height:1.25;font-weight:normal;color:${INK};">${esc(t)}</h1>`;
export const p = (html: string, opts: { muted?: boolean; size?: number } = {}) =>
  `<p style="margin:0 0 14px;font-family:${FONT};font-size:${opts.size ?? 16}px;line-height:1.55;color:${opts.muted ? MUTED : INK};">${html}</p>`;
export const button = (href: string, label: string) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px;"><tr>
    <td style="border-radius:300px;background:${INK};">
      <a href="${esc(href)}" style="display:inline-block;padding:15px 30px;font-family:${FONT};font-size:16px;color:#FFFFFF;text-decoration:none;border-radius:300px;">${esc(label)}</a>
    </td></tr></table>`;
export const box = (html: string, tone: 'tint' | 'warn' | 'plain' = 'tint') => {
  const bg = tone === 'warn' ? '#FFF4D6' : tone === 'plain' ? BG : TINT;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="background:${bg};padding:18px 20px;font-family:${FONT};font-size:15px;line-height:1.55;color:${INK};">${html}</td></tr></table>`;
};
export const codeBox = (code: string, caption: string) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr>
    <td align="center" style="border:2px dashed ${INK};padding:18px 16px;">
      <div style="font-family:'Courier New',Courier,monospace;font-size:26px;letter-spacing:3px;color:${INK};font-weight:bold;">${esc(code)}</div>
      <div style="font-family:${FONT};font-size:13px;color:${MUTED};margin-top:6px;">${esc(caption)}</div>
    </td></tr></table>`;
// Tabela pozycji: [opis, kwota]; wiersz z flagą strong = podsumowanie
export const rows = (items: { label: string; value: string; strong?: boolean; muted?: boolean }[]) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border-top:1px solid ${LINE};">
    ${items.map((r) => `<tr>
      <td style="padding:12px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:${r.strong ? 17 : 15}px;color:${r.muted ? MUTED : INK};${r.strong ? 'font-weight:bold;' : ''}">${esc(r.label)}</td>
      <td align="right" style="padding:12px 0 12px 12px;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:${r.strong ? 17 : 15}px;color:${r.muted ? MUTED : INK};white-space:nowrap;${r.strong ? 'font-weight:bold;' : ''}">${esc(r.value)}</td>
    </tr>`).join('')}
  </table>`;
export const kv = (pairs: [string, string][]) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
    ${pairs.map(([k, v]) => `<tr><td valign="top" style="padding:6px 16px 6px 0;font-family:${FONT};font-size:14px;color:${MUTED};white-space:nowrap;width:1%;">${esc(k)}</td><td style="padding:6px 0;font-family:${FONT};font-size:15px;color:${INK};">${v}</td></tr>`).join('')}
  </table>`;
export const steps = (items: string[]) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
    ${items.map((t, i) => `<tr><td valign="top" style="padding:0 12px 12px 0;width:28px;"><div style="width:26px;height:26px;border-radius:13px;background:${INK};color:#fff;font-family:${FONT};font-size:13px;line-height:26px;text-align:center;">${i + 1}</div></td><td style="padding:3px 0 12px;font-family:${FONT};font-size:15px;line-height:1.5;color:${INK};">${t}</td></tr>`).join('')}
  </table>`;

// ---------- Szkielet wiadomości ----------
export function layout(o: { site: Site; origin: string; preheader: string; body: string; unsubscribe?: string; reason?: string }) {
  const s = o.site;
  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>Can-C</title></head>
<body style="margin:0;padding:0;background:${BG};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BG};">${esc(o.preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;">
        <tr><td style="background:${INK};padding:22px 32px;">
          <a href="${esc(o.origin)}/" style="font-family:${FONT};font-size:26px;color:#FFFFFF;text-decoration:none;letter-spacing:0.5px;">Can-C</a>
        </td></tr>
        <tr><td style="padding:36px 32px 12px;">${o.body}</td></tr>
        <tr><td style="padding:0 32px 28px;">
          ${p(`Pytania? Odpisz na tę wiadomość albo napisz na <a href="mailto:${esc(s.email)}" style="color:${INK};">${esc(s.email)}</a>.`, { muted: true, size: 14 })}
          ${p('Zespół Can-C', { size: 15 })}
        </td></tr>
        <tr><td style="background:${BG};padding:20px 32px;border-top:1px solid ${LINE};">
          <p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">
            <a href="${esc(o.origin)}/konto/" style="color:${MUTED};">Moje konto</a> &nbsp;·&nbsp;
            <a href="${esc(o.origin)}/kontakt/" style="color:${MUTED};">Kontakt</a> &nbsp;·&nbsp;
            <a href="${esc(o.origin)}/odstapienie-od-umowy/" style="color:${MUTED};">Zwroty</a> &nbsp;·&nbsp;
            <a href="${esc(o.origin)}/regulamin/" style="color:${MUTED};">Regulamin</a>
          </p>
          <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};">
            ${esc(s.company)}, ${esc(s.address)} · NIP ${esc(s.nip)}<br>
            ${o.reason ? `${esc(o.reason)}<br>` : ''}
            ${o.unsubscribe ? `<a href="${esc(o.unsubscribe)}" style="color:${MUTED};">Wypisz się z tych wiadomości</a>` : ''}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ---------- Wiadomości ----------
type Base = { site: Site; origin: string };
type Line = { name: string; qty: number; total: number };

export function orderConfirmationHtml(o: Base & {
  number: number; total: number; items: Line[]; delivery: string; invoice: boolean; pointName?: string;
}) {
  const sum = o.items.reduce((s, i) => s + i.total, 0);
  const codeDiscount = Math.max(0, sum - o.total);
  return layout({
    ...o, preheader: `Zamówienie nr ${o.number} jest opłacone. Wysyłamy ${o.site.shippingTime}.`,
    body: [
      h1('Dziękujemy za zamówienie!'),
      p(`Płatność za zamówienie <strong>nr ${o.number}</strong> została przyjęta. Wysyłamy ${esc(o.site.shippingTime)} – numer przesyłki prześlemy w osobnej wiadomości.`),
      o.site.noticeActive ? box(esc(o.site.noticeText), 'warn') : '',
      rows([
        ...o.items.map((i) => ({ label: `${i.name} × ${i.qty}`, value: zl(i.total) })),
        ...(codeDiscount ? [{ label: 'Kod rabatowy', value: `−${zl(codeDiscount)}`, muted: true }] : []),
        { label: 'Dostawa', value: '0,00 zł', muted: true },
        { label: 'Razem', value: zl(o.total), strong: true },
      ]),
      kv([
        ['Dostawa', esc(o.delivery) + (o.pointName ? `<br><span style="color:${MUTED};font-size:13px;">${esc(o.pointName)}</span>` : '')],
        ...(o.invoice ? [['Faktura', 'wyślemy osobno na ten adres e-mail'] as [string, string]] : []),
      ]),
      button(`${o.origin}/konto/`, 'Zobacz zamówienie'),
    ].join(''),
  });
}

export function orderConfirmationBankHtml(o: Base & {
  number: number; total: number; items: Line[]; delivery: string; invoice: boolean; pointName?: string;
}) {
  // Importujemy tutaj, żeby uniknąć circular import (email-templates ← bank-transfer)
  const { BANK_ACCOUNT, bankTitle } = require('./bank-transfer') as typeof import('./bank-transfer');
  const sum = o.items.reduce((s, i) => s + i.total, 0);
  const codeDiscount = Math.max(0, sum - o.total);
  return layout({
    ...o, preheader: `Zamówienie nr ${o.number} czeka na Twój przelew: ${zl(o.total)}.`,
    body: [
      h1('Dziękujemy za zamówienie!'),
      p(`Zamówienie <strong>nr ${o.number}</strong> zostało przyjęte. Wyślemy je do realizacji po zaksięgowaniu przelewu.`),
      o.site.noticeActive ? box(esc(o.site.noticeText), 'warn') : '',
      rows([
        ...o.items.map((i) => ({ label: `${i.name} × ${i.qty}`, value: zl(i.total) })),
        ...(codeDiscount ? [{ label: 'Kod rabatowy', value: `−${zl(codeDiscount)}`, muted: true }] : []),
        { label: 'Dostawa', value: '0,00 zł', muted: true },
        { label: 'Do zapłaty przelewem', value: zl(o.total), strong: true },
      ]),
      box([
        `<strong style="font-size:15px">Dane do przelewu</strong>`,
        `Tytuł: <strong>${esc(bankTitle(o.number))}</strong>`,
        `Numer rachunku:<br><strong style="font-size:17px;letter-spacing:0.5px;font-variant-numeric:tabular-nums">${esc(BANK_ACCOUNT)}</strong>`,
        `<span style="font-size:13px;color:${MUTED}">Prosimy o wpłatę bezpośrednio na powyższy numer. Zamówienie zostanie przekazane do realizacji po zaksięgowaniu kwoty na naszym koncie.</span>`,
      ].join('<br><br>')),
      kv([
        ['Dostawa', esc(o.delivery) + (o.pointName ? `<br><span style="color:${MUTED};font-size:13px;">${esc(o.pointName)}</span>` : '')],
        ...(o.invoice ? [['Faktura', 'wyślemy osobno na ten adres e-mail'] as [string, string]] : []),
      ]),
      p('Masz pytania? Napisz do nas – odpiszemy na ten adres.', { muted: true, size: 14 }),
    ].join(''),
  });
}

export function orderShippedHtml(o: Base & { number: number; carrier: string; tracking: string; trackingUrl: string }) {
  return layout({
    ...o, preheader: `Zamówienie nr ${o.number} jest w drodze. Numer przesyłki: ${o.tracking}`,
    body: [
      h1('Twoja paczka jest w drodze'),
      p(`Zamówienie <strong>nr ${o.number}</strong> zostało nadane (${esc(o.carrier)}).`),
      box(`Numer przesyłki<br><span style="font-size:20px;letter-spacing:1px;">${esc(o.tracking)}</span>`),
      button(o.trackingUrl, 'Śledź przesyłkę'),
      p('Przy odbiorze z Paczkomatu InPost wyśle Ci SMS i e-mail z kodem odbioru.', { muted: true, size: 14 }),
    ].join(''),
  });
}

export function paymentLinkHtml(o: Base & { number: number; firstName: string; items: Line[]; extraDiscount: number; total: number; paymentUrl: string }) {
  return layout({
    ...o, preheader: `Zamówienie nr ${o.number} czeka na płatność: ${zl(o.total)}.`,
    body: [
      h1(`Dzień dobry ${o.firstName}`),
      p(`Przygotowaliśmy dla Ciebie zamówienie <strong>nr ${o.number}</strong>. Zapłać BLIK-iem, przelewem lub kartą – zajmie to chwilę.`),
      rows([
        ...o.items.map((i) => ({ label: `${i.name} × ${i.qty}`, value: zl(i.total) })),
        ...(o.extraDiscount ? [{ label: 'Rabat', value: `−${zl(o.extraDiscount)}`, muted: true }] : []),
        { label: 'Dostawa', value: '0,00 zł', muted: true },
        { label: 'Do zapłaty', value: zl(o.total), strong: true },
      ]),
      button(o.paymentUrl, `Zapłać ${zl(o.total)}`),
      p('Link jest ważny 7 dni. Po opłaceniu wyślemy potwierdzenie, a potem numer przesyłki.', { muted: true, size: 14 }),
    ].join(''),
  });
}

export function treatmentReminderHtml(o: Base & {
  firstName: string | null; days: number; packs: number; code: string | null; pct: number; validDays: number; orderUrl: string; unsubscribe: string;
}) {
  return layout({
    ...o, unsubscribe: o.unsubscribe, reason: 'Wysyłamy to przypomnienie, bo zgodziłeś się na wiadomości od Can-C.',
    preheader: o.days > 0 ? `Zapas kropli skończy się za ok. ${o.days} dni – zamów z wyprzedzeniem.` : 'Zapas kropli właśnie się skończył.',
    body: [
      h1(o.days > 0 ? 'Kończy Ci się zapas kropli' : 'Czas na kolejne opakowanie'),
      p(`Dzień dobry${o.firstName ? ` ${esc(o.firstName)}` : ''},`),
      p(o.days > 0
        ? `według naszych wyliczeń zapas z ostatniego zamówienia (${o.packs} op.) skończy się za około <strong>${o.days} ${o.days === 1 ? 'dzień' : 'dni'}</strong>.`
        : `według naszych wyliczeń zapas z ostatniego zamówienia (${o.packs} op.) właśnie się skończył.`),
      p(`Żeby nie przerywać kuracji, zamów kolejne opakowania z wyprzedzeniem. Wysyłamy ${esc(o.site.shippingTime)}, dostawa jest bezpłatna.`),
      o.code ? p(`Dla stałych klientów mamy rabat <strong>${o.pct}%</strong>:`) : '',
      o.code ? codeBox(o.code, `ważny ${o.validDays} dni · wpisz przy zamówieniu`) : '',
      button(o.orderUrl, 'Zamów ponownie'),
      box('Dłuższa kuracja = niższa cena: <strong>2 opakowania −8%</strong>, <strong>4 opakowania −10%</strong>.', 'plain'),
    ].join(''),
  });
}

export function personalCodeHtml(o: Base & { firstName: string | null; message: string; code: string; val: string; minTotal: number; endsAt: string }) {
  return layout({
    ...o, preheader: `Twój osobisty kod rabatowy: ${o.val}.`,
    body: [
      h1(`Rabat ${o.val} dla Ciebie`),
      p(`Dzień dobry${o.firstName ? ` ${esc(o.firstName)}` : ''},`),
      p(esc(o.message || 'dziękujemy, że jesteś z nami. Przygotowaliśmy dla Ciebie osobisty kod rabatowy.')),
      codeBox(o.code, `${o.val}${o.minTotal ? ` od ${zl(o.minTotal)}` : ''} · ważny do ${new Date(o.endsAt).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' })}`),
      button(`${o.origin}/produkt/krople-can-c/`, 'Przejdź do sklepu'),
      p('Kod znajdziesz też w swoim koncie w sklepie.', { muted: true, size: 14 }),
    ].join(''),
  });
}

export function withdrawalConfirmHtml(o: Base & { name: string; number: number; when: string; scopeText: string; note: string }) {
  return layout({
    ...o, preheader: `Otrzymaliśmy oświadczenie o odstąpieniu od umowy (zamówienie nr ${o.number}).`,
    body: [
      h1('Potwierdzenie odstąpienia od umowy'),
      p(`Dzień dobry ${esc(o.name)},`),
      p(`potwierdzamy otrzymanie oświadczenia o odstąpieniu od umowy sprzedaży (zamówienie <strong>nr ${o.number}</strong>).`),
      kv([['Otrzymano', esc(o.when)], ['Zakres', esc(o.scopeText)], ...(o.note ? [['Uwagi', esc(o.note)] as [string, string]] : [])]),
      p('<strong>Co dalej</strong>'),
      steps([
        `Odeślij produkt w ciągu 14 dni – najwygodniej przez <a href="${esc(o.site.returnsUrl)}" style="color:${INK};">formularz szybkich zwrotów</a> albo na adres: ${esc(o.site.company)}, ${esc(o.site.address)}.`,
        'Zwrócimy pieniądze tą samą metodą płatności w ciągu 14 dni. Możemy wstrzymać zwrot do otrzymania produktu lub dowodu nadania.',
      ]),
      button(o.site.returnsUrl, 'Wygeneruj etykietę zwrotną'),
      box('Zwrotowi podlegają produkty w nienaruszonym, fabrycznie zamkniętym opakowaniu.', 'plain'),
    ].join(''),
  });
}

export function backInStockHtml(o: Base & { productName: string; productUrl: string; image?: string | null }) {
  return layout({
    ...o, preheader: `${o.productName} – znów dostępne.`,
    reason: 'To jednorazowe powiadomienie – zapisałeś się na nie na stronie produktu.',
    body: [
      h1('Znów dostępne!'),
      p(`Produkt, na który czekasz, wrócił do sprzedaży:`),
      o.image ? `<a href="${esc(o.productUrl)}"><img src="${esc(o.image)}" width="240" alt="${esc(o.productName)}" style="display:block;width:240px;max-width:100%;height:auto;margin:0 0 16px;border:0;"></a>` : '',
      p(`<strong>${esc(o.productName)}</strong>`, { size: 18 }),
      button(o.productUrl, 'Zamów teraz'),
    ].join(''),
  });
}
