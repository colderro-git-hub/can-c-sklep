// Przelew bankowy: stałe i pomocnicze funkcje.
// Numer konta jest wpisany tu na stałe i używany w: formularzu zamówienia, mailu, panelu, stronie podziękowania.

export const BANK_ACCOUNT = '39 2490 0005 0000 4600 5185 0492'; // formatowany (spacje co 4 cyfry)
export const BANK_ACCOUNT_RAW = BANK_ACCOUNT.replace(/\s/g, ''); // NRB bez spacji

export const BANK_PROVIDER = 'bank_transfer';

export const BANK_INFO_HTML = `<p>Prosimy o wpłatę bezpośrednio na nasze konto bankowe. Prosimy podać numer zamówienia w tytule płatności. Zamówienie zostanie przekazane do realizacji po zaksięgowaniu kwoty na naszym koncie.</p>
<p style="margin-top:10px"><strong>Numer rachunku:</strong><br><code style="font-size:15px;letter-spacing:1px">${BANK_ACCOUNT}</code></p>`;

export const BANK_INFO_TEXT = `Prosimy o wpłatę bezpośrednio na nasze konto bankowe. W tytule płatności prosimy podać numer zamówienia. Zamówienie zostanie przekazane do realizacji po zaksięgowaniu kwoty na naszym koncie.\n\nNumer rachunku: ${BANK_ACCOUNT}`;

export const bankTitle = (orderNumber: number | string) => `Zamówienie nr ${orderNumber} - can-c.pl`;
