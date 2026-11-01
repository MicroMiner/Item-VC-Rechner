const {chromium}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const http=require('node:http');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname;if(pathname==='/config.js'){res.setHeader('Content-Type','application/javascript');res.end("window.VELOCITY_API_URL='';");return;}const target=path.resolve(root,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(target,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',target.endsWith('.json')?'application/json':target.endsWith('.html')?'text/html':'application/javascript');res.end(data);});});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
const p=await b.newPage();p.on('dialog',dialog=>dialog.accept());const errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.goto(base);await p.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Preisliste geladen'),{},{timeout:10000});
assert.equal(await p.locator('#priceList').inputValue(),'VeloCoin_Preisliste.json');
async function openAdmin(){if(await p.locator('#toggleAdmin').getAttribute('aria-expanded')!=='true')await p.locator('#toggleAdmin').click();}
assert.equal(await p.locator('#toggleAdmin').getAttribute('aria-expanded'),'false');assert.equal(await p.locator('#adminPanel').evaluate(e=>e.inert),true);assert.equal(await p.locator('#adminPassword').isVisible(),false);
const disclosureOrder=await p.evaluate(()=>{const hero=document.querySelector('.hero').getBoundingClientRect(),about=document.querySelector('.economy-about').getBoundingClientRect(),foot=document.querySelector('.foot').getBoundingClientRect(),toggle=document.querySelector('#toggleAdmin').getBoundingClientRect();return hero.bottom<=about.top&&about.bottom<=foot.top&&foot.bottom<=toggle.top;});assert.equal(disclosureOrder,true);
await p.locator('#toggleAdmin').focus();await p.keyboard.press('Enter');assert.equal(await p.locator('#toggleAdmin').getAttribute('aria-expanded'),'true');assert.equal(await p.locator('#adminInner').evaluate(e=>e.inert),true);
await p.keyboard.press('Space');assert.equal(await p.locator('#toggleAdmin').getAttribute('aria-expanded'),'false');assert.equal(await p.locator('#adminPanel').evaluate(e=>e.inert),true);
console.log('PASS admin collapsed by default, information/footer order, keyboard toggle and preserved password lock');

const data=JSON.parse(fs.readFileSync(path.join(root,'preislisten/VeloCoin_Preisliste.json')));
const fmtQty=n=>new Intl.NumberFormat('de-CH',{maximumFractionDigits:8}).format(n);
async function selectItem(selectId,itemId){
 const side=selectId.replace(/Item$/,'');
 await p.locator('#'+side+'Search').fill(itemId);
 await p.locator('#'+side+'Options [data-item-id="'+itemId+'"]').click();
 assert.equal(await p.locator('#'+selectId).inputValue(),itemId);
}
// Search opens and filters on every typed letter while keeping the selection
// stable until keyboard or pointer confirmation.
await p.locator('#fromSearch').fill('');
let query='';
for(const letter of 'diamond'){
 query+=letter;await p.locator('#fromSearch').pressSequentially(letter);
 const expected=data.items.concat(data.customItems).filter(x=>(x.id+' '+x.name).toLowerCase().includes(query)).length;
 assert.equal(await p.locator('#fromOptions [role="option"]').count(),expected);
 assert.equal(await p.locator('#fromSearch').getAttribute('aria-expanded'),'true');
 assert.equal(await p.locator('#fromItem').inputValue(),'DIAMOND');
}
const firstActive=await p.locator('#fromSearch').getAttribute('aria-activedescendant');
await p.locator('#fromSearch').press('ArrowDown');assert.notEqual(await p.locator('#fromSearch').getAttribute('aria-activedescendant'),firstActive);
await p.locator('#fromSearch').press('ArrowUp');assert.equal(await p.locator('#fromSearch').getAttribute('aria-activedescendant'),firstActive);
await p.locator('#fromSearch').press('Enter');assert.equal(await p.locator('#fromSearch').getAttribute('aria-expanded'),'false');assert.equal(await p.locator('#fromItem').inputValue(),'DIAMOND');
await p.locator('#fromSearch').fill('no-such-item-999');assert.equal(await p.locator('#fromOptions [role="option"]').count(),0);assert.match(await p.locator('#fromOptions').textContent(),/Keine Items/);
await p.locator('#fromSearch').press('Enter');assert.equal(await p.locator('#fromItem').inputValue(),'DIAMOND');
await p.locator('#fromSearch').press('Escape');assert.equal(await p.locator('#fromSearch').inputValue(),data.items.find(x=>x.id==='DIAMOND').name);
await p.locator('#toSearch').fill('STONE');await p.locator('#toSearch').press('Tab');assert.equal(await p.locator('#toSearch').getAttribute('aria-expanded'),'false');assert.equal(await p.locator('#toItem').inputValue(),'DIRT');
console.log('PASS live combobox filtering on every letter, arrow navigation, Enter selection, empty results, Escape and Tab');

async function assertResult(expected,shop=false){
 const fromId=await p.locator('#fromItem').inputValue(),toId=await p.locator('#toItem').inputValue();
 const from=data.items.find(x=>x.id===fromId),to=data.items.find(x=>x.id===toId);
 const amount=Number(await p.locator('#fromQty').inputValue());
 assert.equal(await p.locator('#result').textContent(),shop?`${fmtQty(amount)} × ${from.name} verkaufen → ${fmtQty(expected)} × ${to.name} kaufen`:`${fmtQty(amount)} × ${from.name} = ${fmtQty(expected)} × ${to.name}`);
}
assert.equal(await p.locator('#toQty').count(),0);assert.equal(await p.locator('#total').count(),0);
// Sell-to-Sell is the default: 3 diamonds at 500 VC each equal 1500 dirt at 1 VC each.
assert.equal(await p.locator('#shopMode').isChecked(),false);
await p.locator('#fromQty').fill('3');await assertResult(1500);
await p.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:base});await p.locator('#copy').click();assert.equal(await p.evaluate(()=>navigator.clipboard.readText()),await p.locator('#result').textContent());
assert.match(await p.locator('#toRate').textContent(),/Sell/);
await p.locator('#shopMode').check();await assertResult(Math.floor(3*data.items.find(x=>x.id==='DIAMOND').sell/data.items.find(x=>x.id==='DIRT').buy),true);
assert.match(await p.locator('#toRate').textContent(),/Buy/);
await p.locator('#fromQty').fill('0');await assertResult(0,true);
// Whole-item rounding and the remainder use current shop quotes.
await selectItem('fromItem','DIRT');await selectItem('toItem','STONE');
const stone=data.items.find(x=>x.id==='STONE'),dirt=data.items.find(x=>x.id==='DIRT');
const stoneCount=Math.floor(501*dirt.sell/stone.buy+1e-10);
await p.locator('#fromQty').fill('501');await assertResult(stoneCount,true);
await p.locator('#fromQty').fill('1');await assertResult(0,true);
// The result alone shows fractional comparisons; swap preserves the entered amount.
await p.locator('#shopMode').uncheck();await selectItem('toItem','DIAMOND');await assertResult(0.002);
await p.locator('#fromQty').fill('0.5');await assertResult(0.001);
await p.locator('#swap').click();assert.equal(await p.locator('#fromItem').inputValue(),'DIAMOND');assert.equal(await p.locator('#toItem').inputValue(),'DIRT');assert.equal(await p.locator('#fromQty').inputValue(),'0.5');await assertResult(250);
await p.locator('#fromQty').fill('7');await p.locator('#shopMode').check();
await p.locator('#swap').click();assert.equal(await p.locator('#fromQty').inputValue(),'7');assert.equal(await p.locator('#fromItem').inputValue(),'DIRT');assert.equal(await p.locator('#toItem').inputValue(),'DIAMOND');await assertResult(0,true);
await p.locator('#reset').click();assert.equal(await p.locator('#shopMode').isChecked(),false);await assertResult(500);
console.log('PASS result-only target quantity, preserved source amount on swap, Sell/Sell comparison, Sell/Buy shop, fractional values, rounding, remainder, zero and reset');
// Quick quantities add to the manual input; clearing leaves the input empty.
assert.equal(await p.locator('#quantityShortcuts button[data-amount]').count(),9);
await p.locator('#clearQty').click();assert.equal(await p.locator('#fromQty').inputValue(),'');await assertResult(0);
let quickTotal=0;
for(const value of [1,3,5,10,15,20,30,50,100]){
 await p.locator(`#quantityShortcuts [data-amount="${value}"]`).click();quickTotal+=value;assert.equal(Number(await p.locator('#fromQty').inputValue()),quickTotal);
}
await p.locator('#quantityShortcuts [data-amount="3"]').dblclick();assert.equal(Number(await p.locator('#fromQty').inputValue()),quickTotal+6);
await p.locator('#fromQty').fill('12');await p.locator('#quantityShortcuts [data-amount="10"]').click();assert.equal(await p.locator('#fromQty').inputValue(),'22');
// Carry the actual result, including thousands and fractional values, to source.
await p.locator('#fromQty').fill('100');await p.locator('#fromSearch').fill('Diamant');await assertResult(50000);
assert.equal((await p.locator('#useResult').textContent()).trim(),'');
await p.locator('#useResult').click();assert.equal(await p.locator('#fromItem').inputValue(),'DIRT');assert.equal(await p.locator('#fromQty').inputValue(),'50000');assert.equal(await p.locator('#fromSearch').inputValue(),data.items.find(x=>x.id==='DIRT').name);assert.equal(await p.locator('#toItem').inputValue(),'DIAMOND');await assertResult(100);
await p.locator('#fromQty').fill('1');await selectItem('toItem','DIAMOND');await p.locator('#useResult').click();assert.equal(await p.locator('#fromItem').inputValue(),'DIAMOND');assert.equal(await p.locator('#fromQty').inputValue(),'0.002');assert.equal(await p.locator('#toItem').inputValue(),'DIRT');await assertResult(1);
await selectItem('fromItem','DIRT');await selectItem('toItem','STONE');await p.locator('#fromQty').fill('501');await p.locator('#shopMode').check();await assertResult(stoneCount,true);
await p.locator('#useResult').click();assert.equal(await p.locator('#fromItem').inputValue(),'STONE');assert.equal(Number(await p.locator('#fromQty').inputValue()),stoneCount);assert.equal(await p.locator('#toItem').inputValue(),'DIRT');await assertResult(Math.floor(stoneCount*stone.sell/dirt.buy+1e-10),true);
await p.locator('#clearQty').click();await p.locator('#useResult').click();assert.equal(await p.locator('#fromQty').inputValue(),'0');await assertResult(0,true);
await p.locator('#reset').click();
console.log('PASS additive shortcuts, repeated clicks, manual input, clearing, and result carry with whole, fractional and zero quantities');
for(const [width,height] of [[1280,720],[1366,768],[390,844]]){
 await p.setViewportSize({width,height});
 assert.ok(await p.locator('#quantityShortcuts').evaluate(e=>{const keys=e.getBoundingClientRect(),card=e.closest('section').getBoundingClientRect();return keys.bottom<=card.bottom+1&&keys.right<=card.right+1;}),'Quantity buttons fit inside their card');
}
await p.locator('#clearQty').click();await p.locator('#quantityShortcuts [data-amount="50"]').click();assert.equal(await p.locator('#fromQty').inputValue(),'50');
await p.setViewportSize({width:1280,height:720});await p.locator('#reset').click();

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
await p.reload();await openAdmin();await p.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Preisliste geladen'));
await openAdmin();await p.locator('#adminPassword').fill('test-only');await p.locator('#adminLogin button').click();await p.waitForFunction(()=>!document.querySelector('#adminInner').inert);
await p.locator('#toggleAdmin').click();assert.equal(await p.locator('#adminPanel').evaluate(e=>e.inert),true);await openAdmin();assert.equal(await p.locator('#adminInner').evaluate(e=>e.inert),false);
await selectItem('editItem','DIAMOND');await p.locator('#editBuy').fill('15.875');await p.locator('#editSell').fill('7.125');await p.locator('#saveEdit').click();
await p.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Online gespeichert'));
assert.equal(writes.length,1);assert.equal(writes[0].token,'test-session-token');assert.ok(!('password' in writes[0]));assert.equal(writes[0].file,'VeloCoin_Preisliste.json');const diamond=writes[0].data.items.find(x=>x.id==='DIAMOND');assert.equal(diamond.buy,15.875);assert.equal(diamond.sell,7.125);assert.equal(diamond.defaultBuy,data.items.find(x=>x.id==='DIAMOND').buy);
await p.locator('#priceList').selectOption('second.json');await p.locator('#reloadData').click();await p.waitForFunction(()=>document.querySelector('#listStatus').textContent==='Geladen: second.json');
await selectItem('editItem','DIAMOND');assert.equal(await p.locator('#editSell').inputValue(),'123.456');await p.locator('#editSell').fill('2.333');await p.locator('#saveEdit').click();
await p.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Online gespeichert'));assert.equal(writes[1].file,'second.json');
await p.locator('#priceList').selectOption('VeloCoin_Preisliste.json');await p.locator('#reloadData').click();await p.waitForFunction(()=>document.querySelector('#listStatus').textContent==='Geladen: VeloCoin_Preisliste.json');failSecond=true;
await p.locator('#priceList').selectOption('second.json');await p.locator('#reloadData').click();await p.waitForFunction(()=>document.querySelector('#listStatus').textContent.includes('HTTP 502'));assert.equal(await p.locator('#priceList').inputValue(),'VeloCoin_Preisliste.json');
const storageKey='velocity.adminSession:http://api.local';
const saved=await p.evaluate(key=>localStorage.getItem(key),storageKey);assert.ok(saved.includes('test-session-token'));assert.ok(!saved.includes('test-only'));
await p.reload();assert.equal(await p.locator('#toggleAdmin').getAttribute('aria-expanded'),'false');await openAdmin();await p.waitForFunction(()=>!document.querySelector('#adminInner').inert);
assert.deepEqual(authRequests.at(-1),{token:'test-session-token'});
assert.equal(await p.locator('#adminPassword').inputValue(),'');
await p.locator('#adminLogout').click();assert.equal(await p.evaluate(key=>localStorage.getItem(key),storageKey),null);
let authCount=authRequests.length;await p.reload();await openAdmin();await p.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Preisliste geladen'));
assert.equal(await p.locator('#adminInner').evaluate(e=>e.inert),true);assert.equal(await p.locator('#priceList').isDisabled(),true);assert.equal(await p.locator('#priceList').evaluate(e=>!!e.closest('#adminInner')),true);assert.equal(authRequests.length,authCount);
await p.evaluate(key=>localStorage.setItem(key,JSON.stringify({token:'expired',expiresAt:Date.now()-1000})),storageKey);
await p.reload();await openAdmin();await p.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Preisliste geladen'));assert.equal(authRequests.length,authCount);assert.equal(await p.evaluate(key=>localStorage.getItem(key),storageKey),null);
await p.evaluate(key=>localStorage.setItem(key,JSON.stringify({token:'revoked',expiresAt:Date.now()+100000})),storageKey);rejectSession=true;
await p.reload();await openAdmin();await p.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Preisliste geladen'));assert.equal(await p.locator('#adminInner').evaluate(e=>e.inert),true);assert.equal(await p.locator('#priceList').isDisabled(),true);assert.equal(await p.locator('#priceList').evaluate(e=>!!e.closest('#adminInner')),true);assert.equal(await p.evaluate(key=>localStorage.getItem(key),storageKey),null);
rejectSession=false;sessionDuration=1000;
await openAdmin();await p.locator('#adminPassword').fill('test-only');await p.locator('#adminLogin button').click();await p.waitForFunction(()=>!document.querySelector('#adminInner').inert);
await p.waitForFunction(()=>document.querySelector('#adminInner').inert,{},{timeout:5000});assert.equal(await p.evaluate(key=>localStorage.getItem(key),storageKey),null);
console.log('PASS session restore after reload, token-only storage/writes, logout, local/server expiry and automatic locking');
await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
console.log('PASS API list switching, separate Buy/Sell writes, default preservation, failure rollback, mobile layout, no uncaught errors');
// Information area and legal modal preserve page state and native focus behavior.
assert.equal(await p.locator('#economyAboutTitle').textContent(),'Über das Wirtschaftssystem');
assert.equal(await p.locator('.economy-about p').count(),2);
assert.match(await p.locator('.foot').textContent(),/© 2026 VeloCity Economy.*Developed by MicroMiner.*Impressum/);
const beforeLegal={url:p.url(),origin:await p.evaluate(()=>performance.timeOrigin),item:await p.locator('#fromItem').inputValue(),qty:await p.locator('#fromQty').inputValue()};
const legalLink=p.getByRole('link',{name:'Impressum',exact:true});
await legalLink.click();assert.equal(await p.locator('#impressum').isVisible(),true);
assert.equal(await p.locator('#closeImpressum').evaluate(e=>e===document.activeElement),true);
await p.locator('#impressumTitle').click();assert.equal(await p.locator('#impressum').isVisible(),true);
assert.match(await p.locator('.legal-contact').textContent(),/Betreiber\/in.*\[Wird ergänzt\].*Anschrift.*\[Wird ergänzt\].*Kontakt \/ E-Mail.*\[Wird ergänzt\]/);
await p.locator('#fromSearch').focus();assert.equal(await p.locator('#fromSearch').evaluate(e=>e===document.activeElement),false);
await p.keyboard.press('Escape');assert.equal(await p.locator('#impressum').isVisible(),false);assert.equal(await legalLink.evaluate(e=>e===document.activeElement),true);
await legalLink.click();await p.locator('#closeImpressum').click();assert.equal(await p.locator('#impressum').isVisible(),false);
await legalLink.click();await p.mouse.click(2,2);assert.equal(await p.locator('#impressum').isVisible(),false);
assert.equal(p.url(),beforeLegal.url);assert.equal(await p.evaluate(()=>performance.timeOrigin),beforeLegal.origin);assert.equal(await p.locator('#fromItem').inputValue(),beforeLegal.item);assert.equal(await p.locator('#fromQty').inputValue(),beforeLegal.qty);
console.log('PASS exact footer credit, two information paragraphs, modal content, placeholders, close button, Escape, backdrop, focus restoration and no navigation');
const touch=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
try{
 const mobile=await touch.newPage();await mobile.goto(base);await mobile.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Preisliste geladen'));
 assert.equal(await mobile.locator('#toggleAdmin').getAttribute('aria-expanded'),'false');await mobile.locator('#toggleAdmin').tap();assert.equal(await mobile.locator('#toggleAdmin').getAttribute('aria-expanded'),'true');assert.equal(await mobile.locator('#adminInner').evaluate(e=>e.inert),true);await mobile.locator('#toggleAdmin').tap();assert.equal(await mobile.locator('#adminPanel').evaluate(e=>e.inert),true);
 await mobile.locator('#toSearch').tap();await mobile.locator('#toSearch').fill('STONE');
 assert.equal(await mobile.locator('#toSearch').getAttribute('aria-expanded'),'true');
 await mobile.locator('#toOptions [data-item-id="STONE"]').tap();assert.equal(await mobile.locator('#toItem').inputValue(),'STONE');assert.equal(await mobile.locator('#toSearch').getAttribute('aria-expanded'),'false');
 assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await mobile.setViewportSize({width:320,height:640});
 await mobile.getByRole('link',{name:'Impressum',exact:true}).tap();
 assert.equal(await mobile.locator('#impressum').isVisible(),true);
 const legalBounds=await mobile.locator('#impressum').boundingBox();assert.ok(legalBounds.x>=0&&legalBounds.x+legalBounds.width<=320&&legalBounds.y>=0&&legalBounds.y+legalBounds.height<=640);
 assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await mobile.touchscreen.tap(2,2);assert.equal(await mobile.locator('#impressum').isVisible(),false);
 console.log('PASS touch selection in mobile combobox without horizontal overflow');
 console.log('PASS responsive legal modal and touch backdrop dismissal at 320px');
}finally{await touch.close()}
}finally{await b.close();await new Promise(resolve=>server.close(resolve))}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
