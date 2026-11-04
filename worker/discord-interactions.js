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
function discordEditorPreview(draft){return {content:'**Private Vorschau** · Nur für dich sichtbar.\nErst mit Veröffentlichen erscheint der Beitrag im News-Kanal.',embeds:[discordNewsEmbed(draft,draft.image?.url,{preview:true})],components:discordEditorButtons(draft),allowed_mentions:{parse:[]}};}
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
const discordUserAgent='DiscordBot (https://github.com/MicroMiner/VeloCity, 2.0)';
function discordProblem(stage,message,status=null,code=null,kind='api'){
 const error=Error('Discord request failed');Object.assign(error,{stage,userMessage:message,httpStatus:status,discordCode:code,kind});return error;
}
function discordHttpProblem(stage,status,code){
 const messages={application:'Bot-Anmeldung fehlgeschlagen. DISCORD_BOT_TOKEN in Cloudflare prüfen (nur den Token, ohne Bot-Präfix).',channel:'Der Bot kann den konfigurierten News-Kanal nicht lesen. Kanal-ID und Kanalzugriff prüfen.',member:'Die Servermitgliedschaft konnte nicht geprüft werden. Server-ID und Bot-Mitgliedschaft prüfen.',send:'Discord hat die Nachricht abgelehnt. Bot-Rechte im News-Kanal prüfen: Kanal ansehen, Nachrichten senden, Links einbetten und Dateien anhängen.',reply:'Discord hat die Statusantwort abgelehnt. Bitte Status aktualisieren verwenden.'};
 return discordProblem(stage,(messages[stage]||'Discord-Anfrage fehlgeschlagen.')+` (HTTP ${status}${code!==null?', Code '+code:''})`,status,code);
}
function discordLogProblem(error,id,event='discord_news_publish_failed'){
 console.error(JSON.stringify({event,draftId:id,stage:error.stage||'unknown',httpStatus:error.httpStatus??null,discordCode:error.discordCode??null,kind:error.kind||'internal'}));
}
async function discordApi(env,path,options={}){
 const {stage='unknown',timeout=5000,botAuth=true,...init}=options;
 if(timeout<=0)throw discordProblem(stage,'Discord hat nicht rechtzeitig geantwortet. Bitte später erneut prüfen.',null,null,'timeout');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);let sent=false;
 try{
  sent=true;
  const result=await fetch('https://discord.com/api/v10'+path,{...init,headers:{'User-Agent':discordUserAgent,...(botAuth?{Authorization:'Bot '+String(env.DISCORD_BOT_TOKEN).trim()}:{}),...init.headers},redirect:'error',signal:controller.signal});
  const data=await result.json().catch(()=>({}));
  if(!result.ok)throw discordHttpProblem(stage,result.status,Number.isSafeInteger(data.code)?data.code:null);
  return data;
 }catch(error){
  if(!error.userMessage)error=discordProblem(stage,controller.signal.aborted?'Discord hat nicht rechtzeitig geantwortet.':'Die Verbindung zu Discord ist fehlgeschlagen.',null,null,controller.signal.aborted?'timeout':'network');
  error.requestSent=sent;throw error;
 }finally{clearTimeout(timer);}
}
async function discordPatchReply(interaction,env,data){
 // Discord can briefly return Unknown Webhook/Message if the callback ACK has
 // not propagated. Retry only this idempotent PATCH, never the public message POST.
 const deadline=Date.now()+4500;
 for(let attempt=0;;attempt++){
  try{return await discordApi(env,`/webhooks/${env.DISCORD_APPLICATION_ID}/${encodeURIComponent(interaction.token)}/messages/@original`,{method:'PATCH',stage:'reply',botAuth:false,timeout:Math.min(1800,deadline-Date.now()),headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});}
  catch(error){
   const retry=error.httpStatus===404||error.httpStatus===429||error.httpStatus>=500||['network','timeout'].includes(error.kind);
   const delay=[150,350,700][attempt];if(!retry||delay===undefined||Date.now()+delay>=deadline)throw error;
   await new Promise(resolve=>setTimeout(resolve,delay));
  }
 }
}
function discordStatusButton(draft){return [{type:1,components:[{type:2,style:2,label:'Status aktualisieren',custom_id:`vn:status:${draft.id}:${draft.revision}`}]}];}
function discordStatusData(draft,env){
 const base={embeds:[],components:[],allowed_mentions:{parse:[]}};
 if(draft.status==='published')return {...base,content:`✅ **Bereits veröffentlicht**\n[Beitrag in Discord öffnen](https://discord.com/channels/${draft.guildId}/${draft.channelId||env.DISCORD_CHANNEL_ID}/${draft.messageId})\nDie Webseite übernimmt den Beitrag beim nächsten regulären Abgleich.`};
 if(draft.status==='uncertain')return {...base,content:'⚠️ **Veröffentlichungsstatus unklar**\n'+(draft.lastError?.message||'Bitte den News-Kanal prüfen.')+' Es wird kein zweiter Beitrag gesendet.'};
 if(draft.status==='publishing')return {...base,content:'**Veröffentlichung wird geprüft …**\nMit Status aktualisieren kannst du den gespeicherten Stand abrufen. Es wird kein zweiter Beitrag gesendet.',embeds:[discordNewsEmbed(draft,draft.image?.url,{preview:true})],components:discordStatusButton(draft)};
 if(draft.status==='preview'&&draft.expiresAt<Date.now())return {...base,content:'Dieser Entwurf ist abgelaufen.'};
 if(draft.status==='preview')return {...discordEditorPreview(draft),content:draft.lastError?'❌ **Nicht veröffentlicht**\n'+draft.lastError.message:discordEditorPreview(draft).content};
 return {...base,content:'Dieser Entwurf ist abgelaufen oder wurde abgebrochen.'};
}
function discordStatusReply(draft,interaction,env,update=false){return discordJson({type:update&&(interaction.message?.flags&64)?7:4,data:{...discordStatusData(draft,env),...(!(update&&(interaction.message?.flags&64))?{flags:64}:{})}});}
async function discordRefreshStatus(db,record){
 const draft=record.data,started=draft.startedAt||(draft.expiresAt-86400000);
 if(draft.status==='publishing'&&Date.now()-started>40000){
  const next={...draft,status:'uncertain',revision:draft.revision+1,lastError:{stage:'background',message:'Die Verarbeitung wurde unterbrochen. Bitte den News-Kanal prüfen; ein erneutes Senden erfolgt nicht automatisch.'}};
  if(await discordSaveDraft(db,record,next))return next;
  return (await discordReadDraft(db,draft.id))?.data||next;
 }
 return draft;
}
async function discordPublishDraft(record,interaction,env){
 const draft=record.data,db=env.NEWS_DB,deadline=Date.now()+20000;let sendStarted=false,sentMessageId=null;
 const api=(path,options={})=>discordApi(env,path,{...options,timeout:Math.min(5000,deadline-Date.now())});
 const published=id=>({id:draft.id,ownerId:draft.ownerId,guildId:draft.guildId,channelId:env.DISCORD_CHANNEL_ID,status:'published',revision:draft.revision+1,messageId:id,expiresAt:Date.now()+86400000});
 try{
  const application=await api('/oauth2/applications/@me',{stage:'application'});
  if(application.id!==env.DISCORD_APPLICATION_ID)throw discordProblem('application','Der Bot-Token gehört zu einer anderen Discord-Anwendung.');
  const channel=await api('/channels/'+env.DISCORD_CHANNEL_ID,{stage:'channel'});
  if(channel.guild_id!==env.DISCORD_GUILD_ID||![0,5].includes(channel.type))throw discordProblem('channel','Der eingestellte News-Kanal gehört nicht zum Server oder ist kein Textkanal.');
  let upload=null;
  if(draft.image){
   const controller=new AbortController(),remaining=Math.min(5000,deadline-Date.now());
   if(remaining<=0)throw discordProblem('image','Zeitlimit beim Prüfen des Titelbilds erreicht.');
   const timer=setTimeout(()=>controller.abort(),remaining);
   try{
    const result=await fetch(draft.image.url,{headers:{'User-Agent':discordUserAgent},redirect:'error',signal:controller.signal});
    if(!result.ok)throw discordProblem('image','Das Titelbild ist abgelaufen oder nicht erreichbar. Bitte über Bearbeiten erneut auswählen.',result.status);
    if(Number(result.headers.get('Content-Length'))>discordNewsImageLimit)throw discordProblem('image','Titelbild zu gross. Maximal 8 MB sind erlaubt.');
    const bytes=await discordLimitedBytes(result.body,discordNewsImageLimit),kind=discordImageType(bytes);
    if(!kind||kind.type!==draft.image.type)throw discordProblem('image','Der Bildinhalt stimmt nicht mit dem Dateityp überein.');
    upload={bytes,...kind,filename:'title-image.'+kind.extension};
   }catch(error){if(!error.userMessage)throw discordProblem('image','Das Titelbild konnte nicht vollständig geladen werden. Bitte erneut auswählen.');throw error;}finally{clearTimeout(timer);}
  }
  const member=await api(`/guilds/${draft.guildId}/members/${draft.ownerId}`,{stage:'member'});
  if(!discordEditorAllowed(draft.ownerId,member.roles||[],env))throw discordProblem('member','Dein Benutzerkonto oder deine Rolle ist nicht mehr zur Veröffentlichung freigeschaltet.');
  const payload={embeds:[discordNewsEmbed(draft,upload?'attachment://'+upload.filename:null,{publishedAt:new Date().toISOString()})],allowed_mentions:{parse:[],replied_user:false},nonce:draft.id,enforce_nonce:true};
  let options;
  if(upload){const form=new FormData();payload.attachments=[{id:0,filename:upload.filename}];form.set('payload_json',JSON.stringify(payload));form.set('files[0]',new Blob([upload.bytes],{type:upload.type}),upload.filename);options={method:'POST',body:form};}
  else options={method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)};
  sendStarted=true;
  const message=await api('/channels/'+env.DISCORD_CHANNEL_ID+'/messages',{...options,stage:'send'});
  if(!discordSnowflake(message.id)||message.channel_id!==env.DISCORD_CHANNEL_ID)throw discordProblem('send','Discord hat keine eindeutige Veröffentlichungsbestätigung geliefert.');
  sentMessageId=message.id;
  if(!await discordSaveDraft(db,record,published(message.id)))throw discordProblem('persist','Die Nachricht wurde gesendet, aber ihr Status konnte nicht gespeichert werden.');
  try{await discordPatchReply(interaction,env,discordStatusData(published(message.id),env));}catch(error){discordLogProblem(error,draft.id,'discord_news_reply_failed');}
 }catch(error){
  discordLogProblem(error,draft.id);
  if(sentMessageId){
   try{await discordSaveDraft(db,record,published(sentMessageId));}catch{}
   try{await discordPatchReply(interaction,env,discordStatusData(published(sentMessageId),env));}catch(replyError){discordLogProblem(replyError,draft.id,'discord_news_reply_failed');}
   return;
  }
  const rejected=error.stage==='send'&&error.httpStatus>=400&&error.httpStatus<500&&error.httpStatus!==408;
  const retryable=!sendStarted||rejected||(error.stage==='send'&&error.requestSent===false);
  const next={...draft,status:retryable?'preview':'uncertain',revision:draft.revision+1,expiresAt:Date.now()+(retryable?discordEditorTtl:86400000),lastError:{stage:error.stage||'unknown',httpStatus:error.httpStatus??null,discordCode:error.discordCode??null,message:error.userMessage||'Die Verarbeitung wurde unterbrochen. Bitte den News-Kanal prüfen.'}};
  try{
   if(!await discordSaveDraft(db,record,next))throw discordProblem('persist','Status konnte nicht gespeichert werden.');
   await discordPatchReply(interaction,env,discordStatusData(next,env));
  }catch(replyError){discordLogProblem(replyError,draft.id,'discord_news_reply_failed');}
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
  const match=/^vn:(modal|publish|edit|cancel|status):(\d{17,22}):(\d{1,6})$/.exec(interaction.data?.custom_id||'');
  if(!match||![3,5].includes(interaction.type)||(interaction.type===5)!==(match[1]==='modal'))return discordPrivate('Dieser Editor-Aufruf wird nicht unterstützt.');
  const [,action,id,revision]=match,record=await discordReadDraft(db,id),draft=record?.data;
  if(!draft||draft.ownerId!==owner||draft.guildId!==interaction.guild_id)return discordPrivate('Dieser Entwurf gehört nicht zu deiner Sitzung oder ist abgelaufen.');
  if(action==='status')return discordStatusReply(await discordRefreshStatus(db,record),interaction,env,true);
  if(['published','publishing','uncertain'].includes(draft.status))return discordStatusReply(await discordRefreshStatus(db,record),interaction,env);
  if(draft.status==='cancelled'||draft.expiresAt<Date.now())return discordPrivate('Dieser Entwurf ist abgelaufen oder wurde abgebrochen.');
  if(draft.revision!==Number(revision))return discordJson({type:4,data:{...discordStatusData(draft,env),content:'Diese Vorschau ist veraltet. Hier ist der aktuelle Stand.\n'+discordStatusData(draft,env).content,flags:64}});
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
   const next={...draft,...input,image,status:'preview',revision:draft.revision+1,expiresAt:Date.now()+discordEditorTtl};delete next.lastError;
   if(!await discordSaveDraft(db,record,next))return discordPrivate('Entwurf wurde bereits geändert. Bitte die neueste Vorschau verwenden.');
   return discordJson({type:4,data:{...discordEditorPreview(next),flags:64}});
  }
  if(action==='publish'){
   if(draft.status!=='preview')return discordPrivate('Bitte zuerst eine Vorschau erstellen.');
   if(!context?.waitUntil)return discordPrivate('Die Veröffentlichung ist in dieser Ausführungsumgebung nicht verfügbar.');
   const publishing={...draft,status:'publishing',startedAt:Date.now(),expiresAt:Date.now()+86400000};
   if(!await discordSaveDraft(db,record,publishing))return discordPrivate('Dieser Entwurf wird bereits verarbeitet.');
   // The initial response never waits for file downloads or Discord's REST API.
   context.waitUntil(discordPublishDraft({raw:JSON.stringify(publishing),data:publishing},interaction,env));
   return discordStatusReply(publishing,interaction,env,true);
  }
  return discordPrivate('Unbekannte Aktion.');
 }catch(error){
  const validation=/Titel:|Inhalt:|Kurzbeschreibung:|Bitte |Ungültige Bild|Doppeltes Eingabefeld/.test(error.message||'');
  return discordPrivate(validation?error.message:'Der News-Editor ist derzeit nicht verfügbar. Bitte Einrichtung und Datenbank prüfen.');
 }
}
