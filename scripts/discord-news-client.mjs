// Adapter for the existing Discord bot. No bot client, Gateway connection or Discord posting.
import {createHash} from 'node:crypto';
const snowflake=x=>typeof x==='string'&&/^\d{17,22}$/.test(x);
export function createNewsBridge(config=process.env,transport=fetch){
 const base=(config.NEWS_API_URL||'').replace(/\/$/,'');
 if(!base.startsWith('https://')&&!(base.startsWith('http://localhost')||base.startsWith('http://127.0.0.1')))throw Error('Configure a HTTPS NEWS_API_URL.');
 const guildId=config.DISCORD_GUILD_ID,channelId=config.DISCORD_CHANNEL_ID,secret=config.DISCORD_INGEST_TOKEN;
 if(!snowflake(guildId)||!snowflake(channelId)||!secret)throw Error('Configure Discord guild/channel and the secret ingest token.');
 async function send(path,data){const response=await transport(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret},body:JSON.stringify({guildId,channelId,...data}),signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('News backend rejected request (HTTP '+response.status+').');return response.json();}
 return {
  heartbeat(ok=true){return send('/discord/heartbeat',{ok});},
  async message(message){
   const channel=message.channelId||message.channel_id,guild=message.guildId||message.guild_id;
   if(channel!==channelId||guild!==guildId||message.author?.bot||!snowflake(String(message.id)))return {ignored:true};
   const content=String(message.content||'').trim();if(!content)return {ignored:true};
   const lines=content.split(/\r?\n/),first=lines.shift().trim();
   const tag=/^\[(Ankündigung|Update|Info|Changelog|Wartung)\]\s*/i.exec(first);
   const names=['Ankündigung','Update','Info','Changelog','Wartung'];
   const title=(tag?first.slice(tag[0].length):first).replace(/^#+\s*/,'').slice(0,160)||'Servermeldung';
   const edited=message.editedTimestamp?new Date(message.editedTimestamp).toISOString():message.edited_timestamp;
   const published=message.createdTimestamp?new Date(message.createdTimestamp).toISOString():message.timestamp;
   const eventAt=edited||published;
   const attachments=message.attachments?.values?[...message.attachments.values()]:message.attachments||[];
   const image=attachments.find(x=>String(x.contentType||x.content_type||'').startsWith('image/'))?.url||null;
   const data={messageId:String(message.id),type:edited?'update':'create',eventAt,publishedAt:published,title,content:(lines.join('\n').trim()||title).slice(0,20000),category:tag?names.find(x=>x.toLowerCase()===tag[1].toLowerCase()):'Ankündigung',image};
   data.eventId=String(message.id)+':'+createHash('sha256').update(JSON.stringify(data)).digest('hex');
   return send('/discord/events',data);
  },
  deleted(message,at=new Date().toISOString()){
   if((message.channelId||message.channel_id)!==channelId||(message.guildId||message.guild_id)!==guildId||!snowflake(String(message.id)))return Promise.resolve({ignored:true});
   return send('/discord/events',{messageId:String(message.id),type:'delete',eventAt:at,eventId:String(message.id)+':delete:'+Date.parse(at)});
  },
  startHeartbeat(){let pending=false;const tick=async()=>{if(pending)return;pending=true;try{await this.heartbeat(true);}catch{console.error('News heartbeat failed.');}finally{pending=false;}};tick();const timer=setInterval(tick,60000);return()=>clearInterval(timer);}
 };
}
