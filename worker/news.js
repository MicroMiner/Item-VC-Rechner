import { manualPost, categories, slugify, safeImage } from './news-model.js';
const noSecrets = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const response = (data, status = 200, cors = {}) => new Response(JSON.stringify(data), { status, headers: { ...noSecrets, ...cors } });
const snowflake = value => typeof value === 'string' && /^\d{17,22}$/.test(value);
function post(row) {
  return { id: row.id, slug: row.slug, title: row.title, excerpt: row.excerpt, content: row.content, category: row.category, image: row.image, status: row.status, source: row.source, sourceId: row.source_id, channelId: row.channel_id, guildId: row.guild_id, author: row.author, publishedAt: row.published_at, updatedAt: row.updated_at, revision: row.revision, hidden: Boolean(row.hidden) };
}
const fields = ['id','slug','title','excerpt','content','category','image','status','source','source_id','channel_id','guild_id','author','published_at','updated_at','revision','hidden'];
const values = p => [p.id,p.slug,p.title,p.excerpt,p.content,p.category,p.image,p.status,p.source,p.sourceId,p.channelId,p.guildId,p.author,p.publishedAt,p.updatedAt,p.revision,p.hidden ? 1 : 0];
async function body(request) {
  const raw = await request.text();
  if (raw.length > 200000) throw Error('Anfrage zu gross.');
  return JSON.parse(raw);
}
async function state(db, key) {
  const row = await db.prepare('SELECT value FROM news_state WHERE key = ?').bind(key).first();
  return row ? JSON.parse(row.value) : null;
}
function putState(db, key, value) {
  return db.prepare('INSERT INTO news_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key, JSON.stringify(value));
}
function newsJpegDimensions(bytes) {
  if (bytes[0]!==255 || bytes[1]!==216 || bytes.at(-2)!==255 || bytes.at(-1)!==217) return null;
  for(let i=2;i+8<bytes.length;) {
    if(bytes[i++]!==255)return null;
    while(bytes[i]===255)i++;
    const marker=bytes[i++];
    if(marker===218||marker===217)return null;
    const length=(bytes[i]<<8)|bytes[i+1];
    if(length<2||i+length>bytes.length)return null;
    if([192,193,194].includes(marker))return {height:(bytes[i+3]<<8)|bytes[i+4],width:(bytes[i+5]<<8)|bytes[i+6]};
    i+=length;
  }
  return null;
}
async function newsImageUpload(request,db,origin,cors) {
  if(request.headers.get('Content-Type')?.split(';')[0]!=='image/jpeg')return response({error:'Bitte ein zugeschnittenes JPEG-Bild hochladen.'},400,cors);
  if(Number(request.headers.get('Content-Length'))>768000)return response({error:'Bild zu gross. Maximum: 750 KB.'},413,cors);
  const reader=request.body?.getReader();if(!reader)return response({error:'Bild fehlt.'},400,cors);
  let length=0;const chunks=[];
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>768000){await reader.cancel();return response({error:'Bild zu gross. Maximum: 750 KB.'},413,cors);}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  const size=newsJpegDimensions(bytes);
  if(!size||size.width!==1600||size.height!==900)return response({error:'Ungültiges Bild. Bitte den 1600 × 900 Bildausschnitt übernehmen.'},400,cors);
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const id=crypto.randomUUID();await putState(db,'image:'+id,{data:btoa(binary),type:'image/jpeg'}).run();
  return response({image:origin+'/news/image/'+id,width:1600,height:900},201,cors);
}
function newsOriginal(input) {
  const original=input.original;
  if(!original)return null;
  if(original.id!==input.id||!['manual','discord'].includes(original.source))throw Error('Ungültiger Ursprungsbeitrag.');
  const p=manualPost({...original,status:'published'});
  if(original.source==='discord'&&!snowflake(original.sourceId))throw Error('Ungültige Discord-ID.');
  if(typeof original.slug==='string'&&/^[a-z0-9-]{1,240}$/.test(original.slug))p.slug=original.slug;
  if(!Number.isFinite(Date.parse(original.publishedAt)))throw Error('Ungültiges Veröffentlichungsdatum.');
  return {...p,revision:0,source:original.source,sourceId:original.source==='discord'?original.sourceId:null,publishedAt:new Date(original.publishedAt).toISOString(),author:original.source==='discord'?'Discord':'VeloCity'};
}
export async function newsRequest(request, env, { verifySession, sameSecret, cors }) {
  const url = new URL(request.url), path = url.pathname;
  const bot = path.startsWith('/discord/');
  if (bot) {
    const secret = request.headers.get('Authorization') || '';
    if (!env.DISCORD_INGEST_TOKEN || !await sameSecret(secret, 'Bearer ' + env.DISCORD_INGEST_TOKEN)) return response({ error: 'Nicht autorisiert.' }, 401);
  } else if (!(path.startsWith('/news/image/') && ['GET','HEAD'].includes(request.method)) && request.headers.get('Origin') !== env.SITE_ORIGIN?.replace(/\/$/, '')) return response({ error: 'Origin nicht zugelassen.' }, 403);
  if (request.method === 'OPTIONS' && !bot) return new Response(null, { status: 204, headers: cors });
  if (!env.NEWS_DB) return response({ error: 'News-Datenbank noch nicht eingerichtet.', configured: false }, 503, cors);
  const db = env.NEWS_DB;
  try {
    if(path.startsWith('/news/image/') && ['GET','HEAD'].includes(request.method)) {
      const id=path.slice('/news/image/'.length);
      if(!/^[a-f0-9-]{36}$/.test(id))return response({error:'Bild nicht gefunden.'},404,cors);
      const stored=await state(db,'image:'+id);
      if(!stored)return response({error:'Bild nicht gefunden.'},404,cors);
      const data=Uint8Array.from(atob(stored.data),c=>c.charCodeAt(0));
      return new Response(request.method==='HEAD'?null:data,{headers:{'Content-Type':'image/jpeg','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",...cors}});
    }
    if(path==='/news/overlay'&&request.method==='GET') {
      const rows=await db.prepare("SELECT * FROM news_posts WHERE source='manual' OR source_event_id='website' ORDER BY updated_at DESC, id").all();
      return response({posts:rows.results.filter(r=>r.status==='published'&&!r.hidden).map(post),suppressedIds:rows.results.map(r=>r.id)},200,cors);
    }
    if (path === '/news/status' && request.method === 'GET') {
      const configured = snowflake(env.DISCORD_GUILD_ID) && snowflake(env.DISCORD_CHANNEL_ID) && Boolean(env.DISCORD_INGEST_TOKEN);
      const heartbeat = await state(db, 'discord_heartbeat'), lastSync = await state(db, 'discord_last_sync'), lastError = await state(db, 'discord_error');
      const fresh = heartbeat && Date.now() - Date.parse(heartbeat.at) < 180000;
      return response({ configured: true, discord: { status: !configured ? 'not_configured' : lastError ? 'error' : fresh ? 'connected' : 'disconnected', lastHeartbeat: heartbeat?.at || null, lastSync: lastSync?.at || null } }, 200, cors);
    }
    if (path === '/news' && request.method === 'GET') {
      const slug = url.searchParams.get('slug');
      if (slug) {
        const row = await db.prepare("SELECT * FROM news_posts WHERE slug = ? AND status = 'published' AND hidden = 0").bind(slug).first();
        return response(row ? { post: post(row) } : { error: 'Beitrag nicht gefunden.' }, row ? 200 : 404, cors);
      }
      const offset = Math.max(0, Math.min(100000, parseInt(url.searchParams.get('offset'),10) || 0));
      const limit = Math.max(1, Math.min(1000, parseInt(url.searchParams.get('limit'),10) || 1000));
      const rows = await db.prepare("SELECT * FROM news_posts WHERE status='published' AND hidden=0 ORDER BY published_at DESC, id LIMIT ? OFFSET ?").bind(limit, offset).all();
      const count = await db.prepare("SELECT COUNT(*) AS count FROM news_posts WHERE status='published' AND hidden=0").first();
      return response({ posts: rows.results.map(post), total: count.count }, 200, cors);
    }
    if (path.startsWith('/news/admin')) {
      const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
      if (!await verifySession(token, env)) return response({ error: 'Bitte mit der bestehenden Admin-Anmeldung anmelden.' }, 401, cors);
      if (path === '/news/admin' && request.method === 'GET') {
        const rows = await db.prepare('SELECT * FROM news_posts ORDER BY updated_at DESC, id LIMIT 1000').all();
        return response({ posts: rows.results.map(post), capabilities:{websiteEditing:true,imageUpload:true} }, 200, cors);
      }
      if(path==='/news/admin/image'&&request.method==='POST')return await newsImageUpload(request,db,url.origin,cors);
      if (path === '/news/admin' && request.method === 'POST') {
        const input = await body(request), id = input.id;
        const row = id ? await db.prepare('SELECT * FROM news_posts WHERE id=?').bind(id).first() : null;
        if (row && input.revision !== row.revision) return response({ error: 'Der Beitrag wurde geändert. Bitte neu laden.' }, 409, cors);
        if(!row&&input.revision!=null)return response({error:'Speicherkonflikt. Bitte neu laden.'},409,cors);
        const previous=row?post(row):newsOriginal(input);
        const p = manualPost(input, previous);
        if(previous){p.source=previous.source;p.sourceId=previous.sourceId;p.channelId=previous.channelId||null;p.guildId=previous.guildId||null;}
        let result;
        if (row) result = await db.prepare(`UPDATE news_posts SET ${fields.slice(1).map(f=>f+'=?').join(',')},source_event_id='website' WHERE id=? AND revision=?`).bind(...values(p).slice(1), p.id, input.revision).run();
        else result = await db.prepare(`INSERT OR IGNORE INTO news_posts(${fields.join(',')},source_event_id) VALUES(${fields.map(()=>'?').join(',')},'website')`).bind(...values(p)).run();
        if (!result.meta.changes) return response({ error: 'Speicherkonflikt oder bereits gespeichert. Bitte Verwaltung neu laden.' }, 409, cors);
        return response({ post: p }, row ? 200 : 201, cors);
      }
      if (path === '/news/admin/delete' && request.method === 'POST') {
        const input = await body(request);
        const row=await db.prepare('SELECT * FROM news_posts WHERE id=?').bind(input.id).first();
        let result;
        if(row)result=await db.prepare("UPDATE news_posts SET hidden=1,revision=revision+1,source_event_id='website' WHERE id=? AND revision=?").bind(input.id,input.revision).run();
        else {
          if(input.revision!=null)return response({error:'Speicherkonflikt. Bitte neu laden.'},409,cors);
          const p=newsOriginal(input);if(!p)throw Error('Ungültiger Ursprungsbeitrag.');p.hidden=true;p.revision=1;
          result=await db.prepare(`INSERT OR IGNORE INTO news_posts(${fields.join(',')},source_event_id) VALUES(${fields.map(()=>'?').join(',')},'website')`).bind(...values(p)).run();
        }
        return response(result.meta.changes ? { ok: true } : { error: 'Speicherkonflikt. Bitte neu laden.' }, result.meta.changes ? 200 : 409, cors);
      }
      if (path === '/news/admin/moderate' && request.method === 'POST') {
        const input = await body(request);
        if (typeof input.hidden !== 'boolean') throw Error('Ungültiger Status.');
        const result = await db.prepare("UPDATE news_posts SET hidden=?,revision=revision+1,source_event_id='website' WHERE id=? AND revision=? AND source='discord'").bind(input.hidden ? 1 : 0, input.id, input.revision).run();
        return response(result.meta.changes ? { ok: true } : { error: 'Speicherkonflikt.' }, result.meta.changes ? 200 : 409, cors);
      }
    }
    if (bot && request.method === 'POST') {
      const input = await body(request);
      if (!snowflake(env.DISCORD_GUILD_ID) || !snowflake(env.DISCORD_CHANNEL_ID) || input.guildId !== env.DISCORD_GUILD_ID || input.channelId !== env.DISCORD_CHANNEL_ID) return response({ error: 'Kanal oder Server nicht zugelassen.' }, 403);
      const now = new Date().toISOString();
      if (path === '/discord/heartbeat') {
        await db.batch([putState(db, 'discord_heartbeat', { at: now }), putState(db, 'discord_error', input.ok === false ? { at: now } : null)]);
        return response({ ok: true });
      }
      if (path === '/discord/events') {
        if (!snowflake(input.messageId) || !['create','update','delete'].includes(input.type) || typeof input.eventId !== 'string' || !/^[a-zA-Z0-9_.:-]{1,180}$/.test(input.eventId)) throw Error('Ungültiges Discord-Ereignis.');
        const time = Date.parse(input.eventAt);
        if (!Number.isFinite(time) || time > Date.now() + 60000) throw Error('Ungültiger Ereigniszeitpunkt.');
        const duplicate = await db.prepare('SELECT id FROM news_events WHERE id=?').bind(input.eventId).first();
        if (duplicate) return response({ ok: true, duplicate: true });
        const deleted = input.type === 'delete';
        const statements = [db.prepare('INSERT OR IGNORE INTO news_events(id,received_at) VALUES(?,?)').bind(input.eventId, now),
          db.prepare('INSERT INTO news_discord_versions(message_id,event_time,event_id,deleted) VALUES(?,?,?,?) ON CONFLICT(message_id) DO UPDATE SET event_time=excluded.event_time,event_id=excluded.event_id,deleted=excluded.deleted WHERE (news_discord_versions.deleted=0 OR excluded.deleted=1) AND (excluded.event_time > news_discord_versions.event_time OR (excluded.event_time = news_discord_versions.event_time AND excluded.deleted > news_discord_versions.deleted))').bind(input.messageId,time,input.eventId,deleted?1:0)];
        const guard = 'EXISTS(SELECT 1 FROM news_discord_versions WHERE message_id=? AND event_id=?)';
        if (deleted) {
          statements.push(env.DISCORD_DELETE_MODE === 'delete'
            ? db.prepare(`DELETE FROM news_posts WHERE source='discord' AND source_id=? AND (source_event_id IS NULL OR source_event_id<>'website') AND ${guard}`).bind(input.messageId,input.messageId,input.eventId)
            : db.prepare(`UPDATE news_posts SET hidden=1,revision=revision+1,source_event_id=? WHERE source='discord' AND source_id=? AND (source_event_id IS NULL OR source_event_id<>'website') AND (source_event_id IS NULL OR source_event_id<>?) AND ${guard}`).bind(input.eventId,input.messageId,input.eventId,input.messageId,input.eventId));
        } else {
          const p = manualPost({ id: 'discord-'+input.messageId, title: input.title, excerpt: input.excerpt, content: input.content, category: input.category || 'Ankündigung', image: input.image, status:'published' }, null, now);
          p.source='discord';p.sourceId=input.messageId;p.channelId=input.channelId;p.guildId=input.guildId;p.author='Discord';
          p.slug=slugify(p.title)+'-'+input.messageId;
          const published = Date.parse(input.publishedAt);
          if (!Number.isFinite(published) || published > Date.now()+60000) throw Error('Ungültiges Veröffentlichungsdatum.');
          p.publishedAt=new Date(published).toISOString();
          statements.push(db.prepare(`INSERT INTO news_posts(${fields.join(',')},source_event_id) SELECT ${fields.map(()=>'?').join(',')},? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET title=excluded.title,excerpt=excluded.excerpt,content=excluded.content,category=excluded.category,image=excluded.image,updated_at=excluded.updated_at,revision=news_posts.revision+1,source_event_id=excluded.source_event_id WHERE news_posts.source_event_id IS NULL OR (news_posts.source_event_id<>'website' AND news_posts.source_event_id<>excluded.source_event_id)`).bind(...values(p),input.eventId,input.messageId,input.eventId));
        }
        statements.push(putState(db,'discord_last_sync',{ at:now }),putState(db,'discord_error',null));
        await db.batch(statements);
        return response({ ok:true });
      }
    }
    return response({ error:'Nicht gefunden.' },404,cors);
  } catch (error) {
    // Validation errors are safe; database/credential details are never public.
    const validation = error instanceof SyntaxError || /Bitte|Ungültig|höchstens|erlaubt|gross/.test(error.message);
    return response({ error:validation ? error.message : 'News-Dienst derzeit nicht verfügbar. Datenbank und Migration prüfen.' },validation?400:503,cors);
  }
}
