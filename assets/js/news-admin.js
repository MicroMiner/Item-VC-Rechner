import { api, sessionKey, request, loadNews } from './news-data.js?v=news-admin-refresh-6';
import { createNewsImageEditor } from './news-image.js?v=news-image-fit-5';
import { element, article, dateFormatter } from './news-format.js';
const $=id=>document.getElementById(id),panel=$('newsAdminPanel');
let session=null,current=null,busy=false,dirty=false,changed=false,expiryTimer,canEdit=false;
let knownPosts=new Map();
const imageEditor=createNewsImageEditor({onChange:()=>{dirty=true;},upload:blob=>admin('/image',{method:'POST',headers:{'Content-Type':'image/jpeg'},body:blob,signal:AbortSignal.timeout(30000)})});
function message(text){$('newsAdminMessage').textContent=text;}
function forget(){try{localStorage.removeItem(sessionKey);}catch{}}
function newId(){return crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');}
function edit(post=null){
 current=post?{...post}:{id:newId(),revision:null};
 for(const [id,key] of [['postTitle','title'],['postExcerpt','excerpt'],['postContent','content'],['postImage','image']])$(id).value=post?.[key]||'';
 imageEditor.reset(post?.image||'');
 $('postCategory').value=post?.category||'Update';$('postStatus').value=post?.status||'draft';$('deleteNewsPost').hidden=!post;
 $('newsEditorPreview').hidden=true;$('newsEditorPreview').replaceChildren();dirty=false;
}
function locked(clearSession=true){
 canEdit=false;
 if(clearSession){session=null;clearTimeout(expiryTimer);}
 panel.classList.add('is-locked');$('newsAdminContent').inert=true;$('newsAdminContent').setAttribute('aria-hidden','true');
 $('newsLoginOverlay').hidden=false;$('newsAdminList').replaceChildren();edit();
}
function unlock(){panel.classList.remove('is-locked');$('newsAdminContent').inert=false;$('newsAdminContent').setAttribute('aria-hidden','false');$('newsLoginOverlay').hidden=true;}
function accept(value){
 if(!value||typeof value.token!=='string'||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now())throw Error('Sitzung abgelaufen.');
 session={token:value.token,expiresAt:value.expiresAt};try{localStorage.setItem(sessionKey,JSON.stringify(session));}catch{}
 clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>{locked();forget();message('Sitzung abgelaufen. Bitte erneut anmelden.');},value.expiresAt-Date.now());
}
async function admin(path='',options={}){
 if(!session||session.expiresAt<=Date.now()){locked();throw Error('Bitte erneut anmelden.');}
 const token=session.token;
 try{return await request('/news/admin'+path,options,token);}catch(error){
  if(error.status!==401)throw error;
  // A rejected News endpoint must not discard a session still accepted by /auth.
  try{accept(await request('/auth',{method:'POST',body:JSON.stringify({token})}));}
  catch(check){check.authentication='session';if(check.status===401){locked();forget();}else locked(false);throw check;}
  error.authVerified=true;
  locked(false);
  throw error;
 }
}
function input(status){return {id:current.id,revision:current.revision,title:$('postTitle').value,category:$('postCategory').value,excerpt:$('postExcerpt').value,content:$('postContent').value,image:$('postImage').value,status:status||$('postStatus').value,...(!current.revision&&current.original?{original:current.original}:{})};}
function original(post){return post.revision?post:{...post,revision:null,original:{...post}};}
function openEditor(post){
 if(busy||!canEdit)return;
 if(dirty&&!confirm('Ungespeicherte Änderungen verwerfen?'))return;
 panel.hidden=false;$('openNewsAdmin').setAttribute('aria-expanded','true');edit(original(post));panel.scrollIntoView({block:'start',behavior:'smooth'});$('postTitle').focus({preventScroll:true});
}
async function removePost(post){
 if(busy||!canEdit||!confirm('„'+post.title+'“ von der Webseite löschen? Der Beitrag bleibt in Discord unverändert.'))return;
 busy=true;
 try{
  await admin('/delete',{method:'POST',body:JSON.stringify({id:post.id,revision:post.revision??null,...(!post.revision?{original:post}:{})})});
  if(current?.id===post.id)edit();changed=true;await load();document.dispatchEvent(new Event('news-changed'));message('Beitrag gelöscht.');
 }catch(error){message(error.message);if(panel.hidden){panel.hidden=false;panel.scrollIntoView({block:'start',behavior:'smooth'});}}
 finally{busy=false;}
}
async function load(){
 const data=await admin();canEdit=data.capabilities?.websiteEditing===true;
 const publicData=await loadNews();knownPosts=new Map(publicData.posts.map(p=>[p.id,p]));
 for(const p of data.posts)knownPosts.set(p.id,p);
 $('newsAdminList').replaceChildren();
 for(const p of knownPosts.values()){
  if(p.hidden)continue;
  const row=element('div','news-admin-row'),text=element('div');
  text.append(element('strong','',p.title),element('small','',p.category+' · '+(p.status==='draft'?'Entwurf':'Veröffentlicht')+' · '+(p.source==='discord'?'Discord':'Manuell')));
  const button=element('button','news-button','Bearbeiten');button.type='button';
  button.addEventListener('click',()=>{if(!canEdit&&p.source==='manual'){if(dirty&&!confirm('Ungespeicherte Änderungen verwerfen?'))return;edit(p);return;}openEditor(p);});
  const del=element('button','news-admin-delete');del.type='button';del.hidden=!canEdit;del.title='Beitrag löschen';del.setAttribute('aria-label','Beitrag löschen: '+p.title);
  del.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  del.addEventListener('click',()=>removePost(p));
  const actions=element('div','news-admin-row-actions');actions.append(button,del);
  row.append(text,actions);$('newsAdminList').append(row);
 }
 if(!knownPosts.size)$('newsAdminList').append(element('p','muted','Noch keine Beiträge gespeichert.'));
 $('postImageFile').disabled=!data.capabilities?.imageUpload;
 unlock();
 if(!canEdit)message('Für direkte Bearbeitung und Bild-Upload bitte den aktualisierten News-Worker veröffentlichen.');
}
function loginError(error){
 if(error.authVerified){message('Admin-Anmeldung gültig. Der News-Endpunkt hat die Sitzung abgelehnt (HTTP 401). Bitte den erweiterten News-Worker und seine Anmeldung prüfen.');return;}
 if(session&&error.status!==401){locked(false);message('Anmeldung gültig. '+([404,503].includes(error.status)?'Die News-Verwaltung ist noch nicht verfügbar. Bitte D1-Bindung, Migrationen und Worker-Deployment in Cloudflare prüfen.':'Die News-Verwaltung konnte nicht geladen werden. Bitte erneut versuchen.'));}
 else {
  if(error.status===401&&error.authentication!=='password')forget();
  locked();
  message(error.status===401?(error.authentication==='session'?'Admin-Sitzung abgelaufen oder nicht mehr gültig. Bitte erneut anmelden.':'Das Admin-Passwort wurde von der Anmeldung nicht akzeptiert (HTTP 401). Bitte dasselbe Passwort wie im Umrechner verwenden.'):error.message);
 }
}
async function authenticate(credentials){
 let value;
 try{value=await request('/auth',{method:'POST',body:JSON.stringify(credentials)});}
 catch(error){error.authentication=credentials.token?'session':'password';throw error;}
 accept(value);$('newsPassword').value='';await load();edit();
}
$('openNewsAdmin').addEventListener('click',async()=>{
 if(!panel.hidden){panel.scrollIntoView({block:'start',behavior:'instant'});return;}
 panel.hidden=false;$('openNewsAdmin').setAttribute('aria-expanded','true');locked();message('Admin-Zugang wird geprüft …');
 panel.scrollIntoView({block:'start',behavior:'instant'});
 let saved;try{saved=JSON.parse(localStorage.getItem(sessionKey));}catch{}
 if(saved&&saved.expiresAt>Date.now()){
  busy=true;try{await authenticate({token:saved.token});message('Bestehende Admin-Sitzung übernommen.');}catch(e){loginError(e);}finally{busy=false;}
 }else message(api?'Bitte mit dem bestehenden Admin-Passwort anmelden.':'News-API noch nicht eingerichtet.');
 if(panel.classList.contains('is-locked'))$('newsPassword').focus({preventScroll:true});
});
$('newsLoginForm').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;busy=true;$('newsLoginForm').querySelector('button').disabled=true;message('Anmeldung wird geprüft …');
 try{await authenticate({password:$('newsPassword').value});message('Angemeldet.');}catch(e){loginError(e);}finally{busy=false;$('newsLoginForm').querySelector('button').disabled=false;}
});
function close(){if(busy){message('Bitte Speichervorgang abwarten.');return;}if(dirty&&!confirm('Ungespeicherte Änderungen verwerfen?'))return;panel.hidden=true;$('openNewsAdmin').setAttribute('aria-expanded','false');dirty=false;if(changed){location.reload();return;}$('openNewsAdmin').focus();}
$('closeNewsAdmin').addEventListener('click',close);
$('newNewsPost').addEventListener('click',()=>{if(!dirty||confirm('Ungespeicherte Änderungen verwerfen?')){edit();$('postTitle').focus();}});
$('reloadNewsAdmin').addEventListener('click',()=>load().catch(e=>{if(!session)locked();message(e.message);}));
$('logoutNewsAdmin').addEventListener('click',()=>{forget();locked();message('Abgemeldet.');$('newsPassword').focus();});
$('newsEditorForm').addEventListener('input',()=>{dirty=true;});
$('previewNewsPost').addEventListener('click',()=>{if(!$('newsEditorForm').reportValidity())return;const p=input();$('newsEditorPreview').replaceChildren(article({...p,author:'VeloCity',publishedAt:p.status==='published'?current.publishedAt||new Date().toISOString():null},true));$('newsEditorPreview').hidden=false;});
$('newsEditorForm').addEventListener('submit',async event=>{
 event.preventDefault();if(busy||panel.classList.contains('is-locked'))return;busy=true;$('newsEditorForm').inert=true;message('Beitrag wird gespeichert …');
 try{await imageEditor.save();const data=await admin('',{method:'POST',body:JSON.stringify(input(event.submitter?.dataset.status))});edit(data.post);changed=true;await load();document.dispatchEvent(new Event('news-changed'));message(data.post.status==='published'?'Beitrag veröffentlicht.':'Entwurf gespeichert.');}
 catch(e){message(e.message);}finally{busy=false;$('newsEditorForm').inert=false;}
});
$('deleteNewsPost').addEventListener('click',()=>{if(current?.revision||current?.original)removePost(current.original&&!current.revision?current.original:current);});
window.addEventListener('storage',event=>{if(event.key===sessionKey&&!event.newValue){locked();message('Admin-Sitzung beendet.');}});
edit();
let saved;try{saved=JSON.parse(localStorage.getItem(sessionKey));}catch{}
if(saved?.expiresAt>Date.now()){
 busy=true;
 try{await authenticate({token:saved.token});}catch(error){loginError(error);}finally{busy=false;}
}
$('openNewsAdmin').disabled=false;

