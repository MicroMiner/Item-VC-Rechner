import { api, sessionKey, request } from './news-data.js';
import { element, article, dateFormatter } from './news-format.js';
const $=id=>document.getElementById(id),dialog=$('newsAdminDialog');
let session=null,current=null,busy=false,dirty=false,changed=false,expiryTimer;
function message(text){$('newsAdminMessage').textContent=text;}
function locked(){session=null;clearTimeout(expiryTimer);$('newsAdminContent').hidden=true;$('newsLoginForm').hidden=false;}
function accept(value){
 if(!value||typeof value.token!=='string'||!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now())throw Error('Sitzung abgelaufen.');
 session={token:value.token,expiresAt:value.expiresAt};try{localStorage.setItem(sessionKey,JSON.stringify(session));}catch{}
 clearTimeout(expiryTimer);expiryTimer=setTimeout(()=>{locked();message('Sitzung abgelaufen. Bitte erneut anmelden.');},value.expiresAt-Date.now());
 $('newsLoginForm').hidden=true;$('newsAdminContent').hidden=false;
}
async function admin(path='',options={}){
 if(!session||session.expiresAt<=Date.now()){locked();throw Error('Bitte erneut anmelden.');}
 try{return await request('/news/admin'+path,options,session.token);}catch(e){if(e.status===401){locked();try{localStorage.removeItem(sessionKey);}catch{}}throw e;}
}
function input(status){return {id:current.id,revision:current.revision,title:$('postTitle').value,category:$('postCategory').value,excerpt:$('postExcerpt').value,content:$('postContent').value,image:$('postImage').value,status:status||$('postStatus').value};}
function edit(post=null){current=post?{...post}:{id:crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join(''),revision:null};$('postTitle').value=post?.title||'';$('postCategory').value=post?.category||'Update';$('postExcerpt').value=post?.excerpt||'';$('postContent').value=post?.content||'';$('postImage').value=post?.image||'';$('postStatus').value=post?.status||'draft';$('deleteNewsPost').hidden=!post;$('newsEditorPreview').hidden=true;dirty=false;}
async function load(){
 const data=await admin();$('newsAdminList').replaceChildren();
 for(const p of data.posts){const row=element('div','news-admin-row'),text=element('div');text.append(element('strong','',p.title),element('small','',`${p.category} · ${p.status==='draft'?'Entwurf':'Veröffentlicht'}${p.hidden?' · Ausgeblendet':''} · ${p.source==='discord'?'Discord':'Manuell'} · ${dateFormatter.format(new Date(p.updatedAt))}`));const button=element('button','news-button',p.source==='manual'?'Bearbeiten':p.hidden?'Einblenden':'Ausblenden');button.type='button';button.addEventListener('click',async()=>{if(busy)return;if(p.source==='manual'){if(dirty&&!confirm('Ungespeicherte Änderungen verwerfen?'))return;edit(p);$('postTitle').focus();}else{try{await admin('/moderate',{method:'POST',body:JSON.stringify({id:p.id,revision:p.revision,hidden:!p.hidden})});changed=true;await load();message('Sichtbarkeit aktualisiert.');}catch(e){message(e.message);}}});row.append(text,button);$('newsAdminList').append(row);}
 if(!data.posts.length)$('newsAdminList').append(element('p','muted','Noch keine Beiträge gespeichert.'));
}
$('openNewsAdmin').addEventListener('click',async()=>{
 if(!dialog.open)dialog.showModal();message('Admin-Zugang wird geprüft …');locked();
 let saved;try{saved=JSON.parse(localStorage.getItem(sessionKey));}catch{}
 if(saved&&saved.expiresAt>Date.now()){try{accept(await request('/auth',{method:'POST',body:JSON.stringify({token:saved.token})}));await load();if(!current)edit();message('Bestehende Admin-Sitzung übernommen.');return;}catch(e){locked();message(e.message);}}
 else message(api?'Bitte mit dem bestehenden Admin-Passwort anmelden.':'News-API noch nicht eingerichtet.');
 $('newsPassword').focus();
});
$('newsLoginForm').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;busy=true;message('Anmeldung wird geprüft …');
 try{accept(await request('/auth',{method:'POST',body:JSON.stringify({password:$('newsPassword').value})}));$('newsPassword').value='';await load();edit();message('Angemeldet.');}catch(e){locked();message(e.message);}finally{busy=false;}
});
function close(){if(busy){message('Bitte Speichervorgang abwarten.');return;}if(dirty&&!confirm('Ungespeicherte Änderungen verwerfen?'))return;dialog.close();dirty=false;if(changed){location.reload();return;}$('openNewsAdmin').focus();}
$('closeNewsAdmin').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
$('newNewsPost').addEventListener('click',()=>{if(!dirty||confirm('Ungespeicherte Änderungen verwerfen?')){edit();$('postTitle').focus();}});
$('reloadNewsAdmin').addEventListener('click',()=>load().catch(e=>message(e.message)));
$('logoutNewsAdmin').addEventListener('click',()=>{try{localStorage.removeItem(sessionKey);}catch{}locked();message('Abgemeldet.');});
$('newsEditorForm').addEventListener('input',()=>{dirty=true;});
$('previewNewsPost').addEventListener('click',()=>{if(!$('newsEditorForm').reportValidity())return;const p=input();$('newsEditorPreview').replaceChildren(article({...p,author:'VeloCity',publishedAt:p.status==='published'?current.publishedAt||new Date().toISOString():null},true));$('newsEditorPreview').hidden=false;});
$('newsEditorForm').addEventListener('submit',async event=>{
 event.preventDefault();if(busy)return;busy=true;$('newsEditorForm').inert=true;message('Beitrag wird gespeichert …');
 try{const data=await admin('',{method:'POST',body:JSON.stringify(input(event.submitter?.dataset.status))});edit(data.post);changed=true;await load();message(data.post.status==='published'?'Beitrag veröffentlicht.':'Entwurf gespeichert.');}
 catch(e){message(e.message);}finally{busy=false;$('newsEditorForm').inert=false;}
});
$('deleteNewsPost').addEventListener('click',async()=>{if(busy||!current.revision||!confirm('Diesen Beitrag endgültig löschen?'))return;busy=true;
 try{await admin('/delete',{method:'POST',body:JSON.stringify({id:current.id,revision:current.revision})});edit();changed=true;await load();message('Beitrag gelöscht.');}catch(e){message(e.message);}finally{busy=false;}
});
// Externally logging out in the converter also locks this tab.
window.addEventListener('storage',event=>{if(event.key===sessionKey&&!event.newValue){locked();message('Admin-Sitzung beendet.');}});

$('openNewsAdmin').disabled=false;
