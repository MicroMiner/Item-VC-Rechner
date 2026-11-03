import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNewsBridge} from '../scripts/discord-news-client.mjs';
test('existing-bot adapter scopes messages and forwards idempotent changes/deletes without Discord posts',async()=>{
 const calls=[],config={NEWS_API_URL:'https://news.example',DISCORD_GUILD_ID:'111111111111111111',DISCORD_CHANNEL_ID:'222222222222222222',DISCORD_INGEST_TOKEN:'local-secret'};
 const bridge=createNewsBridge(config,async(url,options)=>{calls.push({url,options,data:JSON.parse(options.body)});return Response.json({ok:true});});
 const m={id:'333333333333333333',guildId:config.DISCORD_GUILD_ID,channelId:config.DISCORD_CHANNEL_ID,content:'[Update] Neue Brücke\n\n- Willkommen',createdTimestamp:Date.now()-2000,author:{bot:false},attachments:[]};
 await bridge.message({...m,channelId:'444444444444444444'});await bridge.message({...m,author:{bot:true}});assert.equal(calls.length,0);
 await bridge.message(m);await bridge.message(m);assert.equal(calls[0].data.eventId,calls[1].data.eventId);assert.equal(calls[0].data.title,'Neue Brücke');assert.equal(calls[0].options.headers.Authorization,'Bearer local-secret');assert.equal(calls[0].data.category,'Update');
 await bridge.message({...m,content:'[Info] Bearbeitet',editedTimestamp:Date.now()-1000});assert.equal(calls.at(-1).data.type,'update');assert.notEqual(calls.at(-1).data.eventId,calls[0].data.eventId);
 await bridge.deleted(m);assert.equal(calls.at(-1).data.type,'delete');await bridge.heartbeat(false);assert.equal(calls.at(-1).data.ok,false);assert.ok(calls.every(x=>x.url.startsWith('https://news.example/discord/')));
});
