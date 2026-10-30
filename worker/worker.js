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
function validList(data){
 if(!data||data.format!=='VeloCoin-Preisliste'||data.version!==2||!Array.isArray(data.items)||!Array.isArray(data.customItems))return false;
 if(data.items.length<1||data.items.length>3000||data.customItems.length>3000)return false;
 const ids=new Set();
 for(const item of data.items){if(!item||typeof item.id!=='string'||!(/^[A-Z][A-Z0-9_]*$/).test(item.id)||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>100||!Number.isFinite(item.standardPrice)||item.standardPrice<=0||!Number.isFinite(item.price)||item.price<=0)return false;ids.add(item.id)}
 for(const item of data.customItems){if(!item||typeof item.id!=='string'||!(/^CUSTOM_[a-zA-Z0-9_-]+$/).test(item.id)||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||item.name.length>100||!Number.isFinite(item.price)||item.price<=0)return false;ids.add(item.id)}
 return ids.has('DIRT');
}
async function ghRequest(env,method,body){
 const path='VeloCoin_Preisliste.json';
 const url=`https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${path}`;
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
  const pathname=new URL(request.url).pathname;
  try{
   if(pathname==='/auth'&&request.method==='POST'){
    const body=await request.json();const pass=typeof body.password==='string'?body.password:'';
    if(pass.length>256||!await sameSecret(pass,env.ADMIN_PASSWORD))return reply({error:'Passwort ungültig.'},401,cors);
    return reply({ok:true},200,cors);
   }
   if(pathname==='/prices'&&request.method==='GET'){
    const gh=await ghRequest(env,'GET');if(!gh.ok)return reply({error:'GitHub-Lesen fehlgeschlagen (HTTP '+gh.status+').'},502,cors);
    const item=await gh.json();const data=JSON.parse(fromBase64(item.content));if(!validList(data))return reply({error:'JSON hat ein ungültiges Format.'},502,cors);
    return reply({data,sha:item.sha},200,cors);
   }
   if(pathname==='/prices'&&request.method==='PUT'){
    const raw=await request.text();if(raw.length>500000)return reply({error:'Datei zu gross.'},413,cors);
    const body=JSON.parse(raw);const pass=typeof body.password==='string'?body.password:'';
    if(pass.length>256||!await sameSecret(pass,env.ADMIN_PASSWORD))return reply({error:'Passwort ungültig.'},401,cors);
    if(!validList(body.data)||typeof body.sha!=='string'||!(/^[a-f0-9]{40}$/i).test(body.sha))return reply({error:'Ungültige Preisliste oder Versionsnummer.'},400,cors);
    const payload={message:'VeloCity: Preisliste aktualisieren',content:toBase64(JSON.stringify(body.data,null,2)+'\n'),sha:body.sha};
    if(env.GITHUB_BRANCH)payload.branch=env.GITHUB_BRANCH;
    const gh=await ghRequest(env,'PUT',payload);
    if(!gh.ok){const detail=await gh.json().catch(()=>({}));return reply({error:gh.status===409||gh.status===422?'Speicherkonflikt: Die Liste wurde zwischenzeitlich geändert. Bitte erneut laden.':'GitHub-Speichern fehlgeschlagen (HTTP '+gh.status+').'},gh.status===409||gh.status===422?409:502,cors)}
    const data=await gh.json();return reply({ok:true,sha:data.content.sha},200,cors);
   }
   return reply({error:'Nicht gefunden.'},404,cors);
  }catch(e){return reply({error:'Anfrage konnte nicht verarbeitet werden.'},400,cors)}
 }
};
