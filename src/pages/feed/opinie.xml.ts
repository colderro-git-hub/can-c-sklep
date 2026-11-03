import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/env';
import { db } from '../../lib/supabase';
import { getCatalog } from '../../lib/catalog';

export const prerender = false;

const x = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

// Feed opinii o produktach dla Google Merchant Center (Product Reviews Feed, schemat 2.4)
export const GET: APIRoute = async ({ url, locals }) => {
  const env = await getEnv(locals);
  const origin = url.origin;
  const products = await getCatalog(env);
  const reviews = await db(env).select<any>('reviews?select=id,product_id,author_name,rating,title,body,created_at,verified_purchase&status=eq.approved&order=created_at.desc&limit=5000');
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = reviews.filter((r) => byId.has(r.product_id)).map((r) => {
    const p = byId.get(r.product_id)!;
    const gtin = (p.ean || '').replace(/\D/g, '');
    return `
    <review>
      <review_id>${x(r.id)}</review_id>
      <reviewer><name is_anonymous="false">${x(r.author_name)}</name></reviewer>
      <review_timestamp>${new Date(r.created_at).toISOString()}</review_timestamp>
      ${r.title ? `<title>${x(r.title)}</title>` : ''}
      <content>${x(r.body)}</content>
      <review_url type="group">${x(`${origin}/produkt/${p.id}/#opinie`)}</review_url>
      <ratings><overall min="1" max="5">${r.rating}</overall></ratings>
      <products><product>
        <product_ids>${gtin ? `<gtins><gtin>${gtin}</gtin></gtins>` : ''}${p.mpn ? `<mpns><mpn>${x(p.mpn)}</mpn></mpns>` : ''}<skus><sku>${x(p.id)}</sku></skus><brands><brand>${x(p.brand)}</brand></brands></product_ids>
        <product_name>${x(p.name)}</product_name>
        <product_url>${x(`${origin}/produkt/${p.id}/`)}</product_url>
      </product></products>
      <is_spam>false</is_spam>
      ${r.verified_purchase ? '<collection_method>post_fulfillment</collection_method>' : '<collection_method>unsolicited</collection_method>'}
    </review>`;
  }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.google.com/shopping/reviews/schema/product/2.4/product_reviews.xsd">
  <version>2.4</version>
  <aggregator><name>can-c.pl</name></aggregator>
  <publisher><name>Can-C</name><favicon>${x(origin)}/favicon.ico</favicon></publisher>
  <reviews>${items}
  </reviews>
</feed>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
