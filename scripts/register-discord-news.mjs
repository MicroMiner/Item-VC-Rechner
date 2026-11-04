import {pathToFileURL} from 'node:url';
export const discordNewsCommand={name:'news',description:'VeloCity-News verwalten',type:1,default_member_permissions:'0',options:[{name:'erstellen',description:'News mit Vorschau erstellen und nach Bestätigung im News-Kanal veröffentlichen',type:1}]};
export async function registerDiscordNews(config=process.env,transport=fetch,apply=false){
 if(!apply)return {dryRun:true,command:discordNewsCommand,required:['DISCORD_APPLICATION_ID','DISCORD_GUILD_ID','DISCORD_BOT_TOKEN']};
 if(!/^\d{17,22}$/.test(config.DISCORD_APPLICATION_ID||'')||!/^\d{17,22}$/.test(config.DISCORD_GUILD_ID||'')||!config.DISCORD_BOT_TOKEN)throw Error('Application ID, Guild ID und Bot-Token konfigurieren.');
 async function call(path,options={}){
  let response;try{response=await transport('https://discord.com/api/v10'+path,{...options,headers:{Authorization:'Bot '+config.DISCORD_BOT_TOKEN,...options.headers},signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw Error('Discord-Registrierung: Netzwerkfehler.');}
  if(!response.ok)throw Error('Discord-Registrierung fehlgeschlagen (HTTP '+response.status+').');
  return response.json();
 }
 const application=await call('/oauth2/applications/@me');if(application.id!==config.DISCORD_APPLICATION_ID)throw Error('Der Bot-Token gehört zu einer anderen Discord-Anwendung.');
 const bot=await call('/users/@me');if(!/^\d{17,22}$/.test(bot.id||''))throw Error('Ungültige Bot-Identität.');
 // POST upserts this one guild command by name/type; no other commands are removed.
 const command=await call(`/applications/${config.DISCORD_APPLICATION_ID}/guilds/${config.DISCORD_GUILD_ID}/commands`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(discordNewsCommand)});
 return {dryRun:false,commandId:command.id,name:command.name,botUserId:bot.id,guildId:config.DISCORD_GUILD_ID};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 registerDiscordNews(process.env,fetch,process.argv.includes('--apply')).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
