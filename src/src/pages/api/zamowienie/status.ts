import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';

export const prerender = false;

// Status zamówienia dla strony „Dziękujemy”. Identyfikator to losowy UUID,
// a odpowiedź nie zawiera danych osobowych – tylko numer, status i kwotę.
export const GET: APIRoute = async ({ url, locals }) => {
  const id = url.searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: 'Nieprawidłowy identyfikator.' });
  try {
    const [order] = await db(await getEnv(locals)).select<{ number: number; status: string; total: number }>(
      `orders?select=number,status,total&id=eq.${id}`,
    );
    if (!order) return json(404, { error: 'Nie znaleziono zamówienia.' });
    return json(200, order);
  } catch (e) {
    console.error(e);
    return json(500, { error: 'Błąd serwera.' });
  }
};
