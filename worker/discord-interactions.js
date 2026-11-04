import {categories,discordNewsEmbed,discordNewsImageLimit,discordImageUrl,discordImageType,validateDiscordNews} from '../shared/discord-news.mjs';
const discordEditorPrefix='discord-editor:';
const discordEditorTtl=15*60*1000;
const discordSnowflake=x=>typeof x==='string'&&/^\d{17,22}$/.test(x);
const discordJson=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const discordPrivate=content=>discordJson({type:4,data:{content,flags:64,allowed_mentions:{parse:[]}}});
const discordIds=value=>String(value||'').split(',').map(x=>x.trim()).filter(discordSnowflake);
function discordEditorAllowed(user,roles,env){roles=Array.isArray(roles)?roles:[];return discordIds(env.DISCORD_NEWS_ADMIN_USER_IDS).includes(user)||discordIds(env.DISCORD_NEWS_ADMIN_ROLE_IDS).some(id=>roles.includes(id));}
async function discordLimitedBytes(body,limit){
 const reader=body?.getReader();if(!reader)return new Uint8Array();
 const chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('size');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
async function discordVerify(request,raw,key){
 const signature=request.headers.get('X-Signature-Ed25519'),timestamp=request.headers.get('X-Signature-Timestamp');
 if(!/^[a-f0-9]{128}$/i.test(signature||'')||!/^\d{10}$/.test(timestamp||'')||!(/^[a-f0-9]{64}$/i).test(key||'')||Math.abs(Date.now()/1000-Number(timestamp))>300)return false;
 try {
  const fromHex=hex=>Uint8Array.from(hex.match(/../g),v=>parseInt(v,16));
  const publicKey=await crypto.subtle.importKey('raw',fromHex(key),'Ed25519',false,['verify']);
  const prefix=new TextEncoder().encode(timestamp),signed=new Uint8Array(prefix.length+raw.length);signed.set(prefix);signed.set(raw,prefix.length);
  return await crypto.subtle.verify('Ed25519',publicKey,fromHex(signature),signed);
 }catch{return false;}
}
async function discordReadDraft(db,id){const row=await db.prepare('SELECT value FROM news_state WHERE key=?').bind(discordEditorPrefix+id).first();return row?{raw:row.value,data:JSON.parse(row.value)}:null;}
async function discordSaveDraft(db,record,next){const result=await db.prepare('UPDATE news_state SET value=? WHERE key=? AND value=?').bind(JSON.stringify(next),discordEditorPrefix+next.id,record.raw).run();return Boolean(result.meta.changes);}
function discordEditorModal(draft){
 const label=(text,component,description)=>({type:18,label:text,...(description?{description}:{}),component});
 const text=(id,style,max,required,value='')=>({type:4,custom_id:id,style,max_length:max,required,...(value?{value}:{} )});
 return discordJson({type:9,data:{custom_id:`vn:modal:${draft.id}:${draft.revision}`,title:'VeloCity · News erstellen',components:[
  label('Titel',text('title',1,160,true,draft.title)),
  label('Kategorie',{type:3,custom_id:'category',min_values:1,max_values:1,required:true,options:categories.map(name=>({label:name,value:name,default:name===(draft.category||'Update')}))}),
  label('Kurzbeschreibung (optional)',text('excerpt',2,400,false,draft.excerpt)),
  label('Vollständiger Beitragsinhalt',text('content',2,4000,true,draft.content),'Bis 4000 Zeichen; Markdown ist möglich.'),
  label('Titelbild (optional)',{type:19,custom_id:'image',required:false,min_values:0,max_values:1,file_types:['.jpg','.jpeg','.png','.webp','.gif']},draft.image?'Leer lassen behält das bisherige Bild. Maximal 8 MB.':'JPEG, PNG, WebP oder GIF. Maximal 8 MB.'),
 ]}});
}
function discordEditorButtons(draft){return [{type:1,components:[['publish','Veröffentlichen',3],['edit','Bearbeiten',1],['cancel','Abbrechen',4]].map(([action,label,style])=>({type:2,custom_id:`vn:${action}:${draft.id}:${draft.revision}`,label,style}))}];}
function discordEditorPreview(draft){return {content:'Private Vorschau – noch nicht veröffentlicht.',embeds:[discordNewsEmbed(draft,draft.image?.url)],components:discordEditorButtons(draft),allowed_mentions:{parse:[]}};}
function discordModalFields(data){
 const fields=new Map();
 function visit(items){for(const c of items||[]){if(c.component)visit([c.component]);else if(c.components)visit(c.components);else if(c.custom_id){if(fields.has(c.custom_id))throw Error('Doppeltes Eingabefeld.');fields.set(c.custom_id,c);}}}
 visit(data.components);return fields;
}
function discordModalImage(component,resolved,previous){
 if(!component)return previous||null;
 if(component.type!==19||!Array.isArray(component.values))throw Error('Ungültige Bildauswahl.');
 if(!component.values.length)return previous||null;
 if(component.values.length!==1)throw Error('Bitte genau ein Bild wählen.');
 const id=component.values[0],file=resolved?.attachments?.[id],url=discordImageUrl(file?.url);
 if(!discordSnowflake(id)||!file||String(file.id)!==id||!url||!['image/jpeg','image/png','image/webp','image/gif'].includes(file.content_type)||!Number.isSafeInteger(file.size)||file.size<=0||file.size>discordNewsImageLimit)throw Error('Bitte ein gültiges JPEG-, PNG-, WebP- oder GIF-Bild bis 8 MB wählen.');
 return {url,type:file.content_type,size:file.size};
}
async function discordApi(env,path,options={}){
 return fetch('https://discord.com/api/v10'+path,{...options,headers:{Authorization:'Bot '+env.DISCORD_BOT_TOKEN,...options.headers},redirect:'error',signal:options.signal||AbortSignal.timeout(6000)});
}
async function discordPatchReply(interaction,env,data){
 const result=await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${encodeURIComponent(interaction.token)}/messages/@original`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),redirect:'error',signal:AbortSignal.timeout(5000)});
 if(!result.ok)throw Error('reply');
}
async function discordPublishDraft(record,interaction,env){
 const draft=record.data,db=env.NEWS_DB,budget=AbortSignal.timeout(22000);let sendStarted=false,definiteRejection=false;
 const api=(path,options={})=>discordApi(env,path,{...options,signal:AbortSignal.any([budget,AbortSignal.timeout(6000)])});
 try {
  // Recheck current membership/role, application identity and destination immediately
  // before posting. Signed interaction permissions alone are not a lasting grant.
  const appResponse=await api('/oauth2/applications/@me');
  if(!appResponse.ok||(await appResponse.json()).id!==env.DISCORD_APPLICATION_ID)throw Error('Bot-Token und Discord-Anwendung passen nicht zusammen.');
  const channelResponse=await api('/channels/'+env.DISCORD_CHANNEL_ID);
  if(!channelResponse.ok)throw Error('News-Kanal ist nicht erreichbar.');
  const channel=await channelResponse.json();
  if(channel.guild_id!==env.DISCORD_GUILD_ID||![0,5].includes(channel.type))throw Error('Der News-Kanal gehört nicht zum konfigurierten Server oder ist kein Textkanal.');
  let upload=null;
  if(draft.image){
   const imageResponse=await fetch(draft.image.url,{redirect:'error',signal:AbortSignal.any([budget,AbortSignal.timeout(6000)])});
   if(!imageResponse.ok)throw Error('Titelbild abgelaufen oder nicht erreichbar. Bitte über Bearbeiten erneut auswählen.');
   if(Number(imageResponse.headers.get('Content-Length'))>discordNewsImageLimit)throw Error('Titelbild zu gross.');
   const bytes=await discordLimitedBytes(imageResponse.body,discordNewsImageLimit),kind=discordImageType(bytes);
   if(!kind||kind.type!==draft.image.type)throw Error('Bildinhalt stimmt nicht mit dem Dateityp überein.');
   upload={bytes,...kind,filename:'title-image.'+kind.extension};
  }
  const memberResponse=await api(`/guilds/${draft.guildId}/members/${draft.ownerId}`);
  if(!memberResponse.ok)throw Error('Mitgliedschaft konnte nicht bestätigt werden.');
  const member=await memberResponse.json();
  if(!discordEditorAllowed(draft.ownerId,member.roles||[],env))throw Error('Keine Veröffentlichungsberechtigung mehr.');
  const payload={content:`[${draft.category}] ${draft.title}`,embeds:[discordNewsEmbed(draft,upload?'attachment://'+upload.filename:null)],allowed_mentions:{parse:[],replied_user:false},nonce:draft.id,enforce_nonce:true};
  let options;
  if(upload){
   const form=new FormData();payload.attachments=[{id:0,filename:upload.filename}];form.set('payload_json',JSON.stringify(payload));form.set('files[0]',new Blob([upload.bytes],{type:upload.type}),upload.filename);options={method:'POST',body:form};
  }else options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)};
  sendStarted=true;
  const posted=await api('/channels/'+env.DISCORD_CHANNEL_ID+'/messages',options);
  definiteRejection=posted.status>=400&&posted.status<500&&posted.status!==408;
  if(!posted.ok)throw Error('Discord hat die Veröffentlichung nicht bestätigt (HTTP '+posted.status+').');
  const message=await posted.json();if(!discordSnowflake(message.id)||message.channel_id!==env.DISCORD_CHANNEL_ID)throw Error('Ungültige Veröffentlichungsbestätigung.');
  const published={id:draft.id,ownerId:draft.ownerId,guildId:draft.guildId,status:'published',revision:draft.revision+1,messageId:message.id,expiresAt:Date.now()+86400000};
  if(!await discordSaveDraft(db,record,published))throw Error('Status konnte nicht gespeichert werden.');
  const link=`https://discord.com/channels/${draft.guildId}/${env.DISCORD_CHANNEL_ID}/${message.id}`;
  try{await discordPatchReply(interaction,env,{content:'In Discord veröffentlicht: '+link+'\nDie Webseite übernimmt den Beitrag beim nächsten regulären Abgleich.',embeds:[],components:[],allowed_mentions:{parse:[]}});}catch{console.error('Discord News: private success reply failed.');}
 }catch(error){
  const retryable=!sendStarted||definiteRejection;
  const next={...draft,status:retryable?'preview':'uncertain',revision:draft.revision+1,expiresAt:Date.now()+(retryable?discordEditorTtl:86400000)};
  try{
   await discordSaveDraft(db,record,next);
   const content=retryable?'Nicht veröffentlicht. '+(sendStarted?'Discord-Berechtigungen oder Limits prüfen.':'Berechtigungen, Einrichtung oder Titelbild prüfen.')+' Du kannst bearbeiten oder erneut bestätigen.':'Status unklar. Bitte den Discord-News-Kanal prüfen. Zur Vermeidung doppelter Beiträge wird dieser Entwurf nicht nochmals gesendet.';
   await discordPatchReply(interaction,env,{content,embeds:retryable?discordEditorPreview(next).embeds:[],components:retryable?discordEditorButtons(next):[],allowed_mentions:{parse:[]}});
  }catch{console.error('Discord News: could not update private publication status.');}
 }
}
export async function discordInteractions(request,env,context){
 if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers:{Allow:'POST'}});
 let raw;try{raw=await discordLimitedBytes(request.body,65536);}catch{return discordJson({error:'Request too large'},413);}
 if(!await discordVerify(request,raw,env.DISCORD_PUBLIC_KEY))return discordJson({error:'Invalid request signature'},401);
 let interaction;try{interaction=JSON.parse(new TextDecoder().decode(raw));}catch{return discordJson({error:'Invalid JSON'},400);}
 if(interaction.type===1)return discordJson({type:1});
 const owner=interaction.member?.user?.id;
 if(interaction.application_id!==env.DISCORD_APPLICATION_ID||interaction.guild_id!==env.DISCORD_GUILD_ID||!discordSnowflake(owner)||!discordEditorAllowed(owner,interaction.member?.roles||[],env))return discordPrivate('Du bist für den VeloCity-News-Editor nicht freigeschaltet.');
 if(!env.NEWS_DB||!env.DISCORD_BOT_TOKEN||!discordSnowflake(env.DISCORD_CHANNEL_ID))return discordPrivate('Der News-Editor ist noch nicht vollständig eingerichtet.');
 try {
  const db=env.NEWS_DB;
  if(interaction.type===2&&interaction.data?.name==='news'&&interaction.data.options?.length===1&&interaction.data.options[0].name==='erstellen'&&interaction.data.options[0].type===1){
   if(!discordSnowflake(interaction.id))return discordPrivate('Ungültige Interaktion.');
   const draft={id:interaction.id,ownerId:owner,guildId:interaction.guild_id,status:'editing',revision:0,expiresAt:Date.now()+discordEditorTtl};
   await db.prepare('INSERT OR IGNORE INTO news_state(key,value) VALUES(?,?)').bind(discordEditorPrefix+draft.id,JSON.stringify(draft)).run();
   const record=await discordReadDraft(db,draft.id);
   if(record.data.ownerId!==owner||record.data.status!=='editing')return discordPrivate('Dieser Aufruf wurde bereits verarbeitet. Bitte /news erstellen erneut verwenden.');
   if(context?.waitUntil)context.waitUntil(db.prepare("DELETE FROM news_state WHERE key >= 'discord-editor:' AND key < 'discord-editor;' AND CAST(json_extract(value,'$.expiresAt') AS INTEGER) < ?").bind(Date.now()).run().catch(()=>{}));
   return discordEditorModal(record.data);
  }
  const match=/^vn:(modal|publish|edit|cancel):(\d{17,22}):(\d{1,6})$/.exec(interaction.data?.custom_id||'');
  if(!match||![3,5].includes(interaction.type)||(interaction.type===5)!==(match[1]==='modal'))return discordPrivate('Dieser Editor-Aufruf wird nicht unterstützt.');
  const [,action,id,revision]=match,record=await discordReadDraft(db,id),draft=record?.data;
  if(!draft||draft.ownerId!==owner||draft.guildId!==interaction.guild_id)return discordPrivate('Dieser Entwurf gehört nicht zu deiner Sitzung oder ist abgelaufen.');
  if(draft.status==='published')return discordPrivate('Bereits veröffentlicht: https://discord.com/channels/'+draft.guildId+'/'+env.DISCORD_CHANNEL_ID+'/'+draft.messageId);
  if(['publishing','uncertain'].includes(draft.status))return discordPrivate('Veröffentlichung läuft oder ihr Status ist unklar. Bitte den News-Kanal prüfen; es wird kein zweiter Beitrag gesendet.');
  if(draft.status==='cancelled'||draft.expiresAt<Date.now())return discordPrivate('Dieser Entwurf ist abgelaufen oder wurde abgebrochen.');
  if(draft.revision!==Number(revision))return discordPrivate('Diese Vorschau ist veraltet. Bitte die neueste Vorschau verwenden.');
  if(action==='edit')return discordEditorModal(draft);
  if(action==='cancel'){
   if(!await discordSaveDraft(db,record,{...draft,status:'cancelled',revision:draft.revision+1}))return discordPrivate('Entwurf wurde bereits geändert.');
   return discordJson({type:7,data:{content:'Entwurf abgebrochen. Es wurde nichts veröffentlicht.',embeds:[],components:[],allowed_mentions:{parse:[]}}});
  }
  if(action==='modal'){
   const fields=discordModalFields(interaction.data),category=fields.get('category');
   if(category?.type!==3||category.values?.length!==1)throw Error('Bitte eine Kategorie auswählen.');
   const input=validateDiscordNews({title:fields.get('title')?.value,category:category.values[0],excerpt:fields.get('excerpt')?.value||'',content:fields.get('content')?.value});
   const image=discordModalImage(fields.get('image'),interaction.data.resolved,draft.image);
   const next={...draft,...input,image,status:'preview',revision:draft.revision+1,expiresAt:Date.now()+discordEditorTtl};
   if(!await discordSaveDraft(db,record,next))return discordPrivate('Entwurf wurde bereits geändert. Bitte die neueste Vorschau verwenden.');
   return discordJson({type:4,data:{...discordEditorPreview(next),flags:64}});
  }
  if(action==='publish'){
   if(draft.status!=='preview')return discordPrivate('Bitte zuerst eine Vorschau erstellen.');
   if(!context?.waitUntil)return discordPrivate('Die Veröffentlichung ist in dieser Ausführungsumgebung nicht verfügbar.');
   const publishing={...draft,status:'publishing',expiresAt:Date.now()+86400000};
   if(!await discordSaveDraft(db,record,publishing))return discordPrivate('Dieser Entwurf wird bereits verarbeitet.');
   // The initial response never waits for file downloads or Discord's REST API.
   context.waitUntil(discordPublishDraft({raw:JSON.stringify(publishing),data:publishing},interaction,env));
   return discordJson({type:5,data:{flags:64}});
  }
  return discordPrivate('Unbekannte Aktion.');
 }catch(error){
  const validation=/Titel:|Inhalt:|Kurzbeschreibung:|Bitte |Ungültige Bild|Doppeltes Eingabefeld/.test(error.message||'');
  return discordPrivate(validation?error.message:'Der News-Editor ist derzeit nicht verfügbar. Bitte Einrichtung und Datenbank prüfen.');
 }
}
