const {chromium}=require('playwright'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const context=await browser.newContext(),base='http://local/VeloCity/';
 await context.route('http://local/**',r=>r.fulfill({path:path.join(process.cwd(),decodeURIComponent(new URL(r.request().url()).pathname.replace('/VeloCity/','')))}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'galerie.html');await page.waitForFunction(()=>document.querySelectorAll('.gallery-card').length===6);
 assert.equal(await page.locator('#galleryTotal').textContent(),'6 Bilder');
 for(const [width,height] of [[1808,1000],[1440,900],[768,1024],[390,844],[844,390],[320,640]]){
  await page.setViewportSize({width,height});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const thumb=await page.locator('.gallery-media img').first().boundingBox();assert.ok(Math.abs(thumb.width/thumb.height-16/9)<0.03);
  await page.screenshot({path:'/tmp/gallery-grid-'+width+'.png',fullPage:true});
  await page.locator('.gallery-card').first().click();
  await page.waitForFunction(()=>document.querySelector('#galleryFullImage').complete&&document.querySelector('#galleryFullImage').naturalWidth>0);
  const box=await page.locator('#galleryDialog').boundingBox(),img=await page.locator('#galleryFullImage').boundingBox();
  assert.equal(box.x,0);assert.equal(box.y,0);assert.equal(box.width,width);assert.equal(box.height,height);
  assert.equal(img.width,width);assert.equal(img.height,height);
  assert.ok(await page.locator('#galleryClose').isVisible());
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('gallery-viewer-open')),true);
  await page.screenshot({path:'/tmp/gallery-viewer-'+width+'.png'});
  await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#galleryPosition').textContent(),'2 / 6');
  await page.keyboard.press('ArrowLeft');assert.equal(await page.locator('#galleryPosition').textContent(),'1 / 6');
  await page.locator('#galleryPrevious').click();assert.equal(await page.locator('#galleryPosition').textContent(),'6 / 6');
  await page.locator('#galleryNext').click();assert.equal(await page.locator('#galleryPosition').textContent(),'1 / 6');
  await page.locator('#galleryClose').click();
  assert.equal(await page.locator('#galleryDialog').evaluate(n=>n.open),false);
  await page.waitForFunction(()=>!document.documentElement.classList.contains('gallery-viewer-open'));
  assert.equal(await page.locator('.gallery-card').first().evaluate(n=>n===document.activeElement),true);
 }
 await page.locator('.gallery-card').first().click();await page.keyboard.press('Escape');
 assert.equal(await page.locator('#galleryDialog').evaluate(n=>n.open),false);
 await page.locator('.gallery-card').first().click();
 await page.locator('#galleryDialog').evaluate(n=>{
  const start=new Event('touchstart');Object.defineProperty(start,'touches',{value:[{clientX:260,clientY:300}]});n.dispatchEvent(start);
  const end=new Event('touchend');Object.defineProperties(end,{touches:{value:[]},changedTouches:{value:[{clientX:80,clientY:302}]}});n.dispatchEvent(end);
 });
 assert.equal(await page.locator('#galleryPosition').textContent(),'2 / 6');
 assert.equal(await page.locator('#galleryFullscreen').count(),0);
 assert.equal(await page.locator('.gallery-expand').count(),0);
 await page.locator('#galleryClose').click();
 await page.locator('.gallery-card').first().click();
 await page.locator('#galleryFullImage').evaluate(n=>n.dispatchEvent(new Event('error')));
 assert.match(await page.locator('#galleryImageStatus').textContent(),/nicht geladen/);
 assert.deepEqual(errors,[]);
 console.log('PASS: 6 real gallery photos, six viewport sizes, window-filling image area, arrows/wrapping, touch swipe, removed expand/fullscreen buttons, Escape, close, focus restoration, scroll unlock and image error.');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
