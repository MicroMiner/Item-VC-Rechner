import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/worker.js';
import {TestD1} from './helpers/d1.mjs';
const env=()=>({NEWS_DB:new TestD1(),SITE_ORIGIN:'http://local',ADMIN_PASSWORD:'test-only',GITHUB_TOKEN:'test-only',GITHUB_OWNER:'test',GITHUB_REPO:'test',DISCORD_INGEST_TOKEN:'test-bot',DISCORD_GUILD_ID:'111111111111111111',DISCORD_CHANNEL_ID:'222222222222222222'});
const req=(e,path,data,token)=>worker.fetch(new Request('http://worker'+path,{method:data?'POST':'GET',headers:{Origin:e.SITE_ORIGIN,...(token?{Authorization:'Bearer '+token}:{})},body:data?JSON.stringify(data):undefined}),e);
const login=async e=>(await (await req(e,'/auth',{password:e.ADMIN_PASSWORD})).json()).token;
const imported={id:'discord-333333333333333333',source:'discord',sourceId:'333333333333333333',slug:'imported-discord',title:'Importierte Nachricht',content:'Aus dem bestehenden JSON-Import.',category:'Update',publishedAt:'2026-01-01T10:00:00Z'};
test('website edits and deletions override static imports, remain private for drafts, resist bot overwrites and enforce revisions',async()=>{
 const e=env(),token=await login(e);
 assert.equal((await req(e,'/news/admin',{...imported,original:imported,status:'published'})).status,401);
 let r=await req(e,'/news/admin',{...imported,original:imported,title:'Website-Version',status:'published'},token);assert.equal(r.status,201);let p=(await r.json()).post;
 assert.equal(p.source,'discord');assert.equal(p.slug,imported.slug);
 let overlay=await (await req(e,'/news/overlay')).json();assert.deepEqual(overlay.suppressedIds,[imported.id]);assert.equal(overlay.posts[0].title,'Website-Version');
 const event={eventId:'sync-again',type:'update',eventAt:new Date().toISOString(),publishedAt:imported.publishedAt,messageId:imported.sourceId,guildId:e.DISCORD_GUILD_ID,channelId:e.DISCORD_CHANNEL_ID,title:'Discord-Version',content:'Würde überschreiben',category:'Info'};
 assert.equal((await req(e,'/discord/events',event,e.DISCORD_INGEST_TOKEN)).status,200);
 assert.equal((await (await req(e,'/news/overlay')).json()).posts[0].title,'Website-Version');
 await req(e,'/discord/events',{...event,eventId:'discord-deleted',type:'delete'},e.DISCORD_INGEST_TOKEN);
 assert.equal((await (await req(e,'/news/overlay')).json()).posts[0].title,'Website-Version');
 assert.equal((await req(e,'/news/admin/delete',{id:p.id,revision:0},token)).status,409);
 assert.equal((await req(e,'/news/admin/delete',{id:p.id,revision:p.revision},token)).status,200);
 overlay=await (await req(e,'/news/overlay')).json();assert.equal(overlay.posts.length,0);assert.ok(overlay.suppressedIds.includes(p.id));
 assert.equal((await req(e,'/news/admin',{...imported,original:imported,status:'published'},token)).status,409,'stale static import cannot recreate a deleted row');
 const manual={...imported,id:'static-manual',source:'manual',sourceId:null,slug:'static-manual'};
 assert.equal((await req(e,'/news/admin/delete',{id:manual.id,original:manual},token)).status,200);
 assert.ok((await (await req(e,'/news/overlay')).json()).suppressedIds.includes(manual.id));
 r=await req(e,'/news/admin',{id:'private-draft',title:'Vertraulicher Titel',content:'Nicht öffentlich',category:'Info',status:'draft'},token);assert.equal(r.status,201);
 overlay=await (await req(e,'/news/overlay')).json();assert.equal(JSON.stringify(overlay).includes('Vertraulicher Titel'),false);
 e.NEWS_DB.db.close();
});
test('image endpoint requires authentication, validates bytes and dimensions, bounds storage and serves immutable public images without credentials',async()=>{
 const e=env(),token=await login(e);
 // Minimal JPEG envelope exercises the upload parser. A real canvas JPEG is
 // additionally decoded, uploaded and displayed in the browser integration test.
 const bytes=new Uint8Array([255,216,255,192,0,11,8,3,132,6,64,1,1,17,0,255,217]);
 const upload=(data,auth=token,type='image/jpeg')=>worker.fetch(new Request('http://worker/news/admin/image',{method:'POST',headers:{Origin:e.SITE_ORIGIN,'Content-Type':type,...(auth?{Authorization:'Bearer '+auth}:{})},body:data}),e);
 assert.equal((await upload(bytes,null)).status,401);
 assert.equal((await upload(bytes,token,'image/svg+xml')).status,400);
 assert.equal((await upload(new Uint8Array([1,2,3]))).status,400);
 const wrong=bytes.slice();wrong[10]=1;assert.equal((await upload(wrong)).status,400);
 assert.equal((await upload(new Uint8Array(768001))).status,413);
 const r=await upload(bytes);assert.equal(r.status,201);const saved=await r.json();assert.match(saved.image,/\/news\/image\/[a-f0-9-]+$/);
 const publicImage=await worker.fetch(new Request(saved.image),e);assert.equal(publicImage.status,200);assert.equal(publicImage.headers.get('Content-Type'),'image/jpeg');assert.equal(publicImage.headers.get('X-Content-Type-Options'),'nosniff');assert.deepEqual(new Uint8Array(await publicImage.arrayBuffer()),bytes);
 assert.equal((await worker.fetch(new Request(saved.image,{method:'HEAD'}),e)).status,200);
 assert.equal((await worker.fetch(new Request('http://worker/news/image/invalid'),e)).status,404);
 e.NEWS_DB.db.close();
});
