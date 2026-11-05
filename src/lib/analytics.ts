// Warstwa analityczna – zdarzenia GA4 e-commerce wysyłane przez dataLayer.
// Wywoływana z klienckich komponentów (.astro <script>, lib/cart-fx.ts).
// Wszystkie funkcje są bezpieczne gdy GTM nie jest załadowany (sprawdzają window.dataLayer).

declare global { interface Window { dataLayer: unknown[] } }

const dl = () => { window.dataLayer = window.dataLayer || []; return window.dataLayer; };

// Wspólny typ pozycji
export type AnalyticsItem = {
  item_id: string;    // slug produktu
  item_name: string;
  price: number;      // cena netto lub brutto (tu brutto, spójnie z checkout)
  quantity: number;
  discount?: number;  // kwota rabatu na pozycję
  item_brand?: string;
  item_category?: string;
  coupon?: string;
};

// ---- Widok produktu (strona /produkt/[slug]) ----
export function trackViewItem(item: AnalyticsItem) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'view_item', ecommerce: { currency: 'PLN', value: item.price, items: [item] } });
}

// ---- Dodanie do koszyka ----
export function trackAddToCart(item: AnalyticsItem) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'add_to_cart', ecommerce: { currency: 'PLN', value: item.price * item.quantity, items: [item] } });
}

// ---- Usunięcie z koszyka ----
export function trackRemoveFromCart(item: AnalyticsItem) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'remove_from_cart', ecommerce: { currency: 'PLN', value: item.price * item.quantity, items: [item] } });
}

// ---- Widok koszyka ----
export function trackViewCart(items: AnalyticsItem[], value: number) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'view_cart', ecommerce: { currency: 'PLN', value, items } });
}

// ---- Start realizacji zamówienia ----
export function trackBeginCheckout(items: AnalyticsItem[], value: number, coupon?: string) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'begin_checkout', ecommerce: { currency: 'PLN', value, coupon: coupon || undefined, items } });
}

// ---- Wybór metody dostawy ----
export function trackAddShippingInfo(items: AnalyticsItem[], value: number, tier: string) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'add_shipping_info', ecommerce: { currency: 'PLN', value, shipping_tier: tier, items } });
}

// ---- Wybór metody płatności ----
export function trackAddPaymentInfo(items: AnalyticsItem[], value: number, paymentType: string) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'add_payment_info', ecommerce: { currency: 'PLN', value, payment_type: paymentType, items } });
}

// ---- Zakup (strona dziekujemy po opłaceniu) ----
export function trackPurchase(opts: {
  transactionId: string; value: number; shipping: number; coupon?: string; items: AnalyticsItem[];
}) {
  dl().push({ ecommerce: null });
  dl().push({
    event: 'purchase',
    ecommerce: {
      transaction_id: opts.transactionId,
      currency: 'PLN',
      value: opts.value,
      shipping: opts.shipping,
      coupon: opts.coupon || undefined,
      items: opts.items,
    },
  });
}

// ---- Lista produktów (strona główna / sklep) ----
export function trackViewItemList(items: AnalyticsItem[], listName: string) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'view_item_list', ecommerce: { item_list_name: listName, items } });
}

// ---- Klik w produkt z listy ----
export function trackSelectItem(item: AnalyticsItem, listName: string) {
  dl().push({ ecommerce: null });
  dl().push({ event: 'select_item', ecommerce: { item_list_name: listName, items: [item] } });
}

// ---- Zapis na powiadomienie o dostępności ----
export function trackGenerateLead(productId: string) {
  dl().push({ event: 'generate_lead', product_id: productId });
}
