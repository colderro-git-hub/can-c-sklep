import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';
import { str, EMAIL_RE, POSTCODE_RE, LOCKER_RE, cleanPhone, validPhone, validNip } from '../../../lib/validate';

export const prerender = false;

// Kolumny, po których można sortować (nazwa w panelu → kolumna widoku)
const SORTABLE: Record<string, string> = {
  name: 'full_name', last_active: 'last_active_at', created: 'created_at', email: 'email',
  orders: 'orders_count', spent: 'total_spent', avg: 'avg_order', country: 'country',
  city: 'city', postcode: 'postcode', phone: 'phone',
};
const PAGE_SIZES = [50, 100, 200, 500];
const COLS = 'id,full_name,first_name,last_name,email,phone,created_at,last_active_at,last_order_at,orders_count,total_spent,avg_order,country,city,postcode,has_account,marketing_consent,source,admin_note,last_order_packs,treatment_end_at';

// Gotowe segmenty klientów do kampanii
function segmentFilters(seg: string): string[] {
  const ago = (days: number) => encodeURIComponent(new Date(Date.now() - days * 864e5).toISOString());
  const ahead = (days: number) => encodeURIComponent(new Date(Date.now() + days * 864e5).toISOString());
  switch (seg) {
    case 'treatment': return [`treatment_end_at=gte.${ago(14)}`, `treatment_end_at=lte.${ahead(21)}`]; // kończy się kuracja
    case 'regular': return ['orders_count=gte.2'];                                                    // stali klienci
    case 'winback': return ['orders_count=gte.2', `last_order_at=lt.${ago(60)}`];                     // stali, nie kupują od 60 dni
    case 'one_time': return ['orders_count=eq.1', `last_order_at=lt.${ago(60)}`];                     // jeden zakup, nie wrócili
    case 'new': return [`created_at=gte.${ago(30)}`];                                                 // nowi w 30 dni
    case 'consent': return ['marketing_consent=is.true'];                                             // ze zgodą marketingową
    case 'no_orders': return ['orders_count=eq.0'];                                                   // konta bez zakupów
    default: return [];
  }
}

function buildFilters(url: URL) {
  const filters: string[] = [];
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80).replace(/[*,()"\\]/g, ' ').replace(/\s+/g, ' ');
  if (q) {
    const like = encodeURIComponent(`*${q}*`);
    const digits = q.replace(/\D/g, '');
    const ors = [`full_name.ilike.${like}`, `email.ilike.${like}`, `city.ilike.${like}`];
    if (digits.length >= 3) ors.push(`phone.ilike.${encodeURIComponent(`*${digits.slice(-9)}*`)}`);
    filters.push(`or=(${ors.join(',')})`);
  }
  if (url.searchParams.get('buyers') === '1') filters.push('orders_count=gt.0');
  filters.push(...segmentFilters(url.searchParams.get('segment') || ''));
  const col = SORTABLE[url.searchParams.get('sort') || ''] || 'last_active_at';
  const dir = url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
  const order = `${col}.${dir}.nullslast`;
  return { f: filters.length ? `&${filters.join('&')}` : '', order };
}

const cell = (v: unknown) => { const t = String(v ?? ''); return /[";,\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

export const GET: APIRoute = async ({ request, url, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  const sb = db(env);

  try {
    const id = url.searchParams.get('id');
    if (id) {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: 'Nieprawidłowy identyfikator.' });
      const [c] = await sb.select(`customer_stats?select=${COLS}&id=eq.${id}`);
      if (!c) return json(404, { error: 'Nie znaleziono klienta.' });
      const [extra] = await sb.select(`customers?select=default_address,default_locker,billing,consent_at,consent_source&id=eq.${id}`);
      const orders = await sb.select(`orders?select=id,number,created_at,status,total,discount_code,source,order_items(name,qty)&customer_id=eq.${id}&order=created_at.desc&limit=100`);
      const codes = await sb.select(`discount_codes?select=code,type,value,ends_at,active,used_count,max_uses&customer_id=eq.${id}&order=created_at.desc&limit=20`);
      return json(200, { customer: { ...c, ...extra }, orders, codes });
    }

    const { f, order } = buildFilters(url);
    const format = url.searchParams.get('format');

    if (format === 'csv' || format === 'match') {
      // Customer Match (Google Ads / Meta): domyślnie tylko osoby ze zgodą marketingową
      const consentOnly = format === 'match' && url.searchParams.get('all') !== '1';
      const rows = await sb.select<any>(`customer_stats?select=${COLS}${f}${consentOnly ? '&marketing_consent=is.true' : ''}&order=${order}&limit=10000`);
      const zl = (g: number) => (g / 100).toFixed(2).replace('.', ',');
      const d = (s: string | null) => (s ? new Date(s).toLocaleDateString('pl-PL') : '');
      let body: string, name: string;
      if (format === 'match') {
        const phone = (p: string | null) => { const x = String(p || '').replace(/\D/g, ''); return x.length === 9 ? `+48${x}` : x ? `+${x}` : ''; };
        body = ['Email,Phone,First Name,Last Name,Country,Zip', ...rows.map((r) => [r.email, phone(r.phone), r.first_name, r.last_name, r.country || 'PL', r.postcode].map(cell).join(','))].join('\r\n');
        name = 'customer-match';
      } else {
        const head = ['Imię i nazwisko', 'E-mail', 'Telefon', 'Ostatnio aktywny', 'Data rejestracji', 'Zamówienia', 'Suma wydatków', 'Średnia wartość', 'Kraj', 'Miejscowość', 'Kod pocztowy', 'Konto', 'Zgoda marketingowa', 'Koniec kuracji', 'Notatka'];
        body = '\uFEFF' + [head.join(';'), ...rows.map((r) => [r.full_name, r.email, r.phone, d(r.last_active_at), d(r.created_at), r.orders_count, zl(r.total_spent), zl(r.avg_order), r.country, r.city, r.postcode, r.has_account ? 'tak' : 'nie', r.marketing_consent ? 'tak' : 'nie', d(r.treatment_end_at), r.admin_note].map(cell).join(';'))].join('\r\n');
        name = 'klienci';
      }
      console.log(`Admin ${admin} wyeksportował ${rows.length} klientów (${format})`);
      return new Response(body, {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}-can-c-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' },
      });
    }

    const size = PAGE_SIZES.includes(Number(url.searchParams.get('size'))) ? Number(url.searchParams.get('size')) : 50;
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const { rows, total } = await sb.selectCount(`customer_stats?select=${COLS}${f}&order=${order}&limit=${size}&offset=${(page - 1) * size}`);
    return json(200, { rows, total, page, pages: Math.max(1, Math.ceil(total / size)), size });
  } catch (e) {
    console.error('Admin klienci: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd pobierania klientów. Czy uruchomiono skrypt 008_segmenty_notatki.sql?' });
  }
};

// Notatka o kliencie: { id, note }
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  if (!/^[0-9a-f-]{36}$/i.test(b?.id || '')) return json(400, { error: 'Nieprawidłowy klient.' });

  // Edycja danych klienta: { id, action: 'update', ... }
  if (b.action === 'update') {
    const sb = db(env);
    const [cur] = await sb.select<any>(`customers?select=id,email,user_id,marketing_consent&id=eq.${b.id}`);
    if (!cur) return json(404, { error: 'Nie znaleziono klienta.' });
    const email = str(b.email, 200).toLowerCase();
    const phone = cleanPhone(b.phone);
    const locker = str(b.default_locker, 15).toUpperCase();
    const addr = { street: str(b.street, 120), postcode: str(b.postcode, 6), city: str(b.city, 60), country: str(b.country, 2).toUpperCase() || 'PL' };
    const inv = { company: str(b.company, 150), nip: str(b.nip, 13).replace(/\D/g, ''), street: str(b.invStreet, 120), postcode: str(b.invPostcode, 6), city: str(b.invCity, 60) };
    const hasInv = Boolean(inv.company || inv.nip);
    const errors: string[] = [];
    if (!EMAIL_RE.test(email)) errors.push('Nieprawidłowy e-mail.');
    if (email !== cur.email && cur.user_id) errors.push('Klient ma konto – e-mail służy do logowania i zmienia go sam klient (lub przez wsparcie Supabase).');
    if (phone && !validPhone(phone)) errors.push('Telefon: 9 cyfr.');
    if (locker && !LOCKER_RE.test(locker)) errors.push('Nieprawidłowy kod Paczkomatu.');
    if (addr.postcode && !POSTCODE_RE.test(addr.postcode)) errors.push('Kod pocztowy: 00-000.');
    if (hasInv && (!inv.company || !validNip(inv.nip))) errors.push('Faktura: podaj firmę i poprawny NIP.');
    if (errors.length) return json(422, { error: errors.join(' ') });
    if (email !== cur.email) {
      const dup = await sb.select(`customers?select=id&email=eq.${encodeURIComponent(email)}`);
      if (dup.length) return json(409, { error: 'Inny klient ma już ten e-mail.' });
    }
    const patch: Record<string, unknown> = {
      email, first_name: str(b.first_name, 60) || null, last_name: str(b.last_name, 60) || null, phone: phone || null,
      default_locker: locker || null, default_address: addr.street || addr.city ? addr : null, billing: hasInv ? inv : null,
    };
    const consent = b.marketing_consent === true;
    if (consent !== cur.marketing_consent) Object.assign(patch, consent ? { marketing_consent: true, consent_at: new Date().toISOString(), consent_source: `panel (${admin})` } : { marketing_consent: false });
    try {
      const [row] = await sb.update(`customers?id=eq.${b.id}`, patch, 'id');
      if (email !== cur.email) await sb.update(`orders?customer_id=eq.${b.id}&status=in.(pending_payment,paid,on_hold)`, { email }, 'id');
      console.log(`Admin ${admin} edytował klienta ${b.id}`);
      return json(200, { row });
    } catch (e) {
      console.error('Edycja klienta: ' + (e instanceof Error ? e.message : String(e)));
      return json(500, { error: 'Nie udało się zapisać.' });
    }
  }

  const note = String(b.note ?? '').replace(/\r/g, '').trim().slice(0, 1000);
  try {
    const [row] = await db(env).update(`customers?id=eq.${b.id}`, { admin_note: note || null }, 'id,admin_note');
    return row ? json(200, { row }) : json(404, { error: 'Nie znaleziono klienta.' });
  } catch (e) {
    console.error('Notatka klienta: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Nie udało się zapisać notatki.' });
  }
};
