import { api, sessionKey, request } from './news-data.js';
import { element, article, dateFormatter } from './news-format.js';
const $=id=>document.getElementById(id),panel=$('newsAdminPanel');
let session=null,current=null,busy=false,dirty=false,changed=false,expiryTimer;
function message(text){$('newsAdminMessage').textContent=text;$('newsLoginMessage').textContent=text;}
function forget(){try{localStorage.removeItem(sessionKey);}catch{}}
function newId(){return crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');}
function edit(post=null){
 current=post?{...post}:{id:newId(),revision:null};
 for(const [id,key] of [['postTitle','title'],['postExcerpt','excerpt'],['postContent','content'],['postImage','image']])$(id).value=post?.[key]||'';
 $('postCategory').value=post?.category||'Update';$('postStatus').value=post?.status||'draft';$('deleteNewsPost').hidden=!post;
 $('newsEditorPreview').hidden=true;$('newsEditorPreview').replaceChildren();dirty=false;
}
function lockEditor(){
 panel.hidden=true;$('openNewsAdmin').setAttribute('aria-expanded','false');
 $('newsAdminContent').inert=true;$('newsAdminContent').setAttribute('aria-hidden','true');
 $('newsAdminList').replaceChildren();edit();
}
function locked(){
 session=null;clearTimeout(expiryTimer);lockEditor();
 $('newsAdminGate').classList.add('is-locked');$('newsAdminGateContent').inert=true;$('newsAdminGateContent').setAttribute('aria-hidden','true');
 $('newsLoginOverlay').hidden=false;$('openNewsAdmin').disabled=true;
}
function unlockGate(){
 $('newsAdminGate').classList.remove('is-locked');$('newsAdminGateContent').inert=false;$('newsAdminGateContent').setAttribute('aria-hidden','false');
 $('newsLoginOverlay').hidden=true;$('openNewsAdmin').disabled=false;
}
function unlock(){ $('newsAdminContent').inert=false;$('newsAdminContent').setAttribute('aria-hidden','false'); }
function accept(value){
 if(!value||typeof value.token!=='string'||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now())throw Error('Sitzung abgelaufen.');
 session={token:value.token,expiresAt:value.expiresAt};unlockGate();try{localStorage.setItem(sessionKey,JSON.stringify(session));}catch{}
 clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>{locked();forget();message('Sitzung abgelaufen. Bitte erneut anmelden.');},value.expiresAt-Date.now());
}
async function admin(path='',options={}){
 if(!session||session.expiresAt<=Date.now()){locked();throw Error('Bitte erneut anmelden.');}
 try{return await request('/news/admin'+path,options,session.token);}catch(e){if(e.status===401){locked();forget();}throw e;}
}
function input(status){return {id:current.id,revision:current.revision,title:$('postTitle').value,category:$('postCategory').value,excerpt:$('postExcerpt').value,content:$('postContent').value,image:$('postImage').value,status:status||$('postStatus').value};}
async function load(){
 const data=await admin();$('newsAdminList').replaceChildren();
 for(const p of data.posts){
  const row=element('div','news-admin-row'),text=element('div');
  text.append(element('strong','',p.title),element('small','',`${p.category} · ${p.status==='draft'?'Entwurf':'Veröffentlicht'}${p.hidden?' · Ausgeblendet':''} · ${p.source==='discord'?'Discord':'Manuell'} · ${dateFormatter.format(new Date(p.updatedAt))}`));
  const button=element('button','news-button',p.source==='manual'?'Bearbeiten':p.hidden?'Einblenden':'Ausblenden');button.type='button';
  button.addEventListener('click',async()=>{if(busy)return;if(p.source==='manual'){if(dirty&&!confirm('Ungespeicherte Änderungen verwerfen?'))return;edit(p);$('postTitle').focus();}else{try{await admin('/moderate',{method:'POST',body:JSON.stringify({id:p.id,revision:p.revision,hidden:!p.hidden})});changed=true;await load();message('Sichtbarkeit aktualisiert.');}catch(e){message(e.message);}}});
  row.append(text,button);$('newsAdminList').append(row);
 }
 if(!data.posts.length)$('newsAdminList').append(element('p','muted','Noch keine Beiträge gespeichert.'));
 unlock();
}
function loginError(error){
 if(session&&error.status!==401){lockEditor();message('Anmeldung gültig. '+([404,503].includes(error.status)?'Die News-Verwaltung ist noch nicht verfügbar. Bitte D1-Bindung, Migrationen und Worker-Deployment in Cloudflare prüfen.':'Verbindung zur News-Verwaltung fehlgeschlagen. Bitte erneut versuchen.'));}
 else {if(error.status===401)forget();locked();message(error.status===401?'Passwort oder Sitzung ungültig.':error.message);}
}
async function authenticate(credentials){accept(await request('/auth',{method:'POST',body:JSON.stringify(credentials)}));$('newsPassword').value='';$('openNewsAdmin').disabled=true;}
async function checkConnection(successMessage){await admin();message(successMessage);}
$('openNewsAdmin').addEventListener('click',async()=>{
 if(busy)return;
 if(!session||session.expiresAt<=Date.now()){locked();message('Bitte zuerst anmelden.');return;}
 if(!panel.hidden){panel.scrollIntoView({block:'start',behavior:'auto'});return;}
 busy=true;$('openNewsAdmin').disabled=true;message('Verbindung zur Beitragsverwaltung wird geprüft …');
 try{await load();panel.hidden=false;$('openNewsAdmin').setAttribute('aria-expanded','true');message('Beitragsverwaltung bereit.');panel.scrollIntoView({block:'start',behavior:'auto'});$('postTitle').focus({preventScroll:true});}
 catch(e){loginError(e);}finally{busy=false;$('openNewsAdmin').disabled=!session;}
});
$('newsLoginForm').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;busy=true;$('newsLoginForm').querySelector('button').disabled=true;message('Anmeldung wird geprüft …');
 try{await authenticate({password:$('newsPassword').value});message('Angemeldet. Verbindung wird geprüft …');await checkConnection('Angemeldet. News-Verwaltung verfügbar.');}
 catch(e){loginError(e);}finally{busy=false;$('newsLoginForm').querySelector('button').disabled=false;$('openNewsAdmin').disabled=!session;if(session)$('openNewsAdmin').focus({preventScroll:true});}
});
async function restore(){
 let saved;try{saved=JSON.parse(localStorage.getItem(sessionKey));}catch{}
 if(!saved||saved.expiresAt<=Date.now())return;
 busy=true;$('newsLoginForm').querySelector('button').disabled=true;message('Bestehende Admin-Sitzung wird geprüft …');
 try{await authenticate({token:saved.token});await checkConnection('Bestehende Admin-Sitzung übernommen.');}
 catch(e){loginError(e);}finally{busy=false;$('newsLoginForm').querySelector('button').disabled=false;$('openNewsAdmin').disabled=!session;}
}
function close(){if(busy){message('Bitte Speichervorgang abwarten.');return;}if(dirty&&!confirm('Ungespeicherte Änderungen verwerfen?'))return;panel.hidden=true;$('openNewsAdmin').setAttribute('aria-expanded','false');dirty=false;if(changed){location.reload();return;}$('openNewsAdmin').focus();}
$('closeNewsAdmin').addEventListener('click',close);
$('newNewsPost').addEventListener('click',()=>{if(!dirty||confirm('Ungespeicherte Änderungen verwerfen?')){edit();$('postTitle').focus();}});
$('reloadNewsAdmin').addEventListener('click',()=>load().catch(e=>{if(!session)locked();message(e.message);}));
$('logoutNewsAdmin').addEventListener('click',()=>{forget();locked();message('Abgemeldet.');$('newsPassword').focus();});
$('newsEditorForm').addEventListener('input',()=>{dirty=true;});
$('previewNewsPost').addEventListener('click',()=>{if(!$('newsEditorForm').reportValidity())return;const p=input();$('newsEditorPreview').replaceChildren(article({...p,author:'VeloCity',publishedAt:p.status==='published'?current.publishedAt||new Date().toISOString():null},true));$('newsEditorPreview').hidden=false;});
$('newsEditorForm').addEventListener('submit',async event=>{
 event.preventDefault();if(busy||$('newsAdminContent').inert)return;busy=true;$('newsEditorForm').inert=true;message('Beitrag wird gespeichert …');
 try{const data=await admin('',{method:'POST',body:JSON.stringify(input(event.submitter?.dataset.status))});edit(data.post);changed=true;await load();message(data.post.status==='published'?'Beitrag veröffentlicht.':'Entwurf gespeichert.');}
 catch(e){message(e.message);}finally{busy=false;$('newsEditorForm').inert=false;}
});
$('deleteNewsPost').addEventListener('click',async()=>{if(busy||!current.revision||!confirm('Diesen Beitrag endgültig löschen?'))return;busy=true;
 try{await admin('/delete',{method:'POST',body:JSON.stringify({id:current.id,revision:current.revision})});edit();changed=true;await load();message('Beitrag gelöscht.');}catch(e){message(e.message);}finally{busy=false;}
});
window.addEventListener('storage',event=>{if(event.key===sessionKey&&!event.newValue){locked();message('Admin-Sitzung beendet.');}});
locked();restore();
