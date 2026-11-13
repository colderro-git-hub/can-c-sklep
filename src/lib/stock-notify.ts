// Wysyłka „Produkt znów dostępny” do osób, które zapisały się na powiadomienie.
import type { Env } from './env';
import { db } from './supabase';
import { sendMail } from './mail';
import { getSite } from './site-settings';
import { backInStockHtml } from './email-templates';

export async function sendBackInStock(env: Env, productId: string, origin: string) {
  const sb = db(env);
  const [p] = await sb.select<{ id: string; name: string; images: { url: string }[] }>(`products?select=id,name,images&id=eq.${productId}`);
  if (!p) return { sent: 0 };
  const waiting = await sb.select<{ id: string; email: string }>(`stock_notifications?select=id,email&product_id=eq.${productId}&notified_at=is.null&limit=500`);
  if (!waiting.length) return { sent: 0 };
  const site = await getSite(env);
  let sent = 0;
  for (const w of waiting) {
    try {
      // Najpierw oznaczamy jako wysłane - przy równoległym zapisie nikt nie dostanie dwóch maili
      const done = await sb.update(`stock_notifications?id=eq.${w.id}&notified_at=is.null`, { notified_at: new Date().toISOString() }, 'id');
      if (!done.length) continue;
      await sendMail(env, {
        to: w.email,
        replyTo: env.CONTACT_TO?.split(',')[0]?.trim(),
        subject: `${p.name} - znów dostępne w Can-C`,
        html: backInStockHtml({ site, origin, productName: p.name, productUrl: `${origin}/produkt/${p.id}/`, image: Array.isArray(p.images) ? p.images[0]?.url : null }),
        text: [
          'Dzień dobry,', '',
          `produkt, na który czekasz, jest znów dostępny: ${p.name}.`, '',
          `Zamów teraz: ${origin}/produkt/${p.id}/`, '',
          'To jednorazowe powiadomienie - zapisałeś się na nie na stronie produktu. Więcej wiadomości z tego powodu nie wyślemy.', '',
          `Zespół Can-C · ${site.email}`,
        ].join('\n'),
      });
      sent++;
    } catch (e) { console.error('Powiadomienie o dostępności: ' + (e instanceof Error ? e.message : String(e))); }
  }
  console.log(`Powiadomienia o dostępności ${productId}: ${sent} z ${waiting.length}`);
  return { sent };
}
