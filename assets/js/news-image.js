// Local files only. Crop in the browser; upload the compressed JPEG through the authenticated API.
export function createNewsImageEditor({upload,onChange}) {
 const $=id=>document.getElementById(id),file=$('postImageFile'),panel=$('postImageCrop'),canvas=$('postImageCanvas'),ctx=canvas.getContext('2d'),existing=$('postImageExisting'),notice=$('postImageMessage');
 let bitmap=null,pending=false,generation=0,drag=null,preparing=null;
 const x=$('postImageX'),y=$('postImageY'),zoom=$('postImageZoom');
 function draw(){
  if(!bitmap)return;
  const scale=Math.max(1600/bitmap.width,900/bitmap.height)*Number(zoom.value);
  const w=1600/scale,h=900/scale,sx=(bitmap.width-w)*Number(x.value)/100,sy=(bitmap.height-h)*Number(y.value)/100;
  ctx.fillStyle='#081326';ctx.fillRect(0,0,1600,900);ctx.drawImage(bitmap,sx,sy,w,h,0,0,1600,900);
 }
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
   draw();onChange();notice.textContent='Bild ziehen oder die Regler verwenden. Gespeichert wird der sichtbare Ausschnitt (1600 × 900 Pixel).';
  } catch(error){notice.textContent=error.message||'Bild konnte nicht geöffnet werden.';file.value='';}
 });
 for(const slider of [x,y,zoom])slider.addEventListener('input',()=>{pending=true;draw();onChange();});
 canvas.addEventListener('pointerdown',event=>{if(!bitmap)return;drag={x:event.clientX,y:event.clientY,px:Number(x.value),py:Number(y.value)};canvas.setPointerCapture(event.pointerId);});
 canvas.addEventListener('pointermove',event=>{
  if(!drag||!bitmap)return;
  const rect=canvas.getBoundingClientRect(),scale=Math.max(1600/bitmap.width,900/bitmap.height)*Number(zoom.value);
  const excessX=(bitmap.width*scale-1600)*rect.width/1600,excessY=(bitmap.height*scale-900)*rect.height/900;
  x.value=String(Math.max(0,Math.min(100,drag.px-(event.clientX-drag.x)*100/(excessX||1))));
  y.value=String(Math.max(0,Math.min(100,drag.py-(event.clientY-drag.y)*100/(excessY||1))));
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
