// Weryfikacja zalogowanego klienta: token sesji Supabase z nagłówka Authorization.
// Supabase sam sprawdza token i zwraca użytkownika – nie ufamy żadnym danym z przeglądarki.
import type { Env } from './env';
import { db } from './supabase';

export type Customer = { id: string; email: string; user_id: string };

export async function requireCustomer(request: Request, env: Env): Promise<Customer | null> {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || token.split('.').length !== 3) return null;
  const base = (env.SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const res = await fetch(`${base}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SECRET_KEY || '', Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string; email?: string; email_confirmed_at?: string };
  if (!user?.id || !user.email || !user.email_confirmed_at) return null;

  const sb = db(env);
  const email = user.email.toLowerCase();
  let [c] = await sb.select<Customer>(`customers?select=id,email,user_id&user_id=eq.${user.id}`);
  if (!c) {
    // Konto potwierdzone, ale bez rekordu klienta – tworzymy albo łączymy po e-mailu
    [c] = await sb.upsert<Customer>('customers', { email, user_id: user.id }, 'email', 'id,email,user_id');
  }
  return c ?? null;
}
