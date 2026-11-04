import { loadNews, request, api, newsSource } from './news-data.js?v=news-editor-3';
import { element, cover, metadata, article, safeUrl } from './news-format.js';
const container=document.getElementById('newsList'),preview=container.dataset.preview==='true';
function card(post) {
 const card=element('article',preview?'news-preview':'news-blog-card');if(!preview)card.dataset.newsId=post.id;
 const copy=element('div','news-card-copy');
 if(!preview){const img=cover(post,'',()=>card.classList.add('no-image'));if(img)card.append(img);else card.classList.add('no-image');}
 const excerpt=(post.excerpt||post.content.replace(/[#*`>]/g,'')).slice(0,preview?180:230);
 copy.append(metadata(post),element(preview?'h3':'h2','',post.title),element('p','',excerpt+(post.content.length>230&&!post.excerpt?' …':'')));
 const link=element('a',preview?'portal-link':'news-read-more','Weiterlesen →');link.href='neuigkeiten.html?beitrag='+encodeURIComponent(post.slug);link.setAttribute('aria-label','Weiterlesen: '+post.title);copy.append(link);card.append(copy);return card;
}
async function render(){
try {
 const {posts,backend,total}=await loadNews();container.replaceChildren();
 if(preview){if(posts.length)container.append(card(posts[0]));else container.append(element('p','muted','Aktuell gibt es noch keine Neuigkeiten.'));}
 else {
  const slug=new URLSearchParams(location.search).get('beitrag');
  if(slug){document.getElementById('newsOverview').hidden=true;const detail=document.getElementById('newsDetail');detail.replaceChildren();detail.classList.remove('has-news-controls');delete detail.dataset.newsId;detail.hidden=false;let p=posts.find(p=>p.slug===slug||p.id===slug);if(!p&&newsSource==='api'&&api)try{p=(await request('/news?slug='+encodeURIComponent(slug))).post;}catch{}if(p){detail.dataset.newsId=p.id;detail.append(article(p));document.title=p.title+' · VeloCity';}else{const back=element('a','news-back','← Zurück zur Übersicht');back.href='neuigkeiten.html';detail.append(back,element('h1','','Beitrag nicht gefunden'),element('p','muted','Dieser Beitrag ist nicht veröffentlicht oder nicht mehr verfügbar.'));}}
  else {
   let shown=0,count=total;const more=document.getElementById('moreNews');async function append(){more.disabled=true;try{if(shown>=posts.length&&backend&&posts.length<count){const page=await request('/news?limit=50&offset='+posts.length);const seen=new Set(posts.map(p=>p.id));posts.push(...page.posts.filter(p=>!seen.has(p.id)));count=page.total;}const chunk=posts.slice(shown,shown+10);container.append(...chunk.map(card));shown+=chunk.length;more.hidden=shown>=posts.length&&(!backend||posts.length>=count);document.dispatchEvent(new Event('news-rendered'));}catch{more.textContent='Erneut versuchen';}finally{more.disabled=false;}}
   if(!posts.length)container.append(element('div','news-empty','Noch keine Neuigkeiten vorhanden. Hier findest du künftig Ankündigungen, Updates und Änderungen rund um VeloCity.'));
   else append();more.onclick=append;
  }
 }
} catch {const error=element('p','news-empty','Neuigkeiten konnten nicht geladen werden. Bitte versuche es später erneut.');if(!preview&&new URLSearchParams(location.search).has('beitrag')){const detail=document.getElementById('newsDetail');delete detail.dataset.newsId;detail.classList.remove('has-news-controls');detail.replaceChildren(error);detail.hidden=false;document.getElementById('newsOverview').hidden=true;}else container.replaceChildren(error);}
document.dispatchEvent(new Event('news-rendered'));
}
await render();
document.addEventListener('news-changed',render);
if(!preview){
 const invite=safeUrl(window.VELOCITY_CONFIG?.discordInvite),link=document.getElementById('discordInvite');
 if(invite&&/^https:\/\/(?:discord\.gg\/|discord\.com\/invite\/)[a-zA-Z0-9_-]+\/?$/.test(invite)){link.href=invite;link.hidden=false;}
 await import('./news-admin.js?v=news-editor-3');
}
