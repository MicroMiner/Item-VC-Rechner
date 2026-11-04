const {chromium}=require('playwright'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const context=await browser.newContext(),base='http://local/VeloCity/';
 await context.route('http://local/**',route=>{const rel=decodeURIComponent(new URL(route.request().url()).pathname.replace('/VeloCity/',''));if(rel==='config.js')return route.fulfill({contentType:'application/javascript',body:"window.VELOCITY_API_URL='';"});if(rel==='assets/js/site-config.js')return route.fulfill({contentType:'application/javascript',body:"window.VELOCITY_CONFIG={newsSource:'static',blueMapUrl:'https://maps.example/',blueMapEmbedUrl:'https://maps.example/'};"});return route.fulfill({path:path.join(process.cwd(),rel)});});
 await context.route('https://maps.example/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><style>body{background:#12334a;color:white}</style><p>Simulierte Serverkarte</p>'}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const pages=['index.html','umrechner.html','neuigkeiten.html','galerie.html','serverkarte.html'];
 for(const width of [1920,1440,1100,1024,768,390,320]){
  await page.setViewportSize({width,height:900});
  for(const name of pages){
   await page.goto(base+name);
   assert.equal(await page.evaluate(()=>Number(getComputedStyle(document.documentElement).zoom)),width>=1100?.9:1);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow '+name+' '+width);
   assert.equal(await page.locator('.site-nav a').count(),5);
   if(width===1440)await page.screenshot({path:'/tmp/density-'+name+'.png'});
  }
 }
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});await page.goto(base+'umrechner.html');
  await page.waitForFunction(()=>document.querySelector('#fromSearch').value);
  const before=await page.locator('#fromSearch').inputValue(),target=await page.locator('#toSearch').inputValue();
  await page.locator('#swap').click();assert.equal(await page.locator('#fromSearch').inputValue(),target);assert.equal(await page.locator('#toSearch').inputValue(),before);
  await page.locator('#openCalculator').click();
  const bounds=await page.locator('#calculatorWindow').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+.5&&bounds.y+bounds.height<=900.5);
  const handle=page.locator('#calculatorTitle'),point=await handle.boundingBox();
  await page.mouse.move(point.x+30,point.y+15);await page.mouse.down();await page.mouse.move(point.x+130,point.y+75,{steps:6});await page.mouse.up();
  const moved=await page.locator('#calculatorWindow').boundingBox();assert.ok(Math.abs(moved.x-Math.max(8,Math.min(bounds.x+100,width-bounds.width-8)))<2,'drag x tracks pointer at '+width);assert.ok(Math.abs(moved.y-Math.max(8,Math.min(bounds.y+60,900-bounds.height-8)))<2,'drag y tracks pointer at '+width);
  await handle.focus();await page.keyboard.press('ArrowLeft');const keyed=await page.locator('#calculatorWindow').boundingBox();assert.ok(Math.abs(keyed.x-moved.x+10)<1,'keyboard movement');
  await page.locator('#closeCalculator').click();
  await page.goto(base+'galerie.html');await page.waitForFunction(()=>document.querySelector('.gallery-card'));await page.locator('.gallery-card').first().click();
  const full=await page.locator('#galleryDialog').boundingBox();assert.ok(Math.abs(full.width-width)<1&&Math.abs(full.height-900)<1,'image viewer fills viewport');await page.locator('#galleryClose').click();
  await page.goto(base+'serverkarte.html');assert.equal(await page.locator('#blueMapFrame').isVisible(),true);
 }
 assert.deepEqual(errors,[]);console.log('PASS: 90% desktop density on all five pages, unchanged small-screen scale, no overflow, navigation, item swap, calculator pointer/keyboard positioning, full-window gallery and BlueMap embedding.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
