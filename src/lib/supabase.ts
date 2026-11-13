// Minimalny klient Supabase (PostgREST) na fetch - bez dodatkowych bibliotek.
// Używa klucza secret, więc działa WYŁĄCZNIE po stronie serwera (Worker).
import type { Env } from './env';

export function db(env: Env) {
  const base = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
  const key = env.SUPABASE_SECRET_KEY || '';
  if (!base || !key) throw new Error('Brak SUPABASE_URL lub SUPABASE_SECRET_KEY');

  const headers: Record<string, string> = {
    apikey: key,
    'Content-Type': 'application/json',
    ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
  };

  async function call<T = any>(method: string, path: string, body?: unknown, prefer?: string): Promise<T> {
    const res = await fetch(`${base}/rest/v1/${path}`, {
      method,
      headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${method} ${path}: ${res.status} ${text}`);
    return (text ? JSON.parse(text) : null) as T;
  }

  // Lista z łączną liczbą rekordów (do stronicowania)
  async function selectCount<T = any>(path: string): Promise<{ rows: T[]; total: number }> {
    const res = await fetch(`${base}/rest/v1/${path}`, { headers: { ...headers, Prefer: 'count=exact' } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase GET ${path}: ${res.status} ${text}`);
    const range = res.headers.get('Content-Range') || '';
    return { rows: text ? JSON.parse(text) : [], total: Number(range.split('/')[1]) || 0 };
  }

  return {
    selectCount,
    rpc: (fn: string, args: unknown) => call('POST', `rpc/${fn}`, args),
    select: <T = any>(path: string) => call<T[]>('GET', path),
    insert: <T = any>(table: string, rows: unknown, returning = '*') =>
      call<T[]>('POST', `${table}?select=${returning}`, rows, 'return=representation'),
    upsert: <T = any>(table: string, rows: unknown, onConflict: string, returning = '*') =>
      call<T[]>('POST', `${table}?on_conflict=${onConflict}&select=${returning}`, rows, 'resolution=merge-duplicates,return=representation'),
    // Usuwanie wierszy (ścieżka z filtrem, np. 'redirects?id=eq.…')
    remove: (path: string) => call('DELETE', path, undefined, 'return=minimal'),
    update: <T = any>(path: string, patch: unknown, returning = '*') =>
      call<T[]>('PATCH', `${path}&select=${returning}`, patch, 'return=representation'),
  };
}
