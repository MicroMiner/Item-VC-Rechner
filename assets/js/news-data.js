import { loadData } from './portal-data.js';
export const api = (window.VELOCITY_API_URL || '').replace(/\/$/, '');
export const sessionKey = 'velocity.adminSession:' + api;
export function articleSlug(post) { return post.slug || (post.title || 'beitrag').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') + '-' + post.id; }
export async function request(path, options = {}, token = null) {
  if (!api) throw Error('Die News-API ist noch nicht eingerichtet.');
  const response = await fetch(api + path, { ...options, cache:'no-store', signal:AbortSignal.timeout(10000), headers:{ ...(options.body ? {'Content-Type':'application/json'} : {}), ...(token ? {Authorization:'Bearer '+token}:{}), ...options.headers } });
  const data = await response.json().catch(()=>({}));
  if (!response.ok) { const error = Error(response.status===404&&path.startsWith('/news/admin')?'Die News-Verwaltung ist im Worker noch nicht aktiviert. Bitte Datenbank und Worker-Deployment einrichten.':data.error || 'News-Dienst nicht verfügbar (HTTP '+response.status+').'); error.status=response.status; error.configured=data.configured; throw error; }
  return data;
}
export function validPublic(post) {
  return post && typeof post.id==='string' && typeof post.title==='string' && post.title.trim() && typeof post.content==='string' && ['manual','discord'].includes(post.source) && (post.status===undefined || post.status==='published') && !post.hidden && ['Ankündigung','Update','Info','Changelog','Wartung'].includes(post.category) && (post.source!=='discord'||typeof post.sourceId==='string'&&post.sourceId.trim()) && typeof post.publishedAt==='string' && Number.isFinite(Date.parse(post.publishedAt));
}
export async function loadNews() {
  let posts, backend=false, total;
  if (api) try { const data=await request('/news?limit=50'); if(!Array.isArray(data.posts))throw Error('Ungültiges News-Format.');posts=data.posts;total=data.total;backend=true; } catch(error) { if(error.status!==404 && error.configured!==false)throw error; }
  if (!posts) posts=await loadData('assets/data/updates.json','updates');
  const seen=new Set();
  return { backend, total:total ?? posts.length, posts:posts.filter(p=>{if(!validPublic(p)||seen.has(p.id))return false;seen.add(p.id);return true;}).map(p=>({...p,slug:articleSlug(p)})).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)) };
}
