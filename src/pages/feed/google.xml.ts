import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/env';
import { getCatalog } from '../../lib/catalog';
import { plainText } from '../../lib/markdown';

export const prerender = false;

const x = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const price = (g: number) => `${(g / 100).toFixed(2)} PLN`;
const AVAIL: Record<string, string> = { in_stock: 'in_stock', out_of_stock: 'out_of_stock', preorder: 'preorder', backorder: 'backorder' };

// Feed produktów Google Merchant Center (RSS 2.0, przestrzeń nazw g:)
export const GET: APIRoute = async ({ url, locals }) => {
  const origin = url.origin;
  const list = (await getCatalog(await getEnv(locals))).filter((p) => p.price !== null && p.images.length);
  const items = list.map((p) => {
    const desc = plainText(p.description) || p.short_description || p.name;
    const gtin = (p.ean || '').replace(/\D/g, '');
    const unit = p.unit_value && p.unit_measure ? (p.unit_measure === 'szt' ? 'ct' : p.unit_measure) : null;
    return `
    <item>
      <g:id>${x(p.id)}</g:id>
      <g:title>${x((p.seo_title || `${p.name}${p.subtitle && !p.name.includes(p.subtitle) ? ` ${p.subtitle}` : ''}`).slice(0, 150))}</g:title>
      <g:description>${x(desc.slice(0, 5000))}</g:description>
      <g:link>${x(`${origin}/produkt/${p.id}/`)}</g:link>
      <g:image_link>${x(p.images[0].url)}</g:image_link>
      ${p.images.slice(1, 11).map((i) => `<g:additional_image_link>${x(i.url)}</g:additional_image_link>`).join('')}
      <g:availability>${AVAIL[p.avail] || 'in_stock'}</g:availability>
      <g:price>${price(p.price!)}</g:price>
      ${p.onSale ? `<g:sale_price>${price(p.sale_price!)}</g:sale_price>${p.sale_start || p.sale_end ? `<g:sale_price_effective_date>${x(`${p.sale_start || new Date().toISOString()}/${p.sale_end || new Date(Date.now() + 365 * 864e5).toISOString()}`)}</g:sale_price_effective_date>` : ''}` : ''}
      <g:brand>${x(p.brand)}</g:brand>
      ${gtin ? `<g:gtin>${gtin}</g:gtin>` : ''}${p.mpn ? `<g:mpn>${x(p.mpn)}</g:mpn>` : ''}
      ${!gtin && !p.mpn ? '<g:identifier_exists>no</g:identifier_exists>' : ''}
      <g:condition>${x(p.condition)}</g:condition>
      ${p.google_category ? `<g:google_product_category>${x(p.google_category)}</g:google_product_category>` : ''}
      ${p.tags.length ? `<g:product_type>${x(p.tags.join(' > '))}</g:product_type>` : ''}
      ${p.highlights.slice(0, 10).map((h) => `<g:product_highlight>${x(h.slice(0, 150))}</g:product_highlight>`).join('')}
      ${unit ? `<g:unit_pricing_measure>${p.unit_value}${unit}</g:unit_pricing_measure><g:unit_pricing_base_measure>${p.unit_measure === 'g' || (p.unit_measure === 'ml' && (p.unit_value ?? 0) >= 100) ? 100 : 1}${unit}</g:unit_pricing_base_measure>` : ''}
      ${p.weight_g ? `<g:shipping_weight>${p.weight_g} g</g:shipping_weight>` : ''}
      <g:shipping><g:country>PL</g:country><g:service>InPost / DPD</g:service><g:price>0.00 PLN</g:price></g:shipping>
    </item>`;
  }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Can-C – sklep can-c.pl</title>
    <link>${x(origin)}</link>
    <description>Produkty sklepu can-c.pl</description>${items}
  </channel>
</rss>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' } });
};
