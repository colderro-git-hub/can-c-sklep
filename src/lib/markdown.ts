// Prosty, bezpieczny Markdown dla opisów produktów: ## nagłówki, **pogrubienie**, *kursywa*, listy, [linki](https://…)
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const inline = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, (_, t, u) => `<a href="${u}"${u.startsWith('http') ? ' rel="noopener" target="_blank"' : ''}>${t}</a>`);

export function markdown(src: string | null | undefined) {
  if (!src) return '';
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of src.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) { close(); continue; }
    let m;
    if ((m = line.match(/^(#{2,4})\s+(.+)/))) { close(); const lvl = Math.min(m[1].length, 4); out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`); continue; }
    if ((m = line.match(/^[-*]\s+(.+)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if ((m = line.match(/^\d+[.)]\s+(.+)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    close();
    out.push(`<p>${inline(line)}</p>`);
  }
  close();
  return out.join('\n');
}

export const plainText = (src: string | null | undefined) =>
  String(src || '').replace(/[#*_>\[\]]/g, '').replace(/\((https?:\/\/[^)]+)\)/g, '').replace(/\s+/g, ' ').trim();
