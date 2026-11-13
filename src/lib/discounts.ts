// Kody rabatowe - sprawdzanie i wyliczanie rabatu zawsze po stronie serwera.
import type { db as dbFn } from './supabase';

type Sb = ReturnType<typeof dbFn>;
export type Code = {
  id: string; code: string; type: 'percent' | 'amount'; value: number; min_total: number;
  starts_at: string | null; ends_at: string | null; max_uses: number | null; once_per_customer: boolean;
  customer_id: string | null; active: boolean; used_count: number; description: string | null;
};

export const normalizeCode = (raw: unknown) => String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 30);

// base = wartość koszyka po rabacie zestawowym (grosze)
export async function checkCode(sb: Sb, rawCode: unknown, base: number, email: string | null):
  Promise<{ ok: true; code: Code; amount: number } | { ok: false; error: string }> {
  const code = normalizeCode(rawCode);
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return { ok: false, error: 'Nieprawidłowy kod rabatowy.' };

  const [c] = await sb.select<Code>(`discount_codes?select=*&code=eq.${encodeURIComponent(code)}`);
  const now = Date.now();
  if (!c || !c.active) return { ok: false, error: 'Ten kod nie istnieje albo jest nieaktywny.' };
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { ok: false, error: 'Ten kod nie jest jeszcze aktywny.' };
  if (c.ends_at && new Date(c.ends_at).getTime() < now) return { ok: false, error: 'Ten kod wygasł.' };
  if (c.max_uses !== null && c.used_count >= c.max_uses) return { ok: false, error: 'Limit użyć tego kodu został wyczerpany.' };
  if (base < c.min_total) return { ok: false, error: `Kod działa od ${(c.min_total / 100).toFixed(2).replace('.', ',')} zł.` };

  // Kod przypisany do klienta albo jednorazowy na klienta - potrzebny e-mail
  let customerId: string | null = null;
  if (c.customer_id || c.once_per_customer) {
    if (!email) return { ok: false, error: 'Podaj e-mail, aby użyć tego kodu.' };
    const [cust] = await sb.select<{ id: string }>(`customers?select=id&email=eq.${encodeURIComponent(email.toLowerCase())}`);
    customerId = cust?.id ?? null;
  }
  if (c.customer_id && c.customer_id !== customerId) return { ok: false, error: 'Ten kod jest przypisany do innego konta.' };
  if (c.once_per_customer && customerId) {
    const used = await sb.select(`discount_code_uses?select=id&code_id=eq.${c.id}&customer_id=eq.${customerId}&limit=1`);
    if (used.length) return { ok: false, error: 'Ten kod został już przez Ciebie wykorzystany.' };
  }

  const amount = c.type === 'percent' ? Math.round((base * c.value) / 100) : Math.min(c.value, base);
  return { ok: true, code: c, amount };
}
