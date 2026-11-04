import type { APIRoute } from 'astro';
import { getEnv, json } from '../../lib/env';
import { db } from '../../lib/supabase';
import { sendMail } from '../../lib/mail';
import { getSite } from '../../lib/site-settings';
import { withdrawalConfirmHtml } from '../../lib/email-templates';

export const prerender = false;

// Funkcja odstąpienia od umowy: zapis oświadczenia + potwierdzenie na trwałym nośniku (e-mail)
export const POST: APIRoute = async ({ request, locals }) => {
  const origin = request.headers.get('Origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json(403, { error: 'Niedozwolone źródło żądania.' });

  let b: any;
  try { b = await request.json(); } catch { return json(400, { error: 'Nieprawidłowe dane.' }); }
  if (String(b.website || '')) return json(200, { ok: true, number: b.number });

  const number = Number(String(b.number || '').replace(/\D/g, ''));
  const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
  const name = String(b.name || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
  const scope = b.scope === 'part' ? 'part' : 'all';
  const items = String(b.items || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 300);
  const note = String(b.note || '').replace(/\r/g, '').trim().slice(0, 1000);

  if (!Number.isInteger(number) || number <= 0) return json(422, { error: 'Podaj numer zamówienia.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(422, { error: 'Podaj e-mail użyty przy zamówieniu.' });
  if (name.length < 3) return json(422, { error: 'Podaj imię i nazwisko.' });
  if (scope === 'part' && items.length < 3) return json(422, { error: 'Napisz, których produktów dotyczy odstąpienie.' });

  const env = await getEnv(locals);
  const site = await getSite(env);
  try {
    const sb = db(env);
    const [order] = await sb.select<any>(`orders?select=id,number,email,status,created_at&number=eq.${number}&email=eq.${encodeURIComponent(email)}`);
    // Ta sama odpowiedź dla złego numeru i złego e-maila – nie zdradzamy, czy zamówienie istnieje
    if (!order) return json(404, { error: 'Nie znaleźliśmy zamówienia o tym numerze dla podanego e-maila. Sprawdź dane albo napisz do nas.' });

    const recent = await sb.select(`order_events?select=id&order_id=eq.${order.id}&type=eq.withdrawal`);
    if (recent.length >= 3) return json(429, { error: 'Oświadczenie dla tego zamówienia zostało już złożone. Odpowiemy wkrótce.' });

    const receivedAt = new Date();
    await sb.insert('order_events', { order_id: order.id, type: 'withdrawal', data: { name, scope, items: scope === 'part' ? items : 'całe zamówienie', note } }, 'id');

    const when = receivedAt.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' });
    const scopeText = scope === 'part' ? `część zamówienia: ${items}` : 'całe zamówienie';
    await sendMail(env, {
      to: email,
      replyTo: env.CONTACT_TO?.split(',')[0]?.trim(),
      subject: `Potwierdzenie odstąpienia od umowy – zamówienie nr ${order.number}`,
      html: withdrawalConfirmHtml({ site, origin: new URL(request.url).origin, name, number: order.number, when, scopeText, note }),
      text: [
        `Dzień dobry ${name},`, '',
        `potwierdzamy otrzymanie oświadczenia o odstąpieniu od umowy sprzedaży (zamówienie nr ${order.number}).`,
        `Data i godzina otrzymania: ${when}`,
        `Zakres: ${scopeText}`, note ? `Uwagi: ${note}` : '', '',
        'Co dalej:',
        `1. Odeślij produkt w ciągu 14 dni – najwygodniej przez formularz szybkich zwrotów: ${site.returnsUrl}`,
        `   albo na adres: ${site.company}, ${site.address}.`,
        '2. Zwrócimy pieniądze tą samą metodą płatności w ciągu 14 dni (możemy wstrzymać zwrot do otrzymania produktu lub dowodu nadania).',
        '', 'Zwrotowi podlegają produkty w nienaruszonym, fabrycznie zamkniętym opakowaniu.', '',
        `Zespół Can-C · ${site.email}`,
      ].filter((l) => l !== '').join('\n'),
    });
    if (env.CONTACT_TO) {
      await sendMail(env, {
        to: env.CONTACT_TO.split(',').map((s) => s.trim()),
        replyTo: email,
        subject: `[can-c.pl] Odstąpienie od umowy – zamówienie nr ${order.number}`,
        text: `Klient: ${name} <${email}>\nZamówienie: ${order.number} (status: ${order.status})\nZakres: ${scopeText}\nUwagi: ${note || '—'}\nOtrzymano: ${when}`,
      }).catch((e) => console.error('Mail do sklepu (odstąpienie): ' + (e instanceof Error ? e.message : String(e))));
    }
    return json(200, { ok: true, number: order.number });
  } catch (e) {
    console.error('Odstąpienie: ' + (e instanceof Error ? e.message : String(e)));
    return json(500, { error: `Nie udało się zapisać oświadczenia. Wyślij je e-mailem na ${site.email}.` });
  }
};
