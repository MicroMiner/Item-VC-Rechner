// VeloCity admin backend – deployed as Cloudflare Worker.
// ADMIN_PASSWORD and GITHUB_TOKEN MUST be stored as Cloudflare Secrets.
const jsonHeaders = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'};
const reply=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{...jsonHeaders,...headers}});
async function sameSecret(a,b){
  const enc=new TextEncoder();const digest=x=>crypto.subtle.digest('SHA-256',enc.encode(x));
  const [aa,bb]=await Promise.all([digest(a),digest(b)]);
  const x=new Uint8Array(aa),y=new Uint8Array(bb);let diff=0;
  for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}
const SESSION_DURATION_MS=30*60*1000;
async function sessionKey(env){
 return crypto.subtle.importKey('raw',new TextEncoder().encode(env.ADMIN_PASSWORD),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function createSession(env){
 const expiresAt=Date.now()+SESSION_DURATION_MS;
 const payload=toBase64(JSON.stringify({expiresAt,origin:env.SITE_ORIGIN.replace(/\/$/,''),nonce:crypto.randomUUID()}));
 const signature=await crypto.subtle.sign('HMAC',await sessionKey(env),new TextEncoder().encode('velocity-admin-session:'+payload));
 const hex=Array.from(new Uint8Array(signature),b=>b.toString(16).padStart(2,'0')).join('');
 return {token:payload+'.'+hex,expiresAt};
}
async function verifySession(token,env){
 if(typeof token!=='string'||token.length>2048)return null;
 try{
  const [payload,hex,extra]=token.split('.');
  if(extra!==undefined||!payload||!(/^[a-f0-9]{64}$/).test(hex))return null;
  const signature=Uint8Array.from(hex.match(/../g),x=>parseInt(x,16));
  if(!await crypto.subtle.verify('HMAC',await sessionKey(env),signature,new TextEncoder().encode('velocity-admin-session:'+payload)))return null;
  const data=JSON.parse(fromBase64(payload));
  if(!Number.isSafeInteger(data.expiresAt)||data.expiresAt<=Date.now()||data.expiresAt>Date.now()+SESSION_DURATION_MS||data.origin!==env.SITE_ORIGIN.replace(/\/$/,''))return null;
  return {token,expiresAt:data.expiresAt};
 }catch{return null}
}
async function authorized(body,env){
 if(body.token)return !!await verifySession(body.token,env);
 return typeof body.password==='string'&&body.password.length<=256&&await sameSecret(body.password,env.ADMIN_PASSWORD);
}
function validList(data){
 if(!data||data.format!=='VeloCoin-Preisliste'||data.version!==2||!Array.isArray(data.items)||!Array.isArray(data.customItems))return false;
 if(data.items.length<1||data.items.length>3000||data.customItems.length>3000)return false;
 const ids=new Set();
 for(const [items,isCustom] of [[data.items,false],[data.customItems,true]])for(const item of items){
  if(!item||typeof item.id!=='string'||!(isCustom?/^CUSTOM_[a-zA-Z0-9_-]+$/:/^[A-Z][A-Z0-9_]*$/).test(item.id)||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>100)return false;
  const buy=item.buy??item.standardPrice??item.price??item.sell,sell=item.sell??item.price??item.buy;
  if(![buy,sell,item.defaultBuy??buy,item.defaultSell??sell].every(v=>Number.isFinite(v)&&v>0))return false;
  ids.add(item.id);
 }
 return ids.has('DIRT');
}
const validFile=name=>typeof name==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.json$/.test(name)&&name!=='index.json';
async function ghRequest(env,method,body,file){
 const path='preislisten'+(file?'/'+encodeURIComponent(file):'');
 const url=new URL(`https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${path}`);
 if(method==='GET'&&env.GITHUB_BRANCH)url.searchParams.set('ref',env.GITHUB_BRANCH);
 return fetch(url,{method,headers:{'Accept':'application/vnd.github+json','Content-Type':'application/json','Authorization':`Bearer ${env.GITHUB_TOKEN}`,'User-Agent':'VeloCity-Price-Manager','X-GitHub-Api-Version':'2022-11-28'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
}
function toBase64(text){const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary)}
function fromBase64(s){const binary=atob(s.replace(/\s/g,''));return new TextDecoder().decode(Uint8Array.from(binary,c=>c.charCodeAt(0)))}
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin')||'';
  const allowed=env.SITE_ORIGIN?.replace(/\/$/,'');
  const cors=origin===allowed?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Access-Control-Allow-Headers':'Content-Type'}:{};
  if(!allowed||!env.ADMIN_PASSWORD||!env.GITHUB_TOKEN||!env.GITHUB_OWNER||!env.GITHUB_REPO)return reply({error:'Worker-Konfiguration unvollständig.'},503,cors);
  if(origin!==allowed)return reply({error:'Origin nicht zugelassen.'},403,cors);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  const url=new URL(request.url),pathname=url.pathname;
  const file=url.searchParams.get('file');
  if(pathname==='/prices'&&!validFile(file))return reply({error:'Ungültiger Preislisten-Dateiname.'},400,cors);
  try{
   if(pathname==='/auth'&&request.method==='POST'){
    const body=await request.json();
    if(body.token){
     const session=await verifySession(body.token,env);
     return session?reply({ok:true,...session},200,cors):reply({error:'Sitzung abgelaufen. Bitte erneut anmelden.'},401,cors);
    }
    if(!await authorized(body,env))return reply({error:'Passwort ungültig.'},401,cors);
    return reply({ok:true,...await createSession(env)},200,cors);
   }
   if(pathname==='/lists'&&request.method==='GET'){
    const gh=await ghRequest(env,'GET');if(!gh.ok)return reply({error:'Preislisten-Verzeichnis nicht verfügbar.'},502,cors);
    const entries=await gh.json();if(!Array.isArray(entries))return reply({error:'Ungültiges Verzeichnis.'},502,cors);
    return reply({lists:entries.filter(x=>x.type==='file'&&validFile(x.name)).map(x=>({file:x.name,name:x.name.replace(/\.json$/,'')})).sort((a,b)=>a.file.localeCompare(b.file))},200,cors);
   }
   if(pathname==='/prices'&&request.method==='GET'){
    const gh=await ghRequest(env,'GET',undefined,file);if(!gh.ok)return reply({error:'GitHub-Lesen fehlgeschlagen (HTTP '+gh.status+').'},502,cors);
    const item=await gh.json();const data=JSON.parse(fromBase64(item.content));if(!validList(data))return reply({error:'JSON hat ein ungültiges Format.'},502,cors);
    return reply({data,sha:item.sha},200,cors);
   }
   if(pathname==='/prices'&&request.method==='PUT'){
    const raw=await request.text();if(raw.length>500000)return reply({error:'Datei zu gross.'},413,cors);
    const body=JSON.parse(raw);
    if(!await authorized(body,env))return reply({error:'Anmeldung ungültig oder Sitzung abgelaufen.'},401,cors);
    if(!validList(body.data)||typeof body.sha!=='string'||!(/^[a-f0-9]{40}$/i).test(body.sha))return reply({error:'Ungültige Preisliste oder Versionsnummer.'},400,cors);
    const savedData={...body.data,updatedAt:new Date().toISOString()};
    const payload={message:'VeloCity: Preisliste aktualisieren',content:toBase64(JSON.stringify(savedData,null,2)+'\n'),sha:body.sha};
    if(env.GITHUB_BRANCH)payload.branch=env.GITHUB_BRANCH;
    const gh=await ghRequest(env,'PUT',payload,file);
    if(!gh.ok){const detail=await gh.json().catch(()=>({}));return reply({error:gh.status===409||gh.status===422?'Speicherkonflikt: Die Liste wurde zwischenzeitlich geändert. Bitte erneut laden.':'GitHub-Speichern fehlgeschlagen (HTTP '+gh.status+').'},gh.status===409||gh.status===422?409:502,cors)}
    const data=await gh.json();return reply({ok:true,sha:data.content.sha,updatedAt:savedData.updatedAt},200,cors);
   }
   return reply({error:'Nicht gefunden.'},404,cors);
  }catch(e){return reply({error:'Anfrage konnte nicht verarbeitet werden.'},400,cors)}
 }
};
