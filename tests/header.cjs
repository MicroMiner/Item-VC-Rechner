const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const fixture=JSON.parse(fs.readFileSync(path.join(root,'preislisten/VeloCoin_Preisliste.json')));
delete fixture.updatedAt; // Explicit legacy fixture, even when the real list has a start timestamp.
let apiMode=false;
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://local').pathname;
 if(pathname==='/config.js'){res.setHeader('Content-Type','application/javascript');res.end('window.VELOCITY_API_URL='+JSON.stringify(apiMode?'http://api.local':'')+';');return;}
 const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
 if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(target,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',target.endsWith('.json')?'application/json':target.endsWith('.html')?'text/html':target.endsWith('.css')?'text/css':target.endsWith('.png')?'image/png':target.endsWith('.svg')?'image/svg+xml':'application/javascript');res.end(data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 const originalFetch=globalThis.fetch;
 try{
  const page=await browser.newPage();
  async function openAdmin(){if(await page.locator('#toggleAdmin').getAttribute('aria-expanded')!=='true')await page.locator('#toggleAdmin').click();}
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  let releaseLoad,reachedLoad;
  const gate=new Promise(resolve=>releaseLoad=resolve),reached=new Promise(resolve=>reachedLoad=resolve);
  await page.route('**/preislisten/VeloCoin_Preisliste.json',async r=>{reachedLoad();await gate;await r.fulfill({json:fixture});});
  await page.goto(base+'/umrechner.html');await reached;
  assert.equal(await page.locator('#syncState').textContent(),'Nicht verbunden');
  assert.equal(await page.locator('#priceUpdatedAt').textContent(),'Keine Zeitangabe');
  assert.equal(await page.locator('#loadedItems').textContent(),'0 Items');
  releaseLoad();await page.waitForFunction(()=>document.querySelector('#syncState').textContent==='Synchronisiert');
  const count=fixture.items.length+fixture.customItems.length;
  const countText=n=>new Intl.NumberFormat('de-CH').format(n).replace(/’/g,"'")+' Items';
  assert.equal(await page.locator('#loadedItems').textContent(),countText(count));
  assert.equal(await page.locator('#priceUpdatedAt').getAttribute('datetime'),null);
  assert.equal(await page.locator('#appVersion').textContent(),'v1.0.30');
  assert.equal(await page.locator('header small').count(),0);
  assert.equal(await page.locator('#earthValue').textContent(),'1 Erde = '+fixture.items.find(x=>x.id==='DIRT').sell+' VC (Sell)');
  console.log('PASS pending and successful static load, legacy JSON without invented time, dynamic item count and Earth Sell');

  // Route browser requests through the actual Worker with an in-memory GitHub
  // Contents API. No requests to a real repository or Cloudflare deployment.
  const {default:worker}=await import('../worker/worker.js');
  const data=structuredClone(fixture);data.updatedAt='2026-11-01T00:38:00.000Z';data.items.find(x=>x.id==='DIRT').sell=2.75;
  data.customItems.push({id:'CUSTOM_HEADER_TEST',name:'Header test',buy:4,sell:1});
  const files={'VeloCoin_Preisliste.json':data,'zz-other.json':{...structuredClone(fixture),items:[{id:'DIRT',name:'Erde',buy:28,sell:7}],customItems:[]}};
  const env={SITE_ORIGIN:base,ADMIN_PASSWORD:'test-only',GITHUB_TOKEN:'mock-only',GITHUB_OWNER:'MicroMiner',GITHUB_REPO:'Item-VC-Rechner',GITHUB_BRANCH:'main'};
  let failLoads=false,failWrites=false,holdWrite=null,writeCount=0,readCount=0;
  globalThis.fetch=async(url,options)=>{
   const u=new URL(url);assert.equal(u.hostname,'api.github.com');
   if(u.pathname.endsWith('/preislisten'))return Response.json(Object.keys(files).map(name=>({type:'file',name})));
   const filename=decodeURIComponent(u.pathname.split('/').at(-1));
   if(options.method==='PUT'){
    writeCount++;if(holdWrite)await holdWrite;
    if(failWrites)return Response.json({error:'conflict'},{status:409});
    files[filename]=JSON.parse(Buffer.from(JSON.parse(options.body).content,'base64'));
    return Response.json({content:{sha:'b'.repeat(40)}});
   }
   readCount++;if(failLoads)return Response.json({error:'unavailable'},{status:503});
   return Response.json({sha:'a'.repeat(40),content:Buffer.from(JSON.stringify(files[filename])).toString('base64')});
  };
  await page.unroute('**/preislisten/VeloCoin_Preisliste.json');
  await page.route('http://api.local/**',async r=>{
   const req=r.request();if(req.method()==='PUT')assert.equal(req.postDataJSON().data.updatedAt,undefined);const response=await worker.fetch(new Request(req.url(),{method:req.method(),headers:{Origin:base,'Content-Type':'application/json'},body:req.method()==='GET'?undefined:req.postData()}),env);
   await r.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  apiMode=true;await page.reload();await openAdmin();await page.waitForFunction(()=>document.querySelector('#syncState').textContent==='Synchronisiert');
  assert.equal(await page.locator('#priceUpdatedAt').getAttribute('datetime'),data.updatedAt);
  assert.match(await page.locator('#priceUpdatedAt').textContent(),/01\.11\.26.*01:38/);
  assert.equal(await page.locator('#earthValue').textContent(),'1 Erde = 2.75 VC (Sell)');
  assert.equal(await page.locator('#loadedItems').textContent(),countText(count+1));
  await page.locator('#adminPassword').fill('test-only');await page.locator('#adminLogin button').click();await page.waitForFunction(()=>!document.querySelector('#adminInner').inert);
  await page.locator('#editSearch').fill('DIRT');await page.locator('#editOptions [data-item-id="DIRT"]').click();
  let releaseWrite;holdWrite=new Promise(resolve=>releaseWrite=resolve);
  const beforeSave=Date.now();await page.locator('#editSell').fill('3.5');await page.locator('#saveEdit').click();
  await page.waitForFunction(()=>document.querySelector('#syncState').textContent==='Nicht verbunden');
  assert.equal(await page.locator('#priceUpdatedAt').getAttribute('datetime'),data.updatedAt);
  releaseWrite();holdWrite=null;
  await page.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Online gespeichert'));
  const savedAt=files['VeloCoin_Preisliste.json'].updatedAt;
  assert.ok(Date.parse(savedAt)>=beforeSave&&Date.parse(savedAt)<=Date.now());
  assert.equal(await page.locator('#priceUpdatedAt').getAttribute('datetime'),savedAt);
  assert.equal(await page.locator('#syncState').textContent(),'Synchronisiert');
  assert.equal(await page.locator('#earthValue').textContent(),'1 Erde = 3.5 VC (Sell)');
  const downloadPromise=page.waitForEvent('download');await page.locator('#exportData').click();const download=await downloadPromise;
  const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(exported.updatedAt,savedAt);assert.equal(exported.version,2);assert.equal(exported.items.find(x=>x.id==='DIRT').sell,3.5);
  await page.reload();await openAdmin();await page.waitForFunction(()=>document.querySelector('#syncState').textContent==='Synchronisiert');
  assert.equal(await page.locator('#priceUpdatedAt').getAttribute('datetime'),savedAt);

  // A rejected write must not advance the committed change timestamp.
  failWrites=true;const readsBefore=readCount;
  await page.locator('#editSearch').fill('DIRT');await page.locator('#editOptions [data-item-id="DIRT"]').click();
  await page.locator('#editSell').fill('4.5');await page.locator('#saveEdit').click();
  await page.waitForFunction(()=>document.querySelector('#fileStatus').textContent.includes('Preisliste geladen')&&document.querySelector('#syncState').textContent==='Synchronisiert'&&document.querySelector('#earthValue').textContent==='1 Erde = 3.5 VC (Sell)');
  assert.ok(readCount>readsBefore);assert.equal(files['VeloCoin_Preisliste.json'].updatedAt,savedAt);
  assert.equal(await page.locator('#priceUpdatedAt').getAttribute('datetime'),savedAt);
  assert.equal(await page.locator('#earthValue').textContent(),'1 Erde = 3.5 VC (Sell)');
  failWrites=false;failLoads=true;await page.locator('#reloadData').click();
  await page.waitForFunction(()=>document.querySelector('#listStatus').textContent.includes('HTTP 502'));
  assert.equal(await page.locator('#syncState').textContent(),'Nicht verbunden');
  assert.equal(await page.locator('#economyStatus').getAttribute('data-state'),'disconnected');
  failLoads=false;await page.locator('#reloadData').click();await page.waitForFunction(()=>document.querySelector('#syncState').textContent==='Synchronisiert');
  assert.equal(await page.locator('#priceUpdatedAt').getAttribute('datetime'),savedAt);
  await page.locator('#priceList').selectOption('zz-other.json');await page.locator('#reloadData').click();
  await page.waitForFunction(()=>document.querySelector('#loadedItems').textContent==='1 Item');
  assert.equal(await page.locator('#priceUpdatedAt').textContent(),'Keine Zeitangabe');assert.equal(await page.locator('#earthValue').textContent(),'1 Erde = 7 VC (Sell)');
  files['zz-other.json'].updatedAt='not-a-date';await page.locator('#reloadData').click();await page.waitForFunction(()=>document.querySelector('#syncState').textContent==='Synchronisiert');
  assert.equal(await page.locator('#priceUpdatedAt').getAttribute('datetime'),null);
  assert.equal(await page.locator('#priceUpdatedAt').textContent(),'Keine Zeitangabe');
  assert.equal(writeCount,2);
  console.log('PASS real Worker read/write timestamps, server-side stamping, reload persistence, failed save/load, recovery, list switching and invalid metadata');

  for(const [width,height] of [[1920,1080],[1280,720],[1100,800],[721,700],[390,844],[320,640]]){
   await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
   const layout=await page.evaluate(()=>{
    const status=document.querySelector('#economyStatus').getBoundingClientRect(),result=document.querySelector('.result').getBoundingClientRect(),heading=document.querySelector('.hero>.section-heading').getBoundingClientRect(),top=document.querySelector('header.top').getBoundingClientRect();
    const infos=[...document.querySelectorAll('.status-info')].map(x=>x.getBoundingClientRect());
    return {overflow:document.documentElement.scrollWidth>innerWidth,statusRight:status.right,resultRight:result.right,contentLeft:document.querySelector(".wrap").getBoundingClientRect().left,statusBottom:status.bottom,headingTop:heading.top,headerHeight:top.height,overlap:infos.some((a,i)=>infos.slice(i+1).some(b=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1))};
   });
   if(process.env.HEADER_SCREENSHOTS&&[1280,390].includes(width))await page.screenshot({path:'/tmp/velocity-header-'+width+'.png'});
   if(width>=1100){assert.ok(layout.contentLeft>=100);assert.ok(layout.statusRight<=width-100);}
   assert.equal(layout.overflow,false,JSON.stringify({width,layout}));assert.equal(layout.overlap,false);
   assert.ok(layout.statusBottom<=layout.headingTop+1,JSON.stringify({width,layout}));
   if(width>720){assert.ok(Math.abs(layout.statusRight-layout.resultRight)<1);assert.equal(layout.headerHeight,height<=700?65:88);
    const columns=await page.evaluate(()=>({left:document.querySelector('.converter-layout').getBoundingClientRect().height,right:document.querySelector('.right-stack').getBoundingClientRect().height}));
    assert.ok(Math.abs(columns.left-Math.max(490,Math.min(height-170,560)))<1);assert.ok(columns.right>columns.left);
   }
  }
  assert.deepEqual(errors,[]);console.log('PASS desktop edge alignment and unchanged header height; mobile wrapping without overlap or horizontal overflow');
 }finally{globalThis.fetch=originalFetch;await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
