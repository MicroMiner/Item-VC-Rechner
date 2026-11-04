// Local files only. Crop in the browser; upload the compressed JPEG through the authenticated API.
export function createNewsImageEditor({upload,onChange}) {
 const $=id=>document.getElementById(id),file=$('postImageFile'),panel=$('postImageCrop'),canvas=$('postImageCanvas'),ctx=canvas.getContext('2d'),existing=$('postImageExisting'),notice=$('postImageMessage');
 let bitmap=null,pending=false,generation=0,drag=null,preparing=null;
 const x=$('postImageX'),y=$('postImageY'),zoom=$('postImageZoom');
 function placement(){
  const scale=Math.min(1600/bitmap.width,900/bitmap.height)*Number(zoom.value);
  return {width:bitmap.width*scale,height:bitmap.height*scale};
 }
 function draw(){
  if(!bitmap)return;
  const {width,height}=placement();
  ctx.fillStyle='#081326';ctx.fillRect(0,0,1600,900);
  ctx.drawImage(bitmap,(1600-width)*Number(x.value)/100,(900-height)*Number(y.value)/100,width,height);
  $('postImageScale').textContent=Math.round(Number(zoom.value)*100)+' %';
 }
 function resize(mode){
  if(!bitmap)return;
  x.value=y.value='50';
  const fill=Math.max(1600/bitmap.width,900/bitmap.height)/Math.min(1600/bitmap.width,900/bitmap.height);
  zoom.max=String(Math.max(4,Math.ceil(fill*100)/100));
  zoom.value=mode==='fill'?String(Math.ceil(fill*100)/100):'1';
  pending=true;draw();onChange();
 }
 $('fitPostImage').addEventListener('click',()=>resize('fit'));
 $('fillPostImage').addEventListener('click',()=>resize('fill'));
 function release(){bitmap?.close?.();bitmap=null;pending=false;panel.hidden=true;file.value='';}
 function reset(url=''){generation++;release();$('postImage').value=url;existing.hidden=!url;if(url)existing.src=url;else existing.removeAttribute('src');notice.textContent='';}
 file.addEventListener('change',async()=>{
  const selected=file.files[0],version=++generation;if(!selected)return;
  if(!['image/jpeg','image/png','image/webp'].includes(selected.type)||selected.size>10*1024*1024){notice.textContent='Bitte JPEG, PNG oder WebP mit höchstens 10 MB wählen.';file.value='';return;}
  notice.textContent='Bild wird vorbereitet …';
  try {
   const task=createImageBitmap(selected);preparing=task;
   let next;try{next=await task;}finally{if(preparing===task)preparing=null;}
   if(version!==generation){next.close();return;}
   if(next.width*next.height>40000000||!next.width||!next.height){next.close();throw Error('Das Bild ist zu gross. Bitte höchstens 40 Megapixel verwenden.');}
   bitmap?.close?.();bitmap=next;pending=true;x.value=y.value='50';zoom.value='1';panel.hidden=false;existing.hidden=true;
   resize('fit');notice.textContent='Ganzes Bild eingepasst. Du kannst es verkleinern, vergrössern oder verschieben. Freie Flächen erhalten den dunkelblauen Hintergrund.';
  } catch(error){notice.textContent=error.message||'Bild konnte nicht geöffnet werden.';file.value='';}
 });
 for(const slider of [x,y,zoom])slider.addEventListener('input',()=>{pending=true;draw();onChange();});
 canvas.addEventListener('pointerdown',event=>{if(!bitmap)return;drag={x:event.clientX,y:event.clientY,px:Number(x.value),py:Number(y.value)};canvas.setPointerCapture(event.pointerId);});
 canvas.addEventListener('pointermove',event=>{
  if(!drag||!bitmap)return;
  const rect=canvas.getBoundingClientRect(),{width,height}=placement();
  const spaceX=(1600-width)*rect.width/1600,spaceY=(900-height)*rect.height/900;
  if(Math.abs(spaceX)>.5)x.value=String(Math.max(0,Math.min(100,drag.px+(event.clientX-drag.x)*100/spaceX)));
  if(Math.abs(spaceY)>.5)y.value=String(Math.max(0,Math.min(100,drag.py+(event.clientY-drag.y)*100/spaceY)));
  pending=true;draw();onChange();
 });
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>{drag=null;});
 $('removePostImage').addEventListener('click',()=>{reset();onChange();});
 async function save(){
  if(preparing)await preparing;
  if(!pending||!bitmap)return $('postImage').value;
  notice.textContent='Bildausschnitt wird gespeichert …';
  let blob;
  for(const quality of [.86,.76,.66,.55]){blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(blob&&blob.size<=768000)break;}
  if(!blob||blob.size>768000)throw Error('Der Bildausschnitt ist zu gross. Bitte ein weniger detailreiches Bild wählen.');
  const data=await upload(blob);$('postImage').value=data.image;pending=false;notice.textContent='Bildausschnitt gespeichert.';return data.image;
 }
 return {reset,save};
}
