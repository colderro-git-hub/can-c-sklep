// Ochrona panelu admina.
// Warstwa 1: Cloudflare Access (logowanie kodem z e-maila) przed adresami /admin i /api/admin.
// Warstwa 2: tutaj – Worker sprawdza podpis tokenu Access (JWT) i e-mail na liście ADMIN_EMAILS.
// Dzięki temu nawet ominięcie Access (np. inny adres Workera) nie da dostępu do danych.
import type { Env } from './env';

type Jwk = JsonWebKey & { kid: string };
let certCache: { at: number; keys: Jwk[] } | null = null;

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
const decodeJson = (s: string) => JSON.parse(new TextDecoder().decode(b64url(s)));

async function getKeys(teamDomain: string): Promise<Jwk[]> {
  if (certCache && Date.now() - certCache.at < 60 * 60 * 1000) return certCache.keys;
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access certs: ${res.status}`);
  const { keys } = (await res.json()) as { keys: Jwk[] };
  certCache = { at: Date.now(), keys };
  return keys;
}

function readToken(request: Request) {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie') || '';
  return cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1] ?? null;
}

// Zwraca e-mail administratora albo null
export async function requireAdmin(request: Request, env: Env): Promise<string | null> {
  const { ACCESS_TEAM_DOMAIN, ACCESS_AUD, ADMIN_EMAILS } = env;
  if (!ACCESS_TEAM_DOMAIN || !ACCESS_AUD || !ADMIN_EMAILS) {
    console.error('Brak konfiguracji panelu admina (ACCESS_TEAM_DOMAIN, ACCESS_AUD, ADMIN_EMAILS)');
    return null;
  }
  const token = readToken(request);
  if (!token) return null;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;

  try {
    const header = decodeJson(h);
    const payload = decodeJson(p);
    const keys = await getKeys(ACCESS_TEAM_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, ''));
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk || header.alg !== 'RS256') return null;

    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp < now) return null;
    const auds = ACCESS_AUD.split(',').map((a) => a.trim());
    const tokenAud: string[] = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!tokenAud.some((a) => auds.includes(a))) return null;

    const email = String(payload.email || '').toLowerCase();
    const allowed = ADMIN_EMAILS.toLowerCase().split(',').map((e) => e.trim());
    return allowed.includes(email) ? email : null;
  } catch (e) {
    console.error('Błąd weryfikacji tokenu Access: ' + (e instanceof Error ? e.message : String(e)));
    return null;
  }
}
