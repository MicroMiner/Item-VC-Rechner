import {access,mkdir,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {discordImageUrl,discordImageType,discordNewsImageLimit} from '../shared/discord-news.mjs';

// Runs only inside the existing channel sync. Public Discord attachments are
// archived locally so signed CDN URLs cannot expire in older website posts.
export async function cacheDiscordNewsImage(messageId,post,{root=process.cwd(),transport=fetch}={}){
 if(!post.image)return null;
 if(!/^\d{17,22}$/.test(String(messageId))||!/^\d{17,22}$/.test(post.imageAttachmentId)||!['jpg','png','webp','gif'].includes(post.imageExtension)||!discordImageUrl(post.image))throw Error('Ungültiger Discord-Bildanhang.');
 const directory=join(root,'assets/img/news'),name=`discord-${messageId}-${post.imageAttachmentId}.${post.imageExtension}`,file=join(directory,name),relative='assets/img/news/'+name;
 try{await access(file);return relative;}catch{}
 let response;try{response=await transport(post.image,{redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error('Discord-Titelbild konnte nicht heruntergeladen werden.');}
 if(!response.ok||Number(response.headers.get('Content-Length'))>discordNewsImageLimit)throw Error('Discord-Titelbild nicht erreichbar oder zu gross.');
 const reader=response.body?.getReader();if(!reader)throw Error('Discord-Titelbild fehlt.');
 let size=0;const chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>discordNewsImageLimit){await reader.cancel();throw Error('Discord-Titelbild zu gross.');}chunks.push(value);}
 const bytes=Buffer.concat(chunks),kind=discordImageType(bytes);
 if(!kind||kind.extension!==post.imageExtension)throw Error('Ungültiger Discord-Bildinhalt.');
 await mkdir(directory,{recursive:true});const temporary=file+'.tmp';
 try{await writeFile(temporary,bytes);await rename(temporary,file);}catch{await unlink(temporary).catch(()=>{});throw Error('Discord-Titelbild konnte nicht gespeichert werden.');}
 return relative;
}
