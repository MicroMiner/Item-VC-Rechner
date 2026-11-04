// One schema for Discord's editor, its channel messages and the existing importer.
export const categories = ['Ankündigung','Update','Info','Changelog','Wartung'];
export const discordNewsMarker = 'VeloCity News · v1';
export const discordNewsMarkerUrl = 'https://microminer.github.io/VeloCity/neuigkeiten.html#discord-news-v2';
export const discordNewsFooter = 'VeloCity · Neuigkeiten & Changelog';
const discordNewsIcon = 'https://microminer.github.io/VeloCity/assets/images/favicon.png';
export const discordNewsImageLimit = 8 * 1024 * 1024;
export function discordImageUrl(value) {
  try {const url=new URL(value);return url.protocol==='https:'&&(!url.port||url.port==='443')&&!url.username&&!url.password&&['cdn.discordapp.com','media.discordapp.net'].includes(url.hostname)&&/^\/(?:ephemeral-attachments|attachments)\/\d+\/\d+\//.test(url.pathname)?url.href:null;}catch{return null;}
}
export function discordImageType(bytes) {
  if(bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217)return {type:'image/jpeg',extension:'jpg'};
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return {type:'image/png',extension:'png'};
  const prefix=new TextDecoder().decode(bytes.subarray(0,12));
  if(/^GIF8[79]a/.test(prefix))return {type:'image/gif',extension:'gif'};
  if(prefix.startsWith('RIFF')&&prefix.slice(8,12)==='WEBP')return {type:'image/webp',extension:'webp'};
  return null;
}
export function validateDiscordNews(input) {
  if(!input||typeof input.title!=='string'||!input.title.trim()||input.title.length>160)throw Error('Titel: 1 bis 160 Zeichen.');
  if(!categories.includes(input.category))throw Error('Bitte eine gültige Kategorie auswählen.');
  if(typeof input.content!=='string'||!input.content.trim()||input.content.length>4000)throw Error('Inhalt: 1 bis 4000 Zeichen.');
  if(input.excerpt!=null&&(typeof input.excerpt!=='string'||input.excerpt.length>400))throw Error('Kurzbeschreibung: höchstens 400 Zeichen.');
  return {title:input.title.trim(),category:input.category,excerpt:(input.excerpt||'').trim(),content:input.content.trim()};
}
export function discordNewsEmbed(input,image=null,options={}) {
  const data=validateDiscordNews(input);
  const colors={'Ankündigung':0xffd21f,Update:0x38b5ef,Info:0x8fb2e8,Changelog:0x64efad,Wartung:0xf0a648};
  return {author:{name:'VeloCity · '+data.category,icon_url:discordNewsIcon},title:data.title,url:discordNewsMarkerUrl,description:data.content,color:colors[data.category],fields:data.excerpt?[{name:'Kurzbeschreibung',value:data.excerpt,inline:false}]:[],footer:{text:discordNewsFooter+(options.preview?' · Vorschau':''),icon_url:discordNewsIcon},...(options.publishedAt?{timestamp:options.publishedAt}:{}),...(image?{image:{url:image}}:{})};
}
export function parseStructuredDiscordNews(message,trustedBotId) {
  if(!/^\d{17,22}$/.test(trustedBotId||'')||message?.author?.bot!==true||String(message.author.id)!==trustedBotId||message.webhook_id||message.embeds?.length!==1)return null;
  const embed=message.embeds[0],legacy=embed.footer?.text===discordNewsMarker,modern=embed.url===discordNewsMarkerUrl&&embed.footer?.text===discordNewsFooter&&typeof embed.author?.name==='string'&&embed.author.name.startsWith('VeloCity · ');
  if(!legacy&&!modern)return null;
  try {
    const fields=embed.fields||[],category=modern?[{value:embed.author.name.slice('VeloCity · '.length)}]:fields.filter(f=>f.name==='Kategorie'),excerpt=fields.filter(f=>f.name==='Kurzbeschreibung');
    if(category.length!==1||excerpt.length>1)return null;
    const data=validateDiscordNews({title:embed.title,content:embed.description,category:category[0].value,excerpt:excerpt[0]?.value||''});
    const attachments=Array.isArray(message.attachments)?message.attachments:message.attachments?.values?[...message.attachments.values()]:[];
    let image=attachments.find(a=>/^title-image\.(jpg|png|webp|gif)$/.test(a.filename||'')&&discordImageUrl(a.url)&&new URL(a.url).pathname.startsWith('/attachments/')&&/^\d{17,22}$/.test(String(a.id)));
    // Discord can omit embed-consumed uploads from message.attachments. The
    // trusted bot's public embed image still contains the stable attachment ID.
    if(!image&&embed.image){
      const url=discordImageUrl(embed.image.url),path=url?new URL(url).pathname:'';
      const match=/^\/attachments\/\d{17,22}\/(\d{17,22})\/[^/]+\.(jpg|jpeg|png|webp|gif)$/i.exec(path);
      if(match)image={id:match[1],url,filename:'title-image.'+(match[2].toLowerCase()==='jpeg'?'jpg':match[2].toLowerCase())};
    }
    // Only public Discord CDN uploads; never external or ephemeral preview URLs.
    if(embed.image&&!image)return null;
    return {...data,image:image?discordImageUrl(image.url):null,imageAttachmentId:image?String(image.id):null,imageExtension:image?image.filename.split('.').at(-1):null};
  } catch{return null;}
}
