import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../bluemap-worker/worker.mjs';

test('fixed BlueMap origin, streaming assets, safe headers and HTTPS redirects', async () => {
 const original=globalThis.fetch;
 let calls=[],reply;
 globalThis.fetch=async (url,options)=>{calls.push({url,options});return reply;};
 const run=(path,init)=>worker.fetch(new Request('https://map.example'+path,init));
 try {
  const bytes=new Uint8Array([0,255,20,145]);
  reply=new Response(bytes,{status:206,headers:{'Content-Type':'application/octet-stream','Content-Range':'bytes 0-3/8','Set-Cookie':'private=1','X-Frame-Options':'DENY'}});
  const out=await run('/maps/world/tiles/a.bin?version=2',{headers:{Range:'bytes=0-3',Cookie:'private=1',Authorization:'Bearer private'}});
  assert.equal(calls[0].url,'http://bluemap-origin.microminer.ch:13003/maps/world/tiles/a.bin?version=2');
  assert.equal(calls[0].options.redirect,'manual');
  assert.equal(calls[0].options.headers.get('range'),'bytes=0-3');
  assert.equal(calls[0].options.headers.get('cookie'),null);assert.equal(calls[0].options.headers.get('authorization'),null);
  assert.equal(out.status,206);assert.deepEqual(new Uint8Array(await out.arrayBuffer()),bytes);
  assert.equal(out.headers.get('set-cookie'),null);assert.equal(out.headers.get('x-frame-options'),null);
  assert.match(out.headers.get('content-security-policy'),/frame-ancestors 'self' https:\/\/microminer.github.io/);
  assert.equal(out.headers.get('cache-control'),'no-store');
  reply=new Response(null,{status:304,headers:{ETag:'v1'}});assert.equal((await run('/settings.json')).status,304);
  reply=new Response(null,{status:200});await run('//other.example/path?url=https://other.example/');
  assert.equal(new URL(calls.at(-1).url).origin,'http://bluemap-origin.microminer.ch:13003');
  reply=new Response(null,{status:302,headers:{Location:'http://bluemap-origin.microminer.ch:13003/maps/?v=1'}});
  assert.equal((await run('/')).headers.get('location'),'https://map.example/maps/?v=1');
  reply=new Response(null,{status:302,headers:{Location:'https://other.example/'}});assert.equal((await run('/')).status,502);
  const count=calls.length;assert.equal((await run('/',{method:'POST',body:'data'})).status,405);assert.equal(calls.length,count);
  reply=new Response(null,{status:200});const head=await run('/',{method:'HEAD'});assert.equal(await head.text(),'');
  reply=new Response('missing',{status:404});assert.equal((await run('/missing')).status,404);
  globalThis.fetch=async()=>{throw Error('network failure');};const failed=await run('/');assert.equal(failed.status,502);assert.match(await failed.text(),/13003/);
 } finally {globalThis.fetch=original;}
});
