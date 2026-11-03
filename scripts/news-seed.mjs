// Idempotent offline import using the same validator as protected manual publishing.
import {readFile,writeFile} from 'node:fs/promises';
import {manualPost} from '../worker/news-model.js';
const file=new URL('../assets/data/updates.json',import.meta.url);
const doc=JSON.parse(await readFile(file,'utf8'));
const id='velocity-news-welcome-test';
if(!doc.updates.some(p=>p.id===id)){
 const p=manualPost({id,title:'Test-Beitrag: Willkommen bei den News!',category:'Update',status:'published',image:'assets/images/velocity-news-sunset.webp',excerpt:'Willkommen im neuen Neuigkeiten-Bereich von VeloCity! Hier findest du künftig alle wichtigen Ankündigungen und Updates.',content:'Willkommen im neuen Neuigkeiten-Bereich von VeloCity!\n\nHier findest du künftig wichtige Ankündigungen, Änderungen am Wirtschaftssystem, technische Verbesserungen und Informationen zur Weiterentwicklung unseres Minecraft-Servers.\n\n### Was ist neu?\n\n- Modernisierte Neuigkeiten-Seite im Blog-Design.\n- Eigene Detailseiten für vollständige Beiträge.\n- Vorbereitung der automatischen Discord-Anbindung.\n- Möglichkeit, Beiträge manuell zu veröffentlichen.\n- Optimierte Darstellung auf Desktop und Smartphone.\n\n### Wie geht es weiter?\n\nWir entwickeln VeloCity laufend weiter und informieren dich hier über wichtige Fortschritte.\n\n> Hinweis: Dieser Beitrag dient vorerst dazu, das neue Design und die Darstellung verschiedener Textformate zu überprüfen.'});
 doc.updates.push(p);doc.updatedAt=p.updatedAt;await writeFile(file,JSON.stringify(doc,null,2)+'\n');
}
const fields=['id','slug','title','excerpt','content','category','image','status','source','source_id','channel_id','guild_id','author','published_at','updated_at','revision','hidden'];
const sql=v=>v==null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const statements=doc.updates.filter(p=>p.source==='manual'&&p.status==='published').map(p=>`INSERT OR IGNORE INTO news_posts(${fields.join(',')}) VALUES(${[p.id,p.slug,p.title,p.excerpt,p.content,p.category,p.image,p.status,p.source,null,null,null,p.author,p.publishedAt,p.updatedAt,p.revision,0].map(sql).join(',')});`);
await writeFile(new URL('../worker/migrations/0002_seed_news.sql',import.meta.url),'-- Existing published manual data, imported without overwriting any existing ID.\n'+statements.join('\n')+'\n');
console.log('Testbeitrag über das gemeinsame manuelle Datenmodell gespeichert; D1-Import vorbereitet.');
