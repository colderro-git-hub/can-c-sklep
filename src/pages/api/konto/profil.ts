import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireCustomer } from '../../../lib/user-auth';
import { logConsent } from '../../../lib/newsletter';

export const prerender = false;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\r\n\t]+/g, ' ').trim().slice(0, max) : '');
const POSTCODE = /^\d{2}-\d{3}$/;
function validNip(nip: string) {
  if (!/^\d{10}$/.test(nip)) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  return w.reduce((s, x, i) => s + x * Number(nip[i]), 0) % 11 === Number(nip[9]);
}

const FIELDS = 'email,first_name,last_name,phone,default_locker,default_address,billing,marketing_consent';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const c = await requireCustomer(request, env);
  if (!c) return json(401, { error: 'Zaloguj się ponownie.' });
  const [row] = await db(env).select(`customers?select=${FIELDS}&id=eq.${c.id}`);
  return json(200, row ?? {});
};

// Zapis profilu: tylko wybrane pola, e-mail się nie zmienia (to login)
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const env = await getEnv(locals);
  const c = await requireCustomer(request, env);
  if (!c) return json(401, { error: 'Zaloguj się ponownie.' });

  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }

  const phone = str(b.phone, 20).replace(/[^\d+]/g, '');
  const locker = str(b.default_locker, 15).toUpperCase();
  const addr = { street: str(b.street, 120), postcode: str(b.postcode, 6), city: str(b.city, 60) };
  const inv = { company: str(b.company, 150), nip: str(b.nip, 13).replace(/\D/g, ''), street: str(b.invStreet, 120), postcode: str(b.invPostcode, 6), city: str(b.invCity, 60) };
  const hasInvoice = Object.values(inv).some(Boolean);

  const errors: string[] = [];
  if (phone && !/^(\+48)?\d{9}$/.test(phone)) errors.push('Telefon: 9 cyfr.');
  if (locker && !/^[A-Z0-9-]{4,15}$/.test(locker)) errors.push('Nieprawidłowy kod Paczkomatu.');
  if (addr.postcode && !POSTCODE.test(addr.postcode)) errors.push('Kod pocztowy adresu: format 00-000.');
  if (hasInvoice) {
    if (!inv.company) errors.push('Podaj nazwę firmy.');
    if (!validNip(inv.nip)) errors.push('Nieprawidłowy NIP.');
    if (!inv.street || !POSTCODE.test(inv.postcode) || !inv.city) errors.push('Uzupełnij adres firmy.');
  }
  if (errors.length) return json(422, { error: errors.join(' ') });

  const patch: Record<string, unknown> = {
    first_name: str(b.first_name, 60) || null,
    last_name: str(b.last_name, 60) || null,
    phone: phone || null,
    default_locker: locker || null,
    default_address: addr.street || addr.city ? addr : null,
    billing: hasInvoice ? inv : null,
  };
  // Zgoda marketingowa: data, źródło i wpis w dzienniku zgód tylko przy zmianie
  const sb = db(env);
  const [cur] = await sb.select<{ marketing_consent: boolean }>(`customers?select=marketing_consent&id=eq.${c.id}`).catch(() => []);
  const changed = typeof b.marketing_consent === 'boolean' && b.marketing_consent !== Boolean(cur?.marketing_consent);
  if (changed && b.marketing_consent === true) Object.assign(patch, { marketing_consent: true, consent_at: new Date().toISOString(), consent_source: 'konto' });
  if (changed && b.marketing_consent === false) Object.assign(patch, { marketing_consent: false });

  try {
    const [row] = await sb.update(`customers?id=eq.${c.id}`, patch, FIELDS);
    if (changed) await logConsent(sb, { email: c.email, customer_id: c.id, action: b.marketing_consent ? 'granted' : 'withdrawn', source: 'konto', consent_text: b.marketing_consent ? 'Zgoda na informacje handlowe (ustawienia konta).' : null, ip: clientAddress, user_agent: request.headers.get('User-Agent') });
    return json(200, row);
  } catch (e) {
    console.error('Profil: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Nie udało się zapisać danych.' });
  }
};
