// Endpoint diagnostyczny GA4 - usuń po naprawieniu problemu
import type { APIRoute } from 'astro';
import { getEnv, json } from '../../../lib/env';
import { requireAdmin } from '../../../lib/admin-auth';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const env = await getEnv(locals);
  if (!(await requireAdmin(request, env))) return json(401, { error: 'Brak dostępu.' });

  const rawKey = env.GA4_PRIVATE_KEY || '';
  const email = env.GA4_CLIENT_EMAIL || '';
  const propertyId = env.GA4_PROPERTY_ID || '';

  // Sprawdź format klucza bez ujawniania jego treści
  const keyInfo = {
    present: !!rawKey,
    length: rawKey.length,
    hasBeginMarker: rawKey.includes('BEGIN PRIVATE KEY'),
    hasEndMarker: rawKey.includes('END PRIVATE KEY'),
    hasLiteralNewlines: rawKey.includes('\n'),
    hasEscapedNewlines: rawKey.includes('\\n'),
    firstChars: rawKey.slice(0, 30).replace(/./g, (c) => c === '\n' ? '↵' : c === '\\' ? '⧵' : '*'),
  };

  // Spróbuj zdekodować klucz
  let importError = null;
  try {
    const key = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;
    const pem = key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '').trim();
    const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
    await crypto.subtle.importKey('pkcs8', der.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch (e) {
    importError = e instanceof Error ? e.message : String(e);
  }

  return json(200, {
    email: email ? email.slice(0, 10) + '…' : 'BRAK',
    propertyId: propertyId || 'BRAK',
    keyInfo,
    importError,
    status: !importError && email && propertyId ? 'OK - klucz wczytany poprawnie' : 'BŁĄD - sprawdź szczegóły',
  });
};
