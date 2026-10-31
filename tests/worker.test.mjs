import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker from '../worker/worker.js';
const fixture=JSON.parse(await readFile(new URL('../preislisten/VeloCoin_Preisliste.json',import.meta.url)));
const env={SITE_ORIGIN:'http://localhost',ADMIN_PASSWORD:'local-test',GITHUB_TOKEN:'mock-only',GITHUB_OWNER:'MicroMiner',GITHUB_REPO:'Item-VC-Rechner',GITHUB_BRANCH:'test-branch'};
function request(path,method='GET',body,origin=env.SITE_ORIGIN){return worker.fetch(new Request('http://worker'+path,{method,headers:{Origin:origin},body:body?JSON.stringify(body):undefined}),env)}
test('directory discovery, Buy/Sell round-trip, branch selection and write protection',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,options)=>{
  const u=new URL(url);calls.push({u,options});
  if(options.method==='PUT')return Response.json({content:{sha:'b'.repeat(40)}});
  if(u.pathname.endsWith('/preislisten'))return Response.json([{type:'file',name:'second.json'},{type:'file',name:'VeloCoin_Preisliste.json'},{type:'file',name:'index.json'},{type:'dir',name:'ignored.json'},{type:'file',name:'bad.txt'}]);
  return Response.json({content:Buffer.from(JSON.stringify(fixture)).toString('base64'),sha:'a'.repeat(40)});
 };
 try{
  let r=await request('/lists');assert.equal(r.status,200);assert.equal((await r.json()).lists.length,2);
  r=await request('/prices?file=VeloCoin_Preisliste.json');assert.equal(r.status,200);assert.deepEqual((await r.json()).data,fixture);
  assert.equal(calls.at(-1).u.searchParams.get('ref'),'test-branch');
  assert.ok(calls.at(-1).u.pathname.endsWith('/preislisten/VeloCoin_Preisliste.json'));
  const data=structuredClone(fixture);data.items[0].buy=12.345;data.items[0].sell=2.125;data.items[0].defaultBuy=10;data.items[0].defaultSell=1;
  const body={password:'local-test',sha:'a'.repeat(40),data};
  r=await request('/prices?file=second.json','PUT',body);assert.equal(r.status,200);
  const write=calls.at(-1);assert.ok(write.u.pathname.endsWith('/preislisten/second.json'));
  const payload=JSON.parse(write.options.body);assert.equal(payload.branch,'test-branch');assert.deepEqual(JSON.parse(Buffer.from(payload.content,'base64')),data);
  for(const file of ['../secret.json','index.json','sub/list.json',''])assert.equal((await request('/prices?file='+encodeURIComponent(file))).status,400);
  let count=calls.length;assert.equal((await request('/prices?file=second.json','PUT',{...body,password:'wrong'})).status,401);assert.equal(calls.length,count);
  data.items[0].sell=0;assert.equal((await request('/prices?file=second.json','PUT',body)).status,400);
  assert.equal((await request('/lists','GET',undefined,'https://wrong.example')).status,403);
  globalThis.fetch=async()=>Response.json({error:'conflict'},{status:409});data.items[0].sell=1;
  assert.equal((await request('/prices?file=second.json','PUT',body)).status,409);
 }finally{globalThis.fetch=original}
});

test('admin sessions survive revalidation, expire after 30 minutes and reject tampering',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now;let writes=0;
 globalThis.fetch=async()=>{writes++;return Response.json({content:{sha:'b'.repeat(40)}})};
 const now=originalNow();Date.now=()=>now;
 try{
  assert.equal((await request('/auth','POST',{password:'wrong'})).status,401);
  const login=await request('/auth','POST',{password:env.ADMIN_PASSWORD});assert.equal(login.status,200);
  const session=await login.json();assert.equal(session.expiresAt,now+30*60*1000);assert.equal(typeof session.token,'string');assert.ok(!JSON.stringify(session).includes(env.ADMIN_PASSWORD));
  let response=await request('/auth','POST',{token:session.token});assert.equal(response.status,200);assert.equal((await response.json()).expiresAt,session.expiresAt);
  assert.equal((await request('/prices?file=second.json','PUT',{token:session.token,sha:'a'.repeat(40),data:fixture})).status,200);assert.equal(writes,1);
  const tampered=session.token.slice(0,-1)+(session.token.endsWith('0')?'1':'0');
  assert.equal((await request('/auth','POST',{token:tampered})).status,401);
  const otherPassword={...env,ADMIN_PASSWORD:'changed-password'};
  response=await worker.fetch(new Request('http://worker/auth',{method:'POST',headers:{Origin:env.SITE_ORIGIN},body:JSON.stringify({token:session.token})}),otherPassword);assert.equal(response.status,401);
  Date.now=()=>session.expiresAt;
  assert.equal((await request('/auth','POST',{token:session.token})).status,401);
  assert.equal((await request('/prices?file=second.json','PUT',{token:session.token,sha:'a'.repeat(40),data:fixture})).status,401);assert.equal(writes,1);
 }finally{globalThis.fetch=originalFetch;Date.now=originalNow}
});
