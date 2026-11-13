// Warstwa analityczna - zdarzenia GA4 e-commerce wysyłane przez dataLayer.
// Specyfikacja: GA4 Enhanced Ecommerce + zdarzenia formularzy i konta.
// WAŻNE: do dataLayer nie trafiają wartości wpisywane przez użytkownika -
//        tylko nazwy formularzy, pól i typy interakcji.

declare global { interface Window { dataLayer: unknown[] } }

const dl = () => { window.dataLayer = window.dataLayer || []; return window.dataLayer; };

// Wspólny typ pozycji (rozszerzony o item_variant i tax)
export type AnalyticsItem = {
  item_id: string;        // slug produktu
  item_name: string;
  item_variant?: string;  // np. "2 szt." / "4 szt." dla pakietów
  price: number;          // cena brutto jednostkowa (PLN)
  quantity: number;
  discount?: number;      // kwota rabatu na pozycję
  item_brand?: string;
  item_category?: string;
  coupon?: string;
};

// Oblicz kwotę VAT z ceny brutto i stawki (np. 23)
export function calcTax(grossTotal: number, vatRate: number): number {
  return Math.round(grossTotal * (vatRate / (100 + vatRate)) * 100) / 100;
}

// Ustaw user_id dla zalogowanego klienta (wywołaj po zalogowaniu, clearUserData po wylogowaniu)
export function setUserId(userId: string) {
  dl().push({ event: 'user_identified', user_id: userId });
  // gtag config update - GTM powinien przesłać to do GA4 jako set user_id
  dl().push({ event: 'gtag.config', config: { user_id: userId } });
}
export function clearUserData() {
  dl().push({ event: 'user_identified', user_id: undefined });
  dl().push({ user_id: undefined });
}

// ---- Produkty i koszyk ----

export function trackViewItemList(items: AnalyticsItem[], listName: string) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'view_item_list', ecommerce: { item_list_name: listName, currency: 'PLN', items } });
}

export function trackSelectItem(item: AnalyticsItem, listName: string) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'select_item', ecommerce: { item_list_name: listName, currency: 'PLN', items: [item] } });
}

export function trackViewItem(item: AnalyticsItem) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'view_item', ecommerce: { currency: 'PLN', value: item.price, items: [item] } });
}

export function trackAddToCart(item: AnalyticsItem) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'add_to_cart', ecommerce: { currency: 'PLN', value: item.price * item.quantity, items: [item] } });
}

export function trackRemoveFromCart(item: AnalyticsItem) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'remove_from_cart', ecommerce: { currency: 'PLN', value: item.price * item.quantity, items: [item] } });
}

export function trackViewCart(items: AnalyticsItem[], value: number) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'view_cart', ecommerce: { currency: 'PLN', value, items } });
}

// ---- Proces zamówienia ----

export function trackBeginCheckout(items: AnalyticsItem[], value: number, coupon?: string) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'begin_checkout', ecommerce: { currency: 'PLN', value, coupon: coupon || undefined, items } });
}

export function trackAddShippingInfo(items: AnalyticsItem[], value: number, tier: string) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'add_shipping_info', ecommerce: { currency: 'PLN', value, shipping_tier: tier, items } });
}

export function trackAddPaymentInfo(items: AnalyticsItem[], value: number, paymentType: string) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'add_payment_info', ecommerce: { currency: 'PLN', value, payment_type: paymentType, items } });
}

export function trackPurchase(opts: {
  transactionId: string;
  value: number;       // wartość brutto zamówienia (PLN)
  shipping: number;    // koszt dostawy brutto (PLN)
  tax: number;         // kwota VAT (PLN)
  coupon?: string;
  items: AnalyticsItem[];
}) {
  dl().push({ ecommerce: null });
  dl().push({
    event: 'purchase',
    ecommerce: {
      transaction_id: opts.transactionId,
      currency: 'PLN',
      value: opts.value,
      shipping: opts.shipping,
      tax: opts.tax,
      coupon: opts.coupon || undefined,
      items: opts.items,
    },
  });
}

export function trackRefund(transactionId: string, value: number, items?: AnalyticsItem[]) {
  dl().push({ ecommerce: null });
  dl().push({
    event: 'refund',
    ecommerce: { transaction_id: transactionId, currency: 'PLN', value, ...(items ? { items } : {}) },
  });
}

// ---- Konto użytkownika ----

export function trackSignUp(method = 'email_otp') {
  dl().push({ event: 'sign_up', method });
}

export function trackLogin(method = 'email_otp', userId?: string) {
  dl().push({ event: 'login', method, ...(userId ? { user_id: userId } : {}) });
}

// ---- Formularze ----
// WAŻNE: nie przekazujemy wartości wpisywanych przez użytkownika

export function trackFormStart(formName: string) {
  dl().push({ event: 'form_start', form_name: formName });
}

export function trackFormFieldClick(formName: string, fieldName: string) {
  dl().push({ event: 'form_field_click', form_name: formName, field_name: fieldName });
}

export function trackFormFieldError(formName: string, fieldName: string, errorMessage?: string) {
  dl().push({ event: 'form_field_error', form_name: formName, field_name: fieldName,
    ...(errorMessage ? { error_message: errorMessage } : {}) });
}

export function trackFormSubmit(formName: string) {
  dl().push({ event: 'form_submit', form_name: formName });
}

// ---- Pozostałe ----

export function trackGenerateLead(productId: string) {
  dl().push({ event: 'generate_lead', product_id: productId });
}
