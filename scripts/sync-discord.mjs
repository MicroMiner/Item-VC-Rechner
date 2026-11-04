// VeloCity: imports news from one explicitly configured Discord channel.
// Node.js 22+, no third-party dependencies. Never expose the bot token to the browser.
import { readFile, writeFile } from "node:fs/promises";
import { createNewsBridge } from "./discord-news-client.mjs";
import { parseStructuredDiscordNews } from '../shared/discord-news.mjs';
import { cacheDiscordNewsImage } from './discord-news-images.mjs';

const token = process.env.DISCORD_BOT_TOKEN;
const channel = process.env.DISCORD_CHANNEL_ID;
if (!token || !/^\d{17,22}$/.test(channel ?? "")) {
  console.error("Set DISCORD_BOT_TOKEN (secret) and DISCORD_CHANNEL_ID (variable).");
  process.exit(1);
}

const file = "assets/data/updates.json";
const original = JSON.parse(await readFile(file, "utf8"));
if (!Array.isArray(original.updates)) throw new Error("Invalid updates.json");

async function getMessages(before) {
  const url = new URL(`https://discord.com/api/v10/channels/${channel}/messages`);
  url.searchParams.set("limit", "100");
  if (before) url.searchParams.set("before", before);
  const res = await fetch(url, {
    headers: { Authorization: `Bot ${token}`, "User-Agent": "VeloCity-NewsSync (GitHub Actions)" }
  });
  if (!res.ok) {
    // Never log response bodies or authorization headers.
    throw new Error(`Discord request failed (HTTP ${res.status}). Check channel permissions and token.`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Unexpected Discord response");
  return data;
}

// Read up to 200 recent messages. Older imported posts are retained.
const messages = [];
let before;
for (let page = 0; page < 2; page++) {
  const batch = await getMessages(before);
  messages.push(...batch);
  if (batch.length < 100) break;
  before = batch.at(-1).id;
}

const categories = new Set(["Ankündigung", "Update", "Changelog", "Wartung"]);
const selfResponse=await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:`Bot ${token}`}});
if(!selfResponse.ok)throw Error('Discord bot identity lookup failed.');
const self=await selfResponse.json();
if(!/^\d{17,22}$/.test(self.id||''))throw Error('Invalid Discord bot identity.');
async function structuredPost(message){
 if(message.type!==0)return null;
 const structured=parseStructuredDiscordNews(message,self.id);if(!structured)return null;
 const image=await cacheDiscordNewsImage(message.id,structured);
 return {id:`discord-${message.id}`,source:'discord',sourceId:String(message.id),title:structured.title,category:structured.category,excerpt:structured.excerpt,content:structured.content,publishedAt:message.timestamp,image,url:`https://discord.com/channels/${process.env.DISCORD_GUILD_ID||'@me'}/${channel}/${message.id}`};
}
function convert(m) {
  if (!m || m.type !== 0 || !m.id || !m.timestamp) return null;
  // Ignore bots: avoids importing automated echoes and unrelated integrations.
  if (m.author?.bot) return null;
  const content = String(m.content ?? "").trim();
  if (!content) return null;
  const lines = content.split(/\r?\n/);
  const first = lines[0].trim();
  const categoryTag = /^\[(Ankündigung|Update|Changelog|Wartung)\]\s*/i.exec(first);
  const category = categoryTag
    ? [...categories].find(x => x.toLowerCase() === categoryTag[1].toLowerCase())
    : "Ankündigung";
  const title = (categoryTag ? first.slice(categoryTag[0].length) : first).slice(0, 120).trim() || "Servermeldung";
  const rest = lines.slice(1).join("\n").trim();
  // Also show title-only Discord messages as a news item.
  const body = (rest || title).slice(0, 6000);
  return {
    id: `discord-${m.id}`,
    source: "discord",
    sourceId: String(m.id),
    category,
    title,
    content: body,
    publishedAt: m.timestamp,
    image: null,
    url: `https://discord.com/channels/${m.guild_id}/${channel}/${m.id}`
  };
}

// Backend mode shares the persistent news store and never exposes the ingest token.
if (process.env.NEWS_API_URL) {
  const bridge = createNewsBridge({...process.env,DISCORD_NEWS_BOT_ID:self.id});
  try {
    // Verify the configured guild against Discord, rather than inventing guild IDs.
    const metadata = await fetch(`https://discord.com/api/v10/channels/${channel}`, {headers:{Authorization:`Bot ${token}`}});
    if(!metadata.ok)throw Error('Discord channel lookup failed.');
    const info=await metadata.json();
    if(info.guild_id!==process.env.DISCORD_GUILD_ID)throw Error('Configured guild does not match the news channel.');
    for(const message of messages)if(message.type===0){
      const structured=await structuredPost(message);
      await bridge.message({...message,guild_id:info.guild_id,channel_id:channel},structured?{image:structured.image?new URL(structured.image,process.env.NEWS_PUBLIC_BASE_URL||'https://microminer.github.io/VeloCity/').href:null}:{});
    }
    await bridge.heartbeat(true);
    console.log('Authenticated news synchronization completed.');
  } catch(error) { await bridge.heartbeat(false).catch(()=>{});throw error; }
  process.exit(0);
}

const fetchedIds = new Set(messages.map(m => String(m.id)));
const incoming=[];
for(const message of messages){const post=await structuredPost(message)||convert(message);if(post)incoming.push(post);}
const other = original.updates.filter(x => x.source !== "discord");
const oldDiscord = original.updates.filter(x => x.source === "discord" && !fetchedIds.has(String(x.sourceId)));
const merged = [...new Map([...other, ...oldDiscord, ...incoming].map(post=>[post.id,post])).values()]
  .sort((a,b) => Date.parse(b.publishedAt ?? 0) - Date.parse(a.publishedAt ?? 0));
const oldComparable = JSON.stringify(original.updates);
const newComparable = JSON.stringify(merged);
if (oldComparable === newComparable) {
  console.log("News unchanged.");
} else {
  const updated = { ...original, updatedAt: new Date().toISOString(), updates: merged };
  await writeFile(file, JSON.stringify(updated, null, 2) + "\n", "utf8");
  console.log(`News updated: ${incoming.length} Discord entries in current fetch window.`);
}
