// Dostęp do zmiennych i sekretów Workera (wrangler.jsonc „vars” + Secrets w panelu, lokalnie plik .dev.vars).
// Obsługuje oba sposoby z adaptera @astrojs/cloudflare: Astro.locals.runtime.env (Astro 5)
// oraz import { env } from 'cloudflare:workers' (Astro 6+).

export type Env = {
  TURNSTILE_SECRET?: string;
  RESEND_API_KEY?: string;
  CONTACT_TO?: string;
  CONTACT_FROM?: string;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  P24_MERCHANT_ID?: string;
  P24_POS_ID?: string;
  P24_CRC?: string;
  P24_API_KEY?: string;
  P24_SANDBOX?: string; // 'true' = sandbox.przelewy24.pl
  ACCESS_TEAM_DOMAIN?: string; // np. colderro.cloudflareaccess.com
  ACCESS_AUD?: string;         // Application Audience (AUD) z Cloudflare Access; kilka po przecinku
  ADMIN_EMAILS?: string;       // e-maile administratorów po przecinku
  ALLOW_WC_ACTIONS?: string;   // 'true' po starcie – pozwala obsługiwać zamówienia z importu
  FURGONETKA_API_KEY?: string; // klucz integracji własnej (ten sam wpisujesz w panelu Furgonetki)
  CRON_SECRET?: string;        // klucz automatów (Supabase pg_cron) i podpisu linków „wypisz się”
};

export async function getEnv(locals: unknown): Promise<Env> {
  try {
    const fromLocals = (locals as any)?.runtime?.env;
    if (fromLocals) return fromLocals as Env;
  } catch {
    /* Astro 6 zgłasza błąd przy odwołaniu do locals.runtime – przechodzimy dalej */
  }
  try {
    // @ts-ignore – moduł istnieje tylko w środowisku Workers
    const mod = await import('cloudflare:workers');
    return ((mod as any).env ?? {}) as Env;
  } catch {
    return {};
  }
}

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
