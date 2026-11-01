const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),prefix='/preview/velocity/';
const previewDir=process.env.SITE_SCREENSHOT_DIR||path.join(require('node:os').tmpdir(),'velocity-site-previews');
if(process.env.SITE_SCREENSHOTS)fs.mkdirSync(previewDir,{recursive:true});
const types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://local').pathname;
 if(!pathname.startsWith(prefix)){res.writeHead(404);res.end();return;}
 const rel=decodeURIComponent(pathname.slice(prefix.length))||'index.html';
 if(rel==='config.js'){res.setHeader('Content-Type',types['.js']);res.end("window.VELOCITY_API_URL='';");return;}
 const target=path.resolve(root,rel);
 if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(target,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',types[path.extname(target)]||'application/octet-stream');res.end(data);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port+prefix;
 const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const page=await b.newPage({viewport:{width:1440,height:900}}),errors=[],requests=[],badAssets=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));page.on('response',r=>{if(r.url().includes('/assets/')&&r.status()!==200)badAssets.push(r.url());});
  await page.goto(base+'index.html');
  const icon=await page.locator('link[rel=icon]').getAttribute('href');
  assert.ok(icon.startsWith('assets/'));
  assert.deepEqual(await page.evaluate(async href=>{const response=await fetch(href);if(!response.ok)throw Error('Favicon unavailable');const blob=await response.blob(),image=await createImageBitmap(blob);return [image.width,image.height,blob.type,blob.size<10000]},icon),[48,48,'image/png',true]);
  assert.match(await page.title(),/VeloCity/);assert.equal(await page.locator('.site-nav a').count(),2);
  assert.equal(await page.locator('.site-nav [aria-current="page"]').textContent(),'Startseite');
  assert.equal(await page.locator('.economy-entry').count(),1);
  assert.equal(await page.locator('.site-logo img').evaluate(img=>img.complete&&img.naturalWidth===2171&&img.getAttribute('src').endsWith('.png')),true);assert.equal(await page.locator('#fromItem').count(),0);
  assert.equal(await page.locator('script[src]').count(),1);assert.ok((await page.locator('script[src]').getAttribute('src')).endsWith('/ui.js'));
  assert.equal(requests.some(url=>/\/(app|calculator|config)\.js/.test(url)||url.includes('/preislisten/')),false);
  const background=await page.evaluate(()=>getComputedStyle(document.body).backgroundImage);
  const foot=await page.locator('.foot').boundingBox();assert.ok(foot.y+foot.height>=876&&foot.y+foot.height<=900);
  await page.getByRole('link',{name:'Impressum',exact:true}).click();assert.equal(await page.locator('#impressum').isVisible(),true);await page.keyboard.press('Escape');
  await page.getByRole('link',{name:'Zum Umrechner',exact:true}).click();await page.waitForURL(base+'umrechner.html');await page.waitForFunction(()=>document.querySelector('#syncState').textContent==='Synchronisiert');
  assert.equal(await page.locator('.site-nav [aria-current="page"]').textContent(),'Umrechner');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundImage),background);
  assert.ok(requests.some(url=>url===base+'preislisten/VeloCoin_Preisliste.json'));
  await page.locator('.site-logo').click();await page.waitForURL(base+'index.html');
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('link',{name:'Umrechner',exact:true}).click();await page.waitForURL(base+'umrechner.html');
  await page.getByRole('navigation',{name:'Hauptnavigation'}).getByRole('link',{name:'Startseite',exact:true}).click();await page.waitForURL(base+'index.html');
  for(const route of ['index.html','umrechner.html']){
   await page.goto(base+route);
   if(route==='umrechner.html')await page.waitForFunction(()=>document.querySelector('#syncState').textContent==='Synchronisiert');
   await page.addStyleTag({content:'html { overflow-y: scroll; scrollbar-gutter: stable; }'});
   for(const [width,height] of [[1920,1080],[1672,941],[1440,900],[1024,768],[768,1024],[430,932],[390,844],[375,667],[320,640]]){
    await page.setViewportSize({width,height});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),route+' overflow with reserved scrollbar at '+width);
    await page.evaluate(()=>scrollTo(100,0));assert.equal(await page.evaluate(()=>scrollX),0,route+' scrolls horizontally at '+width);
    const nav=await page.locator('.site-nav').boundingBox();assert.ok(nav.x>=0&&nav.x+nav.width<=width);
    if(process.env.SITE_SCREENSHOTS&&[1672,1440,390].includes(width)){
     await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(previewDir,'velocity-'+route.replace('.html','')+'-'+width+'.png'),fullPage:true});
    }
   }
  }
  await page.setViewportSize({width:1440,height:900});await page.goto(base+'umrechner.html');await page.waitForFunction(()=>document.querySelector('#syncState').textContent==='Synchronisiert');
  await page.locator('#toggleAdmin').click();assert.equal(await page.locator('#adminInner').evaluate(e=>e.inert),true);
  assert.equal(await page.locator('.admin-lock-icon svg').count(),1);
  const loginBackground=await page.locator('.admin-login').evaluate(e=>getComputedStyle(e).backgroundColor);assert.equal(loginBackground,'rgba(20, 43, 73, 0.98)');
  await page.locator('#adminPanel').evaluate(e=>Promise.all(e.getAnimations().map(animation=>animation.finished)));
  assert.equal(await page.locator('#adminPassword').isVisible(),true);
  if(process.env.SITE_SCREENSHOTS){await page.locator('#adminLogin').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(previewDir,'velocity-admin-login.png')});}
  assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);
  console.log('PASS two-page navigation, lightweight homepage, shared design/footer, legal modal, GitHub Pages subpath and responsive layouts');
 }finally{await b.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
