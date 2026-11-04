const {chromium}=require('playwright'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const context=await browser.newContext(),base='https://local.test/VeloCity/';
  let override={blueMapUrl:'http://134.255.208.82:13003/#world:0:0:0:1500:0:0:0:0:perspective',blueMapEmbedUrl:null},mapRequests=0;
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname==='maps.example'){mapRequests++;return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Mock BlueMap</title><p>Interaktive Testkarte</p>'});}
   if(url.hostname!=='local.test')throw Error('Unexpected external request: '+url.href);
   const rel=decodeURIComponent(url.pathname.replace('/VeloCity/',''));
   if(rel==='assets/js/site-config.js'&&override)return route.fulfill({contentType:'application/javascript',body:'window.VELOCITY_CONFIG='+JSON.stringify(override)});
   return route.fulfill({path:path.join(process.cwd(),rel)});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'serverkarte.html');
  assert.match(await page.locator('#mapMessage').textContent(),/HTTPS/);
  assert.equal(await page.locator('#mapExternal').getAttribute('href'),'http://134.255.208.82:13003/#world:0:0:0:1500:0:0:0:0:perspective');
  assert.equal(await page.locator('#mapExternal').getAttribute('target'),'_blank');
  assert.equal(await page.locator('#blueMapFrame').getAttribute('src'),null);
  assert.equal(await page.locator('#mapLive').isVisible(),false);
  for(const [width,height] of [[1808,1000],[1440,1000],[1024,900],[768,1024],[390,844],[320,640]]){
   await page.setViewportSize({width,height});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow at '+width);
   assert.equal(await page.locator('.site-nav a[aria-current="page"]').textContent(),'Serverkarte');
   await page.screenshot({path:'/tmp/serverkarte-'+width+'.png',fullPage:true});
  }
  override={blueMapUrl:null,blueMapEmbedUrl:null};await page.reload();
  assert.equal(await page.locator('#mapExternal').getAttribute('href'),null);
  assert.equal(await page.locator('#mapExternal').getAttribute('aria-disabled'),'true');
  override={blueMapUrl:'javascript:alert(1)',blueMapEmbedUrl:'http://maps.example/'};
  await page.reload();assert.equal(await page.locator('#blueMapFrame').getAttribute('src'),null);assert.equal(await page.locator('#mapExternal').getAttribute('href'),null);
  override={blueMapUrl:'https://maps.example/open#world',blueMapEmbedUrl:'https://maps.example/embed#world'};
  await page.reload();await page.waitForFunction(()=>document.querySelector('#blueMapFrame').src.includes('maps.example'));
  assert.equal(await page.locator('#blueMapFrame').isVisible(),true);assert.equal(await page.locator('#mapPlaceholder').isVisible(),false);
  assert.equal(await page.locator('#mapExternal').getAttribute('href'),'https://maps.example/open#world');
  assert.equal(await page.locator('#mapLive').isVisible(),true);assert.ok(mapRequests>0);
  for(const [width,height] of [[1808,1000],[1440,1000],[1024,900],[768,1024],[390,844],[320,640]]){
   await page.setViewportSize({width,height});
   const box=await page.locator('#mapViewport').boundingBox(),label=await page.locator('.map-label').boundingBox();
   assert.ok(Math.abs(label.x-box.x-13)<2,'Label left at '+width);
   assert.ok(Math.abs(box.y+box.height-label.y-label.height-13)<2,'Label bottom at '+width);
   assert.equal(await page.locator('#mapFullscreen').count(),0);
   assert.equal(await page.locator('.map-toolbar').evaluate(n=>getComputedStyle(n).pointerEvents),'none');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.evaluate(()=>document.getElementById('blueMapFrame').dispatchEvent(new Event('error')));
  assert.equal(await page.locator('#mapPlaceholder').isVisible(),true);assert.equal(await page.locator('#mapLive').isVisible(),false);
  const fs=require('node:fs');
  for(const name of ['index.html','umrechner.html','neuigkeiten.html','galerie.html','serverkarte.html']){
   const html=fs.readFileSync(name,'utf8'),nav=html.match(/<nav class="site-nav"[\s\S]*?<\/nav>/)[0];
   const links=[...nav.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
   assert.deepEqual(links,['index.html','umrechner.html','neuigkeiten.html','galerie.html','serverkarte.html']);
  }
  assert.deepEqual(errors,[]);console.log('PASS: HTTP fallback, external link, missing/unsafe URLs, HTTPS iframe, error fallback, 6 responsive sizes, bottom-left label, no fullscreen button, navigation on all pages.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
