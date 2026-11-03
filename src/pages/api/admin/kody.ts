import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';
import { normalizeCode } from '../../../lib/discounts';
import { sendMail } from '../../../lib/mail';
import { getSite } from '../../../lib/site-settings';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  try {
    const sb = db(env);
    const rows = await sb.select<any>('discount_codes?select=*,customers(email)&order=created_at.desc&limit=200');
    // Skuteczność kodów: opłacone zamówienia z kodem
    const used = await sb.select<{ discount_code: string; total: number; discount_code_amount: number; created_at: string }>(
      'orders?select=discount_code,total,discount_code_amount,created_at&discount_code=not.is.null&status=in.(paid,shipped,completed)&limit=10000',
    );
    const stats: Record<string, { orders: number; revenue: number; discount: number; last: string | null }> = {};
    for (const o of used) {
      const s = (stats[o.discount_code] ??= { orders: 0, revenue: 0, discount: 0, last: null });
      s.orders++; s.revenue += o.total; s.discount += o.discount_code_amount;
      if (!s.last || o.created_at > s.last) s.last = o.created_at;
    }
    return json(200, { rows: rows.map((r) => ({ ...r, stats: stats[r.code] ?? { orders: 0, revenue: 0, discount: 0, last: null } })) });
  } catch (e) {
    console.error('Admin kody: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Błąd pobierania kodów.' });
  }
};

// { action: 'create', code, type, value, min_total, starts_at, ends_at, max_uses, once_per_customer, email, description }
// { action: 'toggle', id, active }
export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  const sb = db(env);

  try {
    if (b.action === 'toggle') {
      if (!/^[0-9a-f-]{36}$/i.test(b.id || '')) return json(400, { error: 'Nieprawidłowy kod.' });
      const [row] = await sb.update(`discount_codes?id=eq.${b.id}`, { active: b.active === true }, 'id,active');
      return row ? json(200, { row }) : json(404, { error: 'Nie znaleziono.' });
    }
    // Kod osobisty z karty klienta: { action: 'personal', customer_id, type, value, days, min_total, notify, message }
    if (b.action === 'personal') {
      if (!/^[0-9a-f-]{36}$/i.test(b.customer_id || '')) return json(400, { error: 'Nieprawidłowy klient.' });
      const [cust] = await sb.select<any>(`customers?select=id,email,first_name&id=eq.${b.customer_id}`);
      if (!cust) return json(404, { error: 'Nie znaleziono klienta.' });
      const type = b.type === 'amount' ? 'amount' : 'percent';
      const raw = String(b.value ?? '').replace(',', '.');
      const value = type === 'percent' ? Math.round(Number(raw)) : Math.round(Number(raw) * 100);
      if (!Number.isFinite(value) || value <= 0 || (type === 'percent' && value > 100)) return json(422, { error: 'Nieprawidłowa wartość rabatu.' });
      const days = Math.min(365, Math.max(1, Math.round(Number(b.days) || 30)));
      const min_total = Math.max(0, Math.round(Number(String(b.min_total || 0).replace(',', '.')) * 100)) || 0;
      // Kod: imię bez polskich znaków + losowe znaki, np. ANNA-7K2Q
      const base = String(cust.first_name || 'DLA').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/gi, 'L').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10) || 'DLA';
      const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = '';
      for (let attempt = 0; attempt < 5 && !code; attempt++) {
        const rnd = Array.from(crypto.getRandomValues(new Uint8Array(4)), (x) => alphabet[x % alphabet.length]).join('');
        const candidate = `${base}-${rnd}`;
        const exists = await sb.select(`discount_codes?select=id&code=eq.${candidate}`);
        if (!exists.length) code = candidate;
      }
      if (!code) return json(500, { error: 'Nie udało się wygenerować kodu. Spróbuj ponownie.' });
      const ends_at = new Date(Date.now() + days * 864e5).toISOString();
      await sb.insert('discount_codes', { code, type, value, min_total, max_uses: 1, once_per_customer: true, customer_id: cust.id, ends_at, description: 'Kod przygotowany specjalnie dla Ciebie' }, 'id');
      console.log(`Admin ${admin} utworzył kod osobisty ${code}`);

      let mailed = false;
      if (b.notify !== false) {
        const site = await getSite(env);
        const origin = new URL(request.url).origin;
        const val = type === 'percent' ? `${value}%` : `${(value / 100).toFixed(2).replace('.', ',')} zł`;
        const msg = String(b.message || '').replace(/\r/g, '').trim().slice(0, 600);
        try {
          await sendMail(env, {
            to: cust.email,
            replyTo: env.CONTACT_TO?.split(',')[0]?.trim(),
            subject: `Rabat ${val} na kolejne zamówienie – Can-C`,
            text: [
              `Dzień dobry${cust.first_name ? ` ${cust.first_name}` : ''},`, '',
              msg || 'dziękujemy, że jesteś z nami. Przygotowaliśmy dla Ciebie osobisty kod rabatowy:',
              '', `Kod: ${code}`, `Rabat: ${val}${min_total ? ` (od ${(min_total / 100).toFixed(2).replace('.', ',')} zł)` : ''}`,
              `Ważny do: ${new Date(ends_at).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw' })}`, '',
              `Wpisz go przy zamówieniu: ${origin}/produkt/krople-can-c/`,
              'Kod znajdziesz też w swoim koncie w sklepie.', '',
              `Zespół Can-C · ${site.email}`,
            ].join('\n'),
          });
          mailed = true;
        } catch (e) { console.error('Mail z kodem osobistym: ' + (e instanceof Error ? e.message : String(e))); }
      }
      return json(200, { code, mailed });
    }

    if (b.action !== 'create') return json(400, { error: 'Nieznana akcja.' });

    const code = normalizeCode(b.code);
    const type = b.type === 'amount' ? 'amount' : 'percent';
    const raw = String(b.value ?? '').replace(',', '.');
    const value = type === 'percent' ? Math.round(Number(raw)) : Math.round(Number(raw) * 100);
    const min_total = Math.round(Number(String(b.min_total || 0).replace(',', '.')) * 100);
    const max_uses = b.max_uses ? Math.round(Number(b.max_uses)) : null;
    const toIso = (d: unknown) => (typeof d === 'string' && d ? new Date(d).toISOString() : null);

    if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return json(422, { error: 'Kod: 3–30 znaków (litery, cyfry, - i _).' });
    if (!Number.isFinite(value) || value <= 0 || (type === 'percent' && value > 100)) return json(422, { error: 'Nieprawidłowa wartość rabatu.' });
    if (!Number.isFinite(min_total) || min_total < 0) return json(422, { error: 'Nieprawidłowa minimalna kwota.' });
    if (max_uses !== null && (!Number.isInteger(max_uses) || max_uses < 1)) return json(422, { error: 'Nieprawidłowy limit użyć.' });

    let customer_id: string | null = null;
    const email = String(b.email || '').trim().toLowerCase();
    if (email) {
      const [c] = await sb.select<{ id: string }>(`customers?select=id&email=eq.${encodeURIComponent(email)}`);
      if (!c) return json(422, { error: 'Nie ma klienta z takim e-mailem.' });
      customer_id = c.id;
    }

    const [row] = await sb.insert('discount_codes', {
      code, type, value, min_total, max_uses, customer_id,
      starts_at: toIso(b.starts_at), ends_at: toIso(b.ends_at),
      once_per_customer: b.once_per_customer !== false,
      description: String(b.description || '').trim().slice(0, 200) || null,
    }, 'id,code');
    console.log(`Admin ${admin} utworzył kod ${code}`);
    return json(200, { row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate') || msg.includes('23505')) return json(409, { error: 'Taki kod już istnieje.' });
    console.error('Admin kod zapis: ' + msg);
    return json(500, { error: 'Błąd zapisu.' });
  }
};
