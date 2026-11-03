import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { requireAdmin } from '../../../lib/admin-auth';
import { getSite, clearSiteCache, SITE_KEYS } from '../../../lib/site-settings';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });
  clearSiteCache();
  return json(200, { site: await getSite(env) });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  const admin = await requireAdmin(request, env);
  if (!admin) return json(401, { error: 'Brak dostępu.' });
  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }

  const v: Record<string, string> = {};
  for (const k of SITE_KEYS) v[k] = String(b[k] ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200);

  const errors: string[] = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) errors.push('Nieprawidłowy e-mail.');
  if (v.phone && !/^[+\d][\d\s-]{6,20}$/.test(v.phone)) errors.push('Nieprawidłowy telefon.');
  if (!v.company || !v.address) errors.push('Podaj nazwę firmy i adres.');
  if (v.nip && !/^\d{10}$/.test(v.nip.replace(/\D/g, ''))) errors.push('NIP: 10 cyfr.');
  if (v.regon && !/^\d{9}(\d{5})?$/.test(v.regon.replace(/\D/g, ''))) errors.push('REGON: 9 lub 14 cyfr.');
  for (const k of ['facebook', 'returnsUrl'] as const) if (v[k] && !/^https:\/\/[^\s]+$/.test(v[k])) errors.push(`Adres ${k === 'facebook' ? 'Facebooka' : 'szybkich zwrotów'} musi zaczynać się od https://`);
  if (errors.length) return json(422, { error: errors.join(' ') });
  v.nip = v.nip.replace(/\D/g, ''); v.regon = v.regon.replace(/\D/g, '');

  try {
    await db(env).upsert('settings', { key: 'site', value: v, updated_at: new Date().toISOString(), updated_by: admin }, 'key', 'key');
    clearSiteCache();
    console.log(`Admin ${admin} zmienił ustawienia sklepu`);
    return json(200, { site: v });
  } catch (e) {
    console.error('Zapis ustawień: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: 'Nie udało się zapisać. Czy uruchomiono skrypt 006_ustawienia.sql?' });
  }
};
