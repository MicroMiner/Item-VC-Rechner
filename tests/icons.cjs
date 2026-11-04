const {chromium}=require('playwright'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const ctx=await browser.newContext();
 await ctx.route('http://local/**',route=>{const rel=decodeURIComponent(new URL(route.request().url()).pathname.replace('/VeloCity/',''));if(rel==='config.js')return route.fulfill({contentType:'application/javascript',body:"window.VELOCITY_API_URL='';"});return route.fulfill({path:path.join(process.cwd(),rel)});});
 const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base='http://local/VeloCity/';
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  await page.goto(base+'index.html');
  assert.equal(await page.locator('.home-feature').count(),3);assert.equal(await page.locator('#homeNewsTitle').count(),1);
  assert.equal(await page.locator('.home-feature-icon svg').count(),3);
  assert.equal(await page.locator('.home-server-icon svg').getAttribute('viewBox'),'0 0 32 32');
  await page.screenshot({path:'/tmp/icons-home-'+width+'.png',fullPage:true});
  await page.goto(base+'umrechner.html');
  await page.waitForFunction(()=>document.querySelector('#fromSearch').value);
  for(const selector of ['#openCalculator','#toggleLayout']){
   const centred=await page.locator(selector).evaluate(n=>{const a=n.getBoundingClientRect(),b=n.querySelector('svg').getBoundingClientRect();return Math.abs(a.x+a.width/2-b.x-b.width/2)<.6&&Math.abs(a.y+a.height/2-b.y-b.height/2)<.6;});assert.ok(centred,selector);
  }
  await page.locator('#openCalculator').click();assert.equal(await page.locator('#calculatorWindow').isVisible(),true);
  await page.locator('#closeCalculator').click();
  const before=await page.locator('#toggleLayout').getAttribute('aria-pressed');await page.locator('#toggleLayout').click();assert.notEqual(await page.locator('#toggleLayout').getAttribute('aria-pressed'),before);
  await page.screenshot({path:'/tmp/icons-converter-'+width+'.png',fullPage:true});
  await page.goto(base+'galerie.html');await page.waitForFunction(()=>document.querySelector('.gallery-card'));
  await page.locator('.gallery-card').first().click();
  for(const selector of ['#galleryFullscreen','#galleryClose','#galleryPrevious','#galleryNext']){
   assert.ok(await page.locator(selector).evaluate(n=>{const a=n.getBoundingClientRect(),svg=n.querySelector('svg'),b=svg.getBoundingClientRect(),drawing=svg.getBBox();return Math.abs(a.x+a.width/2-b.x-b.width/2)<.6&&Math.abs(a.y+a.height/2-b.y-b.height/2)<.6&&Math.abs(drawing.x+drawing.width/2-12)<.01&&Math.abs(drawing.y+drawing.height/2-12)<.01;}),selector+' symbol centred');
  }
  await page.screenshot({path:'/tmp/icons-gallery-'+width+'.png'});
  await page.locator('#galleryClose').click();
 }
 assert.deepEqual(errors,[]);console.log('PASS: centred SVG boxes and artwork on gallery controls, complete homepage cards, thinner detailed icons, calculator and layout controls at desktop/mobile widths.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
