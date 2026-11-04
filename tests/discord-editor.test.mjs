import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker/worker.js';
import {TestD1} from './helpers/d1.mjs';
import {parseStructuredDiscordNews,discordNewsMarker} from '../shared/discord-news.mjs';
const APP='111111111111111111',GUILD='222222222222222222',CHANNEL='333333333333333333',USER='444444444444444444',ROLE='555555555555555555',ATTACHMENT='666666666666666666',MESSAGE='777777777777777777';
const png=readFileSync(new URL('../assets/images/favicon.png',import.meta.url));
async function setup(){
 const pair=await crypto.subtle.generateKey('Ed25519',true,['sign','verify']);
 const hex=data=>Array.from(new Uint8Array(data),b=>b.toString(16).padStart(2,'0')).join('');
 const env={NEWS_DB:new TestD1(),DISCORD_PUBLIC_KEY:hex(await crypto.subtle.exportKey('raw',pair.publicKey)),DISCORD_APPLICATION_ID:APP,DISCORD_GUILD_ID:GUILD,DISCORD_CHANNEL_ID:CHANNEL,DISCORD_BOT_TOKEN:'fake-bot-secret',DISCORD_NEWS_ADMIN_ROLE_IDS:ROLE,SITE_ORIGIN:'https://site.example',ADMIN_PASSWORD:'fake-admin'};
 let serial=900000000000000000n;const context={jobs:[],waitUntil(p){this.jobs.push(p);}};
 async function request(payload,{timestamp=String(Math.floor(Date.now()/1000)),tamper=false}={}){
  const raw=JSON.stringify(payload),signature=hex(await crypto.subtle.sign('Ed25519',pair.privateKey,new TextEncoder().encode(timestamp+raw)));
  return worker.fetch(new Request('https://worker/discord/interactions',{method:'POST',headers:{'X-Signature-Timestamp':timestamp,'X-Signature-Ed25519':signature},body:raw+(tamper?' ': '')}),env,context);
 }
 async function send(type,data,extra={}){return (await request({id:String(serial++),application_id:APP,guild_id:GUILD,member:{user:{id:USER},roles:[ROLE]},token:'fake-interaction-token',type,data,...extra})).json();}
 const command=()=>send(2,{name:'news',options:[{name:'erstellen',type:1}]});
 const fields=(custom_id,values={},image=false)=>({custom_id,components:[{type:18,component:{type:4,custom_id:'title',value:values.title??'Ein neuer Beitrag'}},{type:18,component:{type:3,custom_id:'category',values:[values.category??'Update']}},{type:18,component:{type:4,custom_id:'excerpt',value:values.excerpt??'Kurze Einleitung'}},{type:18,component:{type:4,custom_id:'content',value:values.content??'### Inhalt\n\n- Erster Punkt\n- Zweiter Punkt'}},{type:18,component:{type:19,custom_id:'image',values:image?[ATTACHMENT]:[]}}],resolved:{attachments:image?{[ATTACHMENT]:{id:ATTACHMENT,url:`https://cdn.discordapp.com/ephemeral-attachments/${CHANNEL}/${ATTACHMENT}/image.png?ex=test`,content_type:'image/png',size:png.length}}:{}}});
 const submit=(modal,values,image=false)=>send(5,fields(modal.data.custom_id,values,image));
 const button=(preview,index)=>preview.data.components[0].components[index].custom_id;
 const state=async id=>JSON.parse((await env.NEWS_DB.prepare('SELECT value FROM news_state WHERE key=?').bind('discord-editor:'+id).first()).value);
 async function flush(){await Promise.all(context.jobs);context.jobs=[];}
 return {env,context,request,send,command,fields,submit,button,state,flush};
}
function transport({memberRoles=[ROLE],wrongGuild=false,rejectOnce=false,uncertain=false}={}){
 const calls=[],messages=[],patches=[];let rejects=rejectOnce;
 const fetcher=async (input,options={})=>{
  const url=new URL(input);calls.push({url:url.href,method:options.method||'GET'});
  if(url.hostname==='cdn.discordapp.com')return new Response(png,{headers:{'Content-Type':'image/png'}});
  if(url.pathname==='/api/v10/oauth2/applications/@me')return Response.json({id:APP});
  if(url.pathname===`/api/v10/channels/${CHANNEL}`)return Response.json({id:CHANNEL,guild_id:wrongGuild?'999999999999999999':GUILD,type:0});
  if(url.pathname.includes('/members/'))return Response.json({user:{id:USER},roles:memberRoles});
  if(url.pathname.startsWith('/api/v10/webhooks/')){patches.push(JSON.parse(options.body));return Response.json({id:'reply'});}
  if(url.pathname===`/api/v10/channels/${CHANNEL}/messages`){
   messages.push(options);if(uncertain)throw Error('Ambiguous connection failure');
   if(rejects){rejects=false;return Response.json({message:'forbidden'},{status:403});}
   return Response.json({id:MESSAGE,channel_id:CHANNEL});
  }
  throw Error('Unexpected test URL: '+url.href);
 };
 return {fetcher,calls,messages,patches};
}
test('raw Ed25519 signature, PING without website credentials, timestamp/body tampering, size and guild/user/role restrictions',async()=>{
 const s=await setup();try{
  assert.equal((await worker.fetch(new Request('https://worker/discord/interactions',{method:'POST',body:'{}'}),s.env,s.context)).status,401);
  assert.equal((await worker.fetch(new Request('https://worker/discord/interactions'),s.env,s.context)).status,405);
  assert.equal((await worker.fetch(new Request('https://worker/discord/interactions',{method:'POST',body:'x'.repeat(65537)}),s.env,s.context)).status,413);
  assert.deepEqual(await (await s.request({type:1})).json(),{type:1});
  assert.equal((await s.request({type:1},{tamper:true})).status,401);
  assert.equal((await s.request({type:1},{timestamp:'1000000000'})).status,401);
  const denied=await s.send(2,{name:'news',options:[{name:'erstellen',type:1}]},{member:{user:{id:USER},roles:[]}});assert.equal(denied.data.flags,64);assert.match(denied.data.content,/nicht freigeschaltet/);
  assert.match((await s.send(2,{name:'news'},{guild_id:'999999999999999999'})).data.content,/nicht freigeschaltet/);
  assert.match((await s.send(2,{name:'news'},{application_id:'999999999999999999'})).data.content,/nicht freigeschaltet/);
  s.env.DISCORD_NEWS_ADMIN_USER_IDS=USER;
  assert.equal((await s.send(2,{name:'news',options:[{name:'erstellen',type:1}]},{member:{user:{id:USER},roles:[]}})).type,9);
  await s.flush();
 }finally{s.env.NEWS_DB.db.close();}
});
test('five current modal fields, limits, full private preview, prefilling/editing, stale revisions, other owners, expiry and cancellation without posting',async()=>{
 const s=await setup();const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('No network expected');};try{
  const modal=await s.command();assert.equal(modal.type,9);assert.equal(modal.data.components.length,5);assert.ok(modal.data.components.every(c=>c.type===18));assert.deepEqual(modal.data.components.map(c=>c.component.type),[4,3,4,4,19]);
  assert.equal(modal.data.components[1].component.options.length,5);
  assert.match((await s.submit(modal,{title:'x'.repeat(161)})).data.content,/Titel/);
  assert.match((await s.submit(modal,{content:'x'.repeat(4001)})).data.content,/Inhalt/);
  assert.match((await s.submit(modal,{excerpt:'x'.repeat(401)})).data.content,/Kurzbeschreibung/);
  assert.match((await s.submit(modal,{category:'Unknown'})).data.content,/Kategorie/);
  const invalid=s.fields(modal.data.custom_id,{},true);invalid.resolved.attachments[ATTACHMENT].url='https://evil.example/image.png';assert.match((await s.send(5,invalid)).data.content,/gültiges/);
  const values={title:'T'.repeat(160),content:'C'.repeat(4000),excerpt:'E'.repeat(400),category:'Info'};
  const preview=await s.submit(modal,values,true);assert.equal(preview.type,4);assert.equal(preview.data.flags,64);assert.equal(preview.data.embeds[0].title,values.title);assert.equal(preview.data.embeds[0].description,values.content);assert.equal(preview.data.embeds[0].fields[1].value,values.excerpt);assert.equal(preview.data.components[0].components.length,3);assert.deepEqual(preview.data.allowed_mentions,{parse:[]});
  const edited=await s.send(3,{custom_id:s.button(preview,1)});assert.equal(edited.type,9);assert.equal(edited.data.components[0].component.value,values.title);
  const next=await s.submit(edited,{title:'Bearbeitet'},false);assert.ok(next.data.embeds[0].image,'previous image is retained when no new file is selected');
  assert.match((await s.send(3,{custom_id:s.button(preview,0)})).data.content,/veraltet/);
  assert.match((await s.send(3,{custom_id:s.button(next,0)},{member:{user:{id:'888888888888888888'},roles:[ROLE]}})).data.content,/gehört nicht/);
  const cancelled=await s.send(3,{custom_id:s.button(next,2)});assert.equal(cancelled.type,7);assert.match(cancelled.data.content,/abgebrochen/);
  assert.match((await s.send(3,{custom_id:s.button(next,0)})).data.content,/abgebrochen/);
  const expiry=await s.command(),id=expiry.data.custom_id.split(':')[2],expired=await s.state(id);expired.expiresAt=Date.now()-1;await s.env.NEWS_DB.prepare('UPDATE news_state SET value=? WHERE key=?').bind(JSON.stringify(expired),'discord-editor:'+id).run();
  assert.match((await s.submit(expiry)).data.content,/abgelaufen/);
  assert.equal(calls,0);assert.equal((await s.env.NEWS_DB.prepare('SELECT COUNT(*) AS n FROM news_posts').first()).n,0);await s.flush();
 }finally{globalThis.fetch=original;s.env.NEWS_DB.db.close();}
});
test('explicit confirmation defers immediately, sends one public structured message/image, disables pings and never writes website posts',async()=>{
 const s=await setup(),t=transport(),original=globalThis.fetch;globalThis.fetch=t.fetcher;try{
  const preview=await s.submit(await s.command(),{title:'@everyone Neue News',category:'Changelog'},true);
  const publish=s.button(preview,0);
  let unblock;const blocked=new Promise(resolve=>{unblock=resolve;});
  globalThis.fetch=async(url,options)=>{if(String(url).endsWith('/oauth2/applications/@me'))await blocked;return t.fetcher(url,options);};
  const concurrent=await Promise.all([s.send(3,{custom_id:publish}),s.send(3,{custom_id:publish})]);assert.equal(concurrent.filter(r=>r.type===5).length,1,'only one concurrent confirmation claims the draft');const first=concurrent.find(r=>r.type===5);assert.equal(first.data.flags,64);assert.equal(t.messages.length,0,'HTTP callback must not wait for REST publication');
  const repeated=await s.send(3,{custom_id:publish});assert.match(repeated.data.content,/kein zweiter/);
  unblock();await s.flush();assert.equal(t.messages.length,1);
  const form=t.messages[0].body;assert.ok(form instanceof FormData);const payload=JSON.parse(form.get('payload_json'));assert.equal(payload.enforce_nonce,true);assert.ok(/^\d{17,22}$/.test(payload.nonce));assert.deepEqual(payload.allowed_mentions,{parse:[],replied_user:false});assert.equal(payload.embeds[0].footer.text,discordNewsMarker);assert.equal(payload.embeds[0].image.url,'attachment://title-image.png');assert.equal(form.get('files[0]').size,png.length);
  assert.match(t.patches.at(-1).content,/beim nächsten regulären Abgleich/);
  assert.match((await s.send(3,{custom_id:publish})).data.content,/Bereits veröffentlicht/);assert.equal(t.messages.length,1);
  const message={id:MESSAGE,type:0,channel_id:CHANNEL,author:{id:APP,bot:true},content:payload.content,embeds:[{...payload.embeds[0],image:{url:`https://cdn.discordapp.com/attachments/${CHANNEL}/${ATTACHMENT}/title-image.png`}}],attachments:[{id:ATTACHMENT,filename:'title-image.png',url:`https://cdn.discordapp.com/attachments/${CHANNEL}/${ATTACHMENT}/title-image.png`}],timestamp:new Date().toISOString()};
  const parsed=parseStructuredDiscordNews(message,APP);assert.equal(parsed.title,'@everyone Neue News');assert.equal(parsed.category,'Changelog');assert.equal(parsed.content,payload.embeds[0].description);assert.equal(parsed.excerpt,'Kurze Einleitung');assert.equal(parsed.imageAttachmentId,ATTACHMENT);
  assert.equal(parseStructuredDiscordNews({...message,author:{id:USER,bot:true}},APP),null);
  assert.equal((await s.env.NEWS_DB.prepare('SELECT COUNT(*) AS n FROM news_posts').first()).n,0,'the existing channel sync is the only new publication path to website posts');
  assert.ok(!JSON.stringify((await s.env.NEWS_DB.prepare('SELECT value FROM news_state').all()).results).includes('fake-interaction-token'));
 }finally{globalThis.fetch=original;s.env.NEWS_DB.db.close();}
});
test('revoked roles/wrong channel prevent publication; definitive rejection permits explicit retry; unknown send result never retries',async()=>{
 const original=globalThis.fetch;
 for(const options of [{memberRoles:[]},{wrongGuild:true},{rejectOnce:true},{uncertain:true}]){
  const s=await setup(),t=transport(options);globalThis.fetch=t.fetcher;try{
   const preview=await s.submit(await s.command()),button=s.button(preview,0),id=button.split(':')[2];
   assert.equal((await s.send(3,{custom_id:button})).type,5);await s.flush();const saved=await s.state(id);
   if(options.memberRoles||options.wrongGuild){assert.equal(t.messages.length,0);assert.equal(saved.status,'preview');}
   if(options.rejectOnce){assert.equal(saved.status,'preview');const next=t.patches.at(-1).components[0].components[0].custom_id;assert.equal((await s.send(3,{custom_id:next})).type,5);await s.flush();assert.equal((await s.state(id)).status,'published');assert.equal(t.messages.length,2,'first request was explicitly rejected, only second was published');}
   if(options.uncertain){assert.equal(saved.status,'uncertain');assert.match((await s.send(3,{custom_id:button})).data.content,/kein zweiter/);assert.equal(t.messages.length,1);}
  }finally{s.env.NEWS_DB.db.close();}
 }
 globalThis.fetch=original;
});
