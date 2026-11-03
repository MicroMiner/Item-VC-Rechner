import { element, safeUrl } from './portal-data.js';
export { element, safeUrl };
export const dateFormatter=new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Zurich'});
export function inline(text, parent) {
  // Only explicit text nodes and allowlisted formatting elements; raw HTML is text.
  const pattern=/\[([^\]\n]+)\]\(([^\s)]+)\)|\*\*([^*\n]+)\*\*|`([^`\n]+)`|\*([^*\n]+)\*/g;
  let from=0,match;
  while((match=pattern.exec(text))) {
    parent.append(document.createTextNode(text.slice(from,match.index)));
    if(match[1]) {const url=safeUrl(match[2]);if(url){const link=element('a','',match[1]);link.href=url;link.rel='noopener noreferrer';parent.append(link);}else parent.append(document.createTextNode(match[1]));}
    else parent.append(element(match[3]?'strong':match[4]?'code':'em','',match[3]||match[4]||match[5]));
    from=pattern.lastIndex;
  }
  parent.append(document.createTextNode(text.slice(from)));
}
export function markdown(text) {
  const result=element('div','news-body');let paragraph=[],list=null;
  function flush(){if(paragraph.length){const p=element('p');inline(paragraph.join('\n'),p);result.append(p);paragraph=[];}list=null;}
  for(const line of String(text).split(/\r?\n/)) {
    if(!line.trim()){flush();continue;}
    const h=/^#{1,3}\s+(.+)$/.exec(line),bullet=/^[-*]\s+(.+)$/.exec(line),quote=/^>\s?(.*)$/.exec(line);
    if(h){flush();const node=element('h2');inline(h[1],node);result.append(node);}
    else if(bullet){if(paragraph.length)flush();if(!list){list=element('ul');result.append(list);}const li=element('li');inline(bullet[1],li);list.append(li);}
    else if(quote){flush();const node=element('blockquote');inline(quote[1],node);result.append(node);}
    else {list=null;paragraph.push(line);}
  }
  flush();return result;
}
export function metadata(post) {
  const meta=element('div','news-meta'),badge=element('span','news-category',post.category||'Info');badge.dataset.category=post.category||'Info';meta.append(badge);
  if(post.publishedAt&&Number.isFinite(Date.parse(post.publishedAt))){const t=element('time','',dateFormatter.format(new Date(post.publishedAt)));t.dateTime=post.publishedAt;meta.append(t);}else meta.append(element('span','','Entwurf'));
  return meta;
}
export function cover(post, className, onError) {
  const url=safeUrl(post.image);if(!url)return null;
  const img=element('img',className);img.src=url;img.alt=post.title;img.loading='lazy';img.decoding='async';img.addEventListener('error',()=>{img.remove();onError?.();},{once:true});return img;
}
export function article(post, preview=false) {
  const fragment=document.createDocumentFragment();
  if(!preview){const back=element('a','news-back','← Zurück zur Übersicht');back.href='neuigkeiten.html';fragment.append(back);}
  fragment.append(metadata(post),element('h1','',post.title));const img=cover(post,'news-detail-cover');if(img)fragment.append(img);
  fragment.append(markdown(post.content));
  const footer=element('footer','news-detail-footer'),info=element('div');
  info.append(element('span','',post.publishedAt?'Veröffentlicht am '+dateFormatter.format(new Date(post.publishedAt)):'Noch nicht veröffentlicht'));
  info.append(element('span','',' · '+(post.author||'VeloCity')+(post.source==='discord'?' · Quelle: Discord':'')));
  footer.append(info);
  if(!preview){const share=element('button','news-button','↗ Beitrag teilen'),feedback=element('span','status');share.type='button';feedback.setAttribute('role','status');share.addEventListener('click',async()=>{try{if(navigator.share)await navigator.share({title:post.title,url:location.href});else{await navigator.clipboard.writeText(location.href);feedback.textContent='Link kopiert.';}}catch(e){feedback.textContent=e.name==='AbortError'?'Teilen abgebrochen.':'Link zum Teilen: '+location.href;}});footer.append(share,feedback);}
  fragment.append(footer);return fragment;
}
