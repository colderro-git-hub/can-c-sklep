// Zadanie po wysłaniu odpowiedzi (ctx.waitUntil w Cloudflare Workers); gdy niedostępne - czekamy na wynik.
export async function later(locals: unknown, task: Promise<unknown>) {
  const safe = task.catch((e) => console.error('Zadanie w tle: ' + (e instanceof Error ? e.message : String(e))));
  try {
    const ctx = (locals as any)?.runtime?.ctx ?? (locals as any)?.cfContext;
    if (ctx?.waitUntil) return ctx.waitUntil(safe);
  } catch { /* Astro 6+: brak locals.runtime */ }
  try {
    const mod: any = await import('cloudflare:workers');
    if (typeof mod.waitUntil === 'function') return mod.waitUntil(safe);
  } catch { /* poza Workers */ }
  await safe;
}
