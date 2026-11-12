import type { APIRoute } from 'astro';
import { getEnv } from '../../../lib/env';
import { db } from '../../../lib/supabase';
import { getSite } from '../../../lib/site-settings';
import { consentText, grantConsent, logConsent, normEmail, verifyConfirm } from '../../../lib/newsletter';

export const prerender = false;

// Kliknięcie w link z maila potwierdzającego → zgoda marketingowa na kliencie + wpis w dzienniku zgód
export const GET: APIRoute = async ({ url, locals, request, clientAddress }) => {
  const env = await getEnv(locals);
  const email = normEmail(url.searchParams.get('e'));
  const go = (status: string) => Response.redirect(new URL(`/newsletter/?status=${status}`, url), 303);
  if (!email || !(await verifyConfirm(env, email, url.searchParams.get('ts') || '', url.searchParams.get('t') || ''))) return go('blad');
  try {
    const sb = db(env);
    const id = await grantConsent(sb, email, 'newsletter');
    const site = await getSite(env);
    await logConsent(sb, { email, customer_id: id, action: 'confirmed', source: 'newsletter', consent_text: consentText(site.company), ip: clientAddress, user_agent: request.headers.get('User-Agent') });
    return go('ok');
  } catch (e) {
    console.error('Newsletter potwierdzenie: ' + (e instanceof Error ? e.message : String(e)));
    return go('blad');
  }
};
