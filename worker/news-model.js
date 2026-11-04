// Shared validation used by the protected API and the offline seed/import tool.
import { categories } from '../shared/discord-news.mjs';
export { categories };
export function slugify(value) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'beitrag';
}
export function safeImage(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2000) throw Error('Ungültige Bildadresse.');
  if (/^assets\/[a-zA-Z0-9_./% -]+$/.test(value) && !value.includes('..')) return value;
  let url;
  try { url = new URL(value); } catch { throw Error('Ungültige Bildadresse.'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('Nur HTTP(S)-Bildadressen sind erlaubt.');
  return url.href;
}
export function manualPost(input, previous = null, now = new Date().toISOString()) {
  if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 160) throw Error('Bitte einen Titel mit höchstens 160 Zeichen eingeben.');
  if (typeof input.content !== 'string' || !input.content.trim() || input.content.length > 20000) throw Error('Bitte einen Inhalt mit höchstens 20 000 Zeichen eingeben.');
  if (!categories.includes(input.category)) throw Error('Ungültige Kategorie.');
  if (!['draft', 'published'].includes(input.status)) throw Error('Ungültiger Veröffentlichungsstatus.');
  if (input.excerpt != null && (typeof input.excerpt !== 'string' || input.excerpt.length > 400)) throw Error('Die Kurzbeschreibung darf höchstens 400 Zeichen enthalten.');
  const id = previous?.id || input.id || crypto.randomUUID();
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw Error('Ungültige Beitrags-ID.');
  return { id, slug: previous?.slug || `${slugify(input.title)}-${id.slice(0, 8)}`, title: input.title.trim(), excerpt: (input.excerpt || '').trim(), content: input.content.trim(), category: input.category, image: safeImage(input.image), status: input.status, source: 'manual', sourceId: null, channelId: null, guildId: null, author: previous?.author || 'VeloCity', publishedAt: input.status === 'published' ? previous?.publishedAt || now : previous?.publishedAt || null, updatedAt: now, revision: (previous?.revision || 0) + 1, hidden: false };
}
