import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/worker.js';
import {TestD1} from './helpers/d1.mjs';
const env=()=>({NEWS_DB:new TestD1(),SITE_ORIGIN:'http://localhost',ADMIN_PASSWORD:'local-test-only',GITHUB_TOKEN:'mock-only',GITHUB_OWNER:'test',GITHUB_REPO:'test',DISCORD_INGEST_TOKEN:'bot-test-secret',DISCORD_GUILD_ID:'111111111111111111',DISCORD_CHANNEL_ID:'222222222222222222'});
const req=(e,path,method='GET',data,token,origin=e.SITE_ORIGIN)=>worker.fetch(new Request('http://worker'+path,{method,headers:{...(origin?{Origin:origin}:{}),...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined}),e);
const login=async e=>(await (await req(e,'/auth','POST',{password:e.ADMIN_PASSWORD})).json()).token;
const draft={id:'test-manual',title:'Ein sicherer Test',content:'### Neu\n\n- Inhalt **fett**',category:'Update',status:'draft',excerpt:'Auszug',image:null};
test('manual CRUD uses the existing session, hides drafts, rejects conflicts and survives a new worker instance',async()=>{
 const e=env(),token=await login(e);
 assert.equal((await req(e,'/news/admin','POST',draft)).status,401);
 assert.equal((await req(e,'/news/admin','GET',undefined,token,'http://evil')).status,403);
 let r=await req(e,'/news/admin','POST',draft,token);assert.equal(r.status,201);let p=(await r.json()).post;
 assert.equal((await (await req(e,'/news')).json()).posts.length,0);
 assert.equal((await req(e,'/news?slug='+p.slug)).status,404);
 assert.equal((await req(e,'/news/admin','POST',draft,token)).status,409);
 r=await req(e,'/news/admin','POST',{...draft,status:'published',revision:p.revision},token);assert.equal(r.status,200);p=(await r.json()).post;
 assert.equal((await (await req({...e},'/news')).json()).posts[0].id,draft.id);
 assert.equal((await req(e,'/news/admin','POST',{...draft,status:'published',revision:1},token)).status,409);
 assert.equal((await req(e,'/news/admin','POST',{...draft,id:'bad',image:'javascript:alert(1)'},token)).status,400);
 const wrong=token.slice(0,-1)+(token.endsWith('0')?'1':'0');assert.equal((await req(e,'/news/admin','GET',undefined,wrong)).status,401);
 assert.equal((await req(e,'/news/admin/delete','POST',{id:p.id,revision:1},token)).status,409);
 assert.equal((await req(e,'/news/admin/delete','POST',{id:p.id,revision:p.revision},token)).status,200);
 assert.equal((await (await req(e,'/news')).json()).posts.length,0);
 const status=await (await req(e,'/news/status')).json();assert.equal(status.discord.status,'disconnected');assert.ok(!JSON.stringify(status).includes(e.DISCORD_INGEST_TOKEN));
 assert.equal((await req({...e,NEWS_DB:null},'/news')).status,503);
});
test('Discord auth, channel scope, heartbeat, idempotent updates and tombstones',async()=>{
 const e=env(),token=e.DISCORD_INGEST_TOKEN,now=Date.now();
 const event={eventId:'message-create',type:'create',eventAt:new Date(now-3000).toISOString(),publishedAt:new Date(now-5000).toISOString(),messageId:'333333333333333333',guildId:e.DISCORD_GUILD_ID,channelId:e.DISCORD_CHANNEL_ID,title:'Discord Meldung',content:'Inhalt',category:'Info'};
 assert.equal((await req(e,'/discord/events','POST',event)).status,401);
 assert.equal((await req(e,'/discord/events','POST',{...event,channelId:'444444444444444444'},token,null)).status,403);
 assert.equal((await req(e,'/discord/events','POST',event,token,null)).status,200);
 let p=(await (await req(e,'/news')).json()).posts[0];assert.equal(p.source,'discord');
 assert.equal((await (await req(e,'/discord/events','POST',event,token,null)).json()).duplicate,true);
 assert.equal((await (await req(e,'/news')).json()).posts[0].revision,1);
 const update={...event,type:'update',eventId:'message-update',eventAt:new Date(now-2000).toISOString(),title:'Bearbeitete Meldung'};
 assert.equal((await req(e,'/discord/events','POST',update,token,null)).status,200);
 p=(await (await req(e,'/news')).json()).posts[0];assert.equal(p.title,update.title);assert.equal(p.slug,'discord-meldung-'+event.messageId);
 const adminToken=await login(e);assert.equal((await req(e,'/news/admin','POST',{...draft,id:p.id,revision:p.revision},adminToken)).status,409);
 await req(e,'/discord/events','POST',{...event,eventId:'stale-create'},token,null);assert.equal((await (await req(e,'/news')).json()).posts[0].title,update.title);
 const del={...event,eventId:'message-delete',type:'delete',eventAt:new Date(now-1000).toISOString()};await req(e,'/discord/events','POST',del,token,null);
 assert.equal((await (await req(e,'/news')).json()).posts.length,0);
 await req(e,'/discord/events','POST',{...update,eventId:'late-update',eventAt:new Date(now).toISOString()},token,null);assert.equal((await (await req(e,'/news')).json()).posts.length,0);
 assert.equal((await req(e,'/discord/heartbeat','POST',{guildId:e.DISCORD_GUILD_ID,channelId:e.DISCORD_CHANNEL_ID,ok:true},token,null)).status,200);
 assert.equal((await (await req(e,'/news/status')).json()).discord.status,'connected');
 const real=Date.now;Date.now=()=>now+200000;try{assert.equal((await (await req(e,'/news/status')).json()).discord.status,'disconnected');}finally{Date.now=real;}
 await req(e,'/discord/heartbeat','POST',{guildId:e.DISCORD_GUILD_ID,channelId:e.DISCORD_CHANNEL_ID,ok:false},token,null);assert.equal((await (await req(e,'/news/status')).json()).discord.status,'error');
 const notConfigured={...e,DISCORD_GUILD_ID:undefined};assert.equal((await (await req(notConfigured,'/news/status')).json()).discord.status,'not_configured');
});

test('hard deletes retain tombstones and real SQLite storage survives closing/reopening',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const dir=mkdtempSync(join(tmpdir(),'velocity-news-')),file=join(dir,'news.sqlite');
 const e={...env(),NEWS_DB:new TestD1(file),DISCORD_DELETE_MODE:'delete'};
 try{
  const token=await login(e);let r=await req(e,'/news/admin','POST',{...draft,status:'published'},token);assert.equal(r.status,201);
  e.NEWS_DB.db.close();e.NEWS_DB=new TestD1(file);assert.equal((await (await req(e,'/news')).json()).posts.length,1);
  const now=Date.now(),event={eventId:'hard-create',type:'create',eventAt:new Date(now-2000).toISOString(),publishedAt:new Date(now-3000).toISOString(),messageId:'555555555555555555',guildId:e.DISCORD_GUILD_ID,channelId:e.DISCORD_CHANNEL_ID,title:'Wird gelöscht',content:'Test',category:'Update'};
  await req(e,'/discord/events','POST',event,e.DISCORD_INGEST_TOKEN,null);
  await req(e,'/discord/events','POST',{...event,eventId:'hard-delete',type:'delete',eventAt:new Date(now-1000).toISOString()},e.DISCORD_INGEST_TOKEN,null);
  await req(e,'/discord/events','POST',{...event,eventId:'hard-delayed',type:'update',eventAt:new Date(now).toISOString()},e.DISCORD_INGEST_TOKEN,null);
  assert.equal((await (await req(e,'/news')).json()).posts.some(p=>p.source==='discord'),false);
 }finally{e.NEWS_DB.db.close();rmSync(dir,{recursive:true,force:true});}
});
