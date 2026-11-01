// Dostęp do zmiennych i sekretów Workera (wrangler.jsonc „vars” + Secrets w panelu, lokalnie plik .dev.vars).
// Obsługuje oba sposoby z adaptera @astrojs/cloudflare: Astro.locals.runtime.env (Astro 5)
// oraz import { env } from 'cloudflare:workers' (Astro 6+).

export type Env = {
  TURNSTILE_SECRET?: string;
  RESEND_API_KEY?: string;
  CONTACT_TO?: string;
  CONTACT_FROM?: string;
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
