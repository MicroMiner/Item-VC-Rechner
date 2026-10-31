const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const http=require('node:http');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname;if(pathname==='/config.js'){res.setHeader('Content-Type','application/javascript');res.end("window.VELOCITY_API_URL='';");return;}const target=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(target,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',target.endsWith('.json')?'application/json':target.endsWith('.html')?'text/html':'application/javascript');res.end(data);});});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
const p=await b.newPage();p.on('dialog',dialog=>dialog.accept());const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(base);await p.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Preisliste geladen'),{},{timeout:10000});
assert.equal(await p.locator('#priceList').inputValue(),'VeloCoin_Preisliste.json');
const data=JSON.parse(fs.readFileSync(path.join(root,'preislisten/VeloCoin_Preisliste.json')));
await p.locator('#fromQty').fill('3');assert.equal(Number(await p.locator('#toQty').inputValue()),Math.floor(3*data.items.find(x=>x.id==='DIAMOND').sell/data.items.find(x=>x.id==='DIRT').buy+1e-10));
assert.equal(await p.locator('#adminInner').evaluate(e=>e.inert),true);assert.equal(await p.locator('#priceList').isDisabled(),true);assert.equal(await p.locator('#priceList').evaluate(e=>!!e.closest('#adminInner')),true);
console.log('PASS static directory manifest, original JSON precision and conversion');
const second=structuredClone(data);second.items.find(x=>x.id==='DIAMOND').sell=123.456;
const writes=[],authRequests=[];let failSecond=false,rejectSession=false,sessionDuration=30*60*1000;
await p.route('**/config.js',r=>r.fulfill({contentType:'application/javascript',body:"window.VELOCITY_API_URL='http://api.local';"}));
await p.route('http://api.local/**',async r=>{const u=new URL(r.request().url());const file=u.searchParams.get('file');let body;
if(u.pathname==='/lists')body={lists:[{file:'VeloCoin_Preisliste.json',name:'Standard'},{file:'second.json',name:'Zweite'}]};
else if(u.pathname==='/auth'){
const credentials=r.request().postDataJSON();authRequests.push(credentials);
if(credentials.token&&rejectSession)return r.fulfill({status:401,json:{error:'Sitzung abgelaufen'}});
body={ok:true,token:credentials.token||'test-session-token',expiresAt:credentials.token?JSON.parse(await p.evaluate(()=>localStorage.getItem('velocity.adminSession:http://api.local'))).expiresAt:Date.now()+sessionDuration};
}
else if(r.request().method()==='PUT'){writes.push({file,...r.request().postDataJSON()});body={sha:'b'.repeat(40)};}
else {if(file==='second.json'&&failSecond)return r.fulfill({status:502,body:'{}'});body={data:file==='second.json'?second:data,sha:'a'.repeat(40)}}
await r.fulfill({json:body});});
await p.reload();await p.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Preisliste geladen'));
await p.locator('#adminPassword').fill('test-only');await p.locator('#adminLogin button').click();await p.waitForFunction(()=>!document.querySelector('#adminInner').inert);
await p.locator('#editItem').selectOption('DIAMOND');await p.locator('#editBuy').fill('15.875');await p.locator('#editSell').fill('7.125');await p.locator('#saveEdit').click();
await p.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Online gespeichert'));
assert.equal(writes.length,1);assert.equal(writes[0].token,'test-session-token');assert.ok(!('password' in writes[0]));assert.equal(writes[0].file,'VeloCoin_Preisliste.json');const diamond=writes[0].data.items.find(x=>x.id==='DIAMOND');assert.equal(diamond.buy,15.875);assert.equal(diamond.sell,7.125);assert.equal(diamond.defaultBuy,data.items.find(x=>x.id==='DIAMOND').buy);
await p.locator('#priceList').selectOption('second.json');await p.locator('#reloadData').click();await p.waitForFunction(()=>document.querySelector('#listStatus').textContent==='Geladen: second.json');
await p.locator('#editItem').selectOption('DIAMOND');assert.equal(await p.locator('#editSell').inputValue(),'123.456');await p.locator('#editSell').fill('2.333');await p.locator('#saveEdit').click();
await p.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Online gespeichert'));assert.equal(writes[1].file,'second.json');
await p.locator('#priceList').selectOption('VeloCoin_Preisliste.json');await p.locator('#reloadData').click();await p.waitForFunction(()=>document.querySelector('#listStatus').textContent==='Geladen: VeloCoin_Preisliste.json');failSecond=true;
await p.locator('#priceList').selectOption('second.json');await p.locator('#reloadData').click();await p.waitForFunction(()=>document.querySelector('#listStatus').textContent.includes('HTTP 502'));assert.equal(await p.locator('#priceList').inputValue(),'VeloCoin_Preisliste.json');
const storageKey='velocity.adminSession:http://api.local';
const saved=await p.evaluate(key=>localStorage.getItem(key),storageKey);assert.ok(saved.includes('test-session-token'));assert.ok(!saved.includes('test-only'));
await p.reload();await p.waitForFunction(()=>!document.querySelector('#adminInner').inert);
assert.deepEqual(authRequests.at(-1),{token:'test-session-token'});
assert.equal(await p.locator('#adminPassword').inputValue(),'');
await p.locator('#adminLogout').click();assert.equal(await p.evaluate(key=>localStorage.getItem(key),storageKey),null);
let authCount=authRequests.length;await p.reload();await p.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Preisliste geladen'));
assert.equal(await p.locator('#adminInner').evaluate(e=>e.inert),true);assert.equal(await p.locator('#priceList').isDisabled(),true);assert.equal(await p.locator('#priceList').evaluate(e=>!!e.closest('#adminInner')),true);assert.equal(authRequests.length,authCount);
await p.evaluate(key=>localStorage.setItem(key,JSON.stringify({token:'expired',expiresAt:Date.now()-1000})),storageKey);
await p.reload();await p.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Preisliste geladen'));assert.equal(authRequests.length,authCount);assert.equal(await p.evaluate(key=>localStorage.getItem(key),storageKey),null);
await p.evaluate(key=>localStorage.setItem(key,JSON.stringify({token:'revoked',expiresAt:Date.now()+100000})),storageKey);rejectSession=true;
await p.reload();await p.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Preisliste geladen'));assert.equal(await p.locator('#adminInner').evaluate(e=>e.inert),true);assert.equal(await p.locator('#priceList').isDisabled(),true);assert.equal(await p.locator('#priceList').evaluate(e=>!!e.closest('#adminInner')),true);assert.equal(await p.evaluate(key=>localStorage.getItem(key),storageKey),null);
rejectSession=false;sessionDuration=1000;
await p.locator('#adminPassword').fill('test-only');await p.locator('#adminLogin button').click();await p.waitForFunction(()=>!document.querySelector('#adminInner').inert);
await p.waitForFunction(()=>document.querySelector('#adminInner').inert,{},{timeout:5000});assert.equal(await p.evaluate(key=>localStorage.getItem(key),storageKey),null);
console.log('PASS session restore after reload, token-only storage/writes, logout, local/server expiry and automatic locking');
await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
console.log('PASS API list switching, separate Buy/Sell writes, default preservation, failure rollback, mobile layout, no uncaught errors');
}finally{await b.close();await new Promise(resolve=>server.close(resolve))}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
