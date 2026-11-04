const {chromium}=require('playwright'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const worker=(await import('../worker/worker.js')).default,{TestD1}=await import('./helpers/d1.mjs');
 const db=new TestD1(),env={NEWS_DB:db,SITE_ORIGIN:'http://local',ADMIN_PASSWORD:'browser-test',GITHUB_TOKEN:'mock',GITHUB_OWNER:'mock',GITHUB_REPO:'mock'};
 const imported={id:'discord-333333333333333333',source:'discord',sourceId:'333333333333333333',title:'Aus Discord importiert',content:'Ein bestehender Beitrag.',category:'Update',publishedAt:'2026-01-01T10:00:00Z'};
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const context=await browser.newContext(),base='http://local/VeloCity/';let deletes=0,uploads=0,overlayDown=false;
  await context.route('http://worker/**',async route=>{
   const q=route.request(),u=new URL(q.url());if(u.pathname==='/news/admin/delete')deletes++;if(u.pathname==='/news/admin/image')uploads++;
   if(overlayDown&&u.pathname==='/news/overlay')return route.fulfill({status:503,json:{error:'Offline'},headers:{'Access-Control-Allow-Origin':'http://local'}});
   const response=await worker.fetch(new Request(q.url(),{method:q.method(),headers:{...q.headers(),origin:'http://local'},body:q.postDataBuffer()||undefined}),env);
   return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
  await context.route('http://local/**',route=>{
   const rel=decodeURIComponent(new URL(route.request().url()).pathname.replace('/VeloCity/',''));
   if(rel==='config.js')return route.fulfill({contentType:'application/javascript',body:"window.VELOCITY_API_URL='http://worker';"});
   if(rel==='assets/js/site-config.js')return route.fulfill({contentType:'application/javascript',body:"window.VELOCITY_CONFIG={newsSource:'static'};"});
   if(rel==='assets/data/updates.json')return route.fulfill({json:{version:1,updates:[imported]}});
   return route.fulfill({path:path.join(process.cwd(),rel)});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'neuigkeiten.html');await page.waitForFunction(()=>document.querySelector('.news-blog-card'));
  assert.equal(await page.locator('.news-card-delete').count(),0,'public visitor gets no controls');
  await page.locator('#openNewsAdmin').click();await page.locator('#newsPassword').fill(env.ADMIN_PASSWORD);await page.locator('#newsLoginForm button').click();
  await page.waitForFunction(()=>document.querySelector('.news-card-delete'));
  await page.locator('.news-card-edit').click();await page.locator('#postTitle').fill('Auf der Webseite bearbeitet');await page.locator('#publishNewsPost').click();
  await page.waitForFunction(()=>document.querySelector('.news-blog-card h2')?.textContent==='Auf der Webseite bearbeitet');
  await page.reload();await page.waitForFunction(()=>document.querySelector('.news-card-delete'));
  assert.equal(await page.locator('.news-blog-card h2').textContent(),'Auf der Webseite bearbeitet','static Discord import does not overwrite edit');
  page.once('dialog',d=>d.dismiss());await page.locator('.news-card-delete').click();assert.equal(deletes,0,'cancel must not send a delete');
  page.once('dialog',d=>d.accept());await page.locator('.news-card-delete').click();await page.waitForFunction(()=>!document.querySelector('.news-blog-card'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('.news-empty'));assert.equal(await page.locator('.news-blog-card').count(),0,'deleted import remains deleted after reload/resync');
  await page.locator('#openNewsAdmin').click();await page.waitForFunction(()=>!document.querySelector('#newsAdminContent').inert);
  await page.locator('#newNewsPost').click();await page.locator('#postTitle').fill('Beitrag mit Bild');await page.locator('#postContent').fill('Der Bildausschnitt bleibt gespeichert.');
  await page.locator('#postImageFile').setInputFiles(path.join(process.cwd(),'assets/images/velocity-news-sunset.webp'));
  await page.waitForFunction(()=>!document.querySelector('#postImageCrop').hidden);
  const before=await page.locator('#postImageCanvas').evaluate(n=>n.toDataURL());
  await page.locator('#postImageZoom').evaluate(n=>{n.value='1.5';n.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#postImageX').evaluate(n=>{n.value='80';n.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.notEqual(await page.locator('#postImageCanvas').evaluate(n=>n.toDataURL()),before,'crop controls change the output');
  for(const width of [1440,768,390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/news-image-editor-'+width+'.png',fullPage:true});}
  await page.locator('#publishNewsPost').click();await page.waitForFunction(()=>document.querySelector('.news-blog-card h2')?.textContent==='Beitrag mit Bild');assert.equal(uploads,1);
  const img=page.locator('.news-blog-card img');await img.evaluate(n=>n.decode());assert.equal(await img.evaluate(n=>n.naturalWidth),1600);assert.equal(await img.evaluate(n=>n.naturalHeight),900);
  await page.reload();await page.waitForFunction(()=>document.querySelector('.news-card-delete'));await page.locator('.news-read-more').click();await page.waitForFunction(()=>document.querySelector('#newsDetail .news-card-delete'));assert.equal(await page.locator('#newsDetail h1').textContent(),'Beitrag mit Bild');
  await page.goto(base+'index.html');await page.waitForFunction(()=>document.querySelector('.news-preview h3'));assert.equal(await page.locator('.news-preview h3').textContent(),'Beitrag mit Bild');
  overlayDown=true;await page.goto(base+'neuigkeiten.html');await page.waitForFunction(()=>document.querySelector('.news-empty'));assert.equal(await page.locator('.news-blog-card').count(),0,'backend failure must not resurrect deleted static posts');
  assert.deepEqual(errors,[]);
  console.log('PASS static Discord edit/delete overlay, confirmation cancellation, shared session restore, real local image crop/upload/decode/persistence, direct detail controls, homepage, responsive editor and fail-closed overlays.');
 }finally{await browser.close();db.db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
