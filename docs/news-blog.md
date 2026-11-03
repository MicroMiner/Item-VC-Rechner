# VeloCity: Neuigkeiten, Verwaltung und Discord

## Implementierter Stand

Die Übersicht und die eigene Beitragsansicht verwenden das vorhandene Design, den gemeinsamen Header und das separate Burgmotiv. Die direkte Route ist `neuigkeiten.html?beitrag=<slug>`; sie funktioniert auf GitHub Pages ohne Rewrite, auch nach Reload. Zehn Beiträge werden zunächst gezeigt, danach gibt es „Weitere Beiträge laden“. Die Übersicht lädt zunächst bis zu 50 Datensätze, zeigt sie in Zehnerschritten und lädt weitere Seiten über `limit`/`offset` nach (API-Maximum: 1000 pro Abruf). Die Startseitenvorschau verwendet dieselben veröffentlichten Beiträge.

Ein manueller Testbeitrag ist in `assets/data/updates.json` gespeichert. `node scripts/news-seed.mjs` verwendet denselben Validator wie die geschützte Veröffentlichung und erzeugt idempotent die D1-Importmigration `0002_seed_news.sql`. Bestehende Datensätze werden nicht überschrieben. Die Bilder sind eigene WebP-Assets.

Der Editor verwendet **dieselbe** `/auth`-Anmeldung, denselben Sitzungsschlüssel `velocity.adminSession:<API-Adresse>` und dieselbe 30-Minuten-Sitzung wie der Umrechner. Es gibt kein zweites Admin-Passwort. Sitzungen werden bei jedem Schreibzugriff im Worker kryptografisch geprüft. Entwürfe, Revisionen und Discord-Metadaten liegen in D1, nicht in öffentlich ausgelieferten JSON-Dateien. Der Editor bietet Vorschau, Entwurf, Veröffentlichen, Bearbeiten und bestätigtes Löschen. Optimistische Revisionen schützen vor veralteten Änderungen; eine stabile Beitrags-ID und deaktivierte Formulare während des Speicherns verhindern doppelte Veröffentlichungen. Discord-Beiträge lassen sich nur aus-/einblenden, nicht widersprüchlich manuell umschreiben.

Formatierung: Absätze, Überschriften, Listen, **fett**, *kursiv*, `Code`, Links und Hinweiszitate. Alle Inhalte werden über DOM-Textknoten und explizit erlaubte Elemente dargestellt, niemals als fremdes HTML. `javascript:`-/`data:`-URLs werden verworfen. Bildladefehler entfernen das Bild, ohne den Beitrag zu verlieren. Teilen nutzt `navigator.share`, sonst Clipboard mit verständlichem Fallback.

## Einmalig in Cloudflare aktivieren

Die Repository-Änderung allein installiert **keine** Datenbank und veröffentlicht **keinen** Worker. Der produktive Worker verwendet weiterhin seine bisherige Version, bis diese Schritte erledigt sind:

1. Im vorhandenen Cloudflare-Konto mit der bestehenden Worker-Konfiguration arbeiten. Die produktive öffentliche Adresse steht unverändert in `config.js`.
2. D1 erstellen: `npx wrangler d1 create velocity-news`.
3. In `worker/wrangler.toml` die vorbereitete `[[d1_databases]]`-Sektion aktivieren und die tatsächlich zurückgegebene `database_id` einsetzen. Binding muss **NEWS_DB** heissen. Worker-Name/Account vor Deployment gegen den bestehenden Worker prüfen.
4. Migrationen anwenden: `npx wrangler d1 migrations apply velocity-news --remote --config worker/wrangler.toml`. Die zweite Migration importiert den vorhandenen manuellen Testbeitrag ohne Überschreiben.
5. Bestehende Secrets **ADMIN_PASSWORD** und **GITHUB_TOKEN** beibehalten. Kein neues Admin-Passwort setzen. Bestehende GitHub-/Origin-Einstellungen erhalten.
6. Worker aktualisieren: `npx wrangler deploy --config worker/wrangler.toml`.
7. Im Browser JSON-Laden und Umrechner-Login prüfen, danach News-Admin öffnen, Entwurf speichern und veröffentlichen.

Bis dahin liest die Website bei noch fehlendem Endpunkt (404) oder fehlender Datenbank (`configured:false`) weiterhin die vorhandene statische Datei. Die Admin-Funktion meldet, dass das Backend noch eingerichtet werden muss. Bei einem tatsächlichen Ausfall eines eingerichteten Backends wird ein Fehler gezeigt; alte statische Beiträge werden dann nicht als vermeintlich aktuelle Daten angezeigt.

## Discord später aktivieren

Es wird **kein zweiter Bot** eingerichtet. `scripts/discord-news-client.mjs` ist ein Adapter für den bestehenden, noch nicht gestarteten Bot. Er öffnet selbst keine Discord-Verbindung und sendet keine Nachrichten an Discord.

Nur serverseitig konfigurieren:

- `DISCORD_GUILD_ID`: erlaubter Discord-Server.
- `DISCORD_CHANNEL_ID`: genau ein erlaubter News-Kanal.
- `DISCORD_INGEST_TOKEN`: langes zufälliges Secret (mindestens 32 Byte empfohlen), im Worker und beim Bot identisch; niemals in Frontend/Repository speichern. Im Worker über `npx wrangler secret put DISCORD_INGEST_TOKEN --config worker/wrangler.toml` setzen.
- `NEWS_API_URL`: bestehende öffentliche Worker-Adresse, nur für den Bot/Importer.
- `DISCORD_DELETE_MODE`: `hide` (Standard) oder `delete`.
- `discordInvite` in `assets/js/site-config.js`: optional eine echte `https://discord.gg/...`- oder `https://discord.com/invite/...`-Adresse. Ohne Adresse gibt es keinen Einladungsbutton.

Vorhandenen Bot verbinden (sinngemäss an seine tatsächliche Bibliothek anpassen):

```js
import { createNewsBridge } from './scripts/discord-news-client.mjs';
const bridge = createNewsBridge();
let stopHeartbeat;
client.on('clientReady', () => { stopHeartbeat = bridge.startHeartbeat(); });
client.on('messageCreate', message => bridge.message(message).catch(report));
client.on('messageUpdate', async (_before, message) => {
  if (message.partial) message = await message.fetch();
  await bridge.message(message).catch(report);
});
client.on('messageDelete', message => bridge.deleted(message).catch(report));
// Beim tatsächlichen Verbindungsabbruch: Heartbeat stoppen und Fehler melden.
// report protokolliert nur Fehlercodes, niemals Tokens oder Request-Header.
```

Die Discord-Berechtigungen müssen Lesen des ausgewählten Kanals und gegebenenfalls Message Content Intent erlauben. Zum Posten von Nachrichten ist keine Berechtigung nötig. Fremde Server/Kanäle und Bot-Nachrichten werden ignoriert.

`POST /discord/events` verlangt `Authorization: Bearer <DISCORD_INGEST_TOKEN>`. Payload: `eventId`, `type` (`create`, `update`, `delete`), `guildId`, `channelId`, `messageId`, ISO-`eventAt`; bei Erstellen/Ändern zusätzlich `title`, `content`, `category`, ISO-`publishedAt`, optional `excerpt` und `image`. IDs bleiben Strings. Updates behalten dieselbe Beitrags-ID und denselben Slug. Datenbanktransaktionen, Ereignis-IDs und Zeitversionen verhindern Duplikate und veraltete Updates. Auch nach hartem Löschen bleibt ein Tombstone: alte Ereignisse können den Beitrag nicht wiederbeleben. Manuelles Ausblenden bleibt bei späterer Synchronisierung bestehen.

`POST /discord/heartbeat` verwendet dieselbe Authentifizierung und Kanalbindung; Payload: `guildId`, `channelId`, `ok` (Boolean). Ein aktiver Bot sendet alle 60 Sekunden. `GET /news/status` liefert ausschliesslich öffentliche Statusdaten:

- **Nicht eingerichtet**: Guild, Kanal oder Secret fehlen.
- **Nicht verbunden**: kein Heartbeat oder älter als drei Minuten.
- **Verbunden**: frischer, authentifizierter Heartbeat.
- **Verbindungsfehler**: explizit gemeldeter Fehler oder tatsächlicher API-Ausfall.

Ohne gestarteten Bot gibt es keine dauerhafte grüne Verbindung. Die Website prüft den Status alle 60 Sekunden. Tokens und interne Fehlermeldungen sind im öffentlichen Status nicht enthalten.

## Vorhandener periodischer Importer

`scripts/sync-discord.mjs` bleibt erhalten. Ohne `NEWS_API_URL` arbeitet er weiter im bisherigen statischen JSON-Modus. Mit Backend-Konfiguration verwendet er den neuen authentifizierten Adapter und kontrolliert die echte Guild-Zuordnung über Discord. Die bestehende GitHub-Actions-Datei reicht die zusätzlichen Variablen/Secrets durch. Ein periodischer Import ist kein dauernd verbundener Bot; sein Heartbeat läuft nach drei Minuten ab. Löschereignisse kommen zuverlässig über den Gateway-Hook des später laufenden Bots. Das Fehlen einer Nachricht in einem begrenzten Polling-Fenster wird ausdrücklich nicht als Löschsignal interpretiert.

## Lokale Prüfung ohne produktive Nachrichten

- `node --test tests/news-worker.test.mjs tests/worker.test.mjs`: echte SQLite-Testdatenbank als D1-Adapter; bestehende Anmeldung, Entwurfschutz, Konflikte, CRUD, Secret-/Origin-/Kanalprüfung, Discord-Updates/Duplikate/Tombstones und Heartbeatstatus.
- `node tests/news-browser.cjs`: Chromium, echte Worker-Funktionen und lokale SQLite-Testdaten; mobile Übersicht/Detail, Direktlink-Reload, Teilen, sicheres Markdown, gemeinsames Login, Entwurf/Veröffentlichen/Bearbeiten/Löschen und Umrechner-Sitzung.
- `node --test tests/discord-news-client.test.mjs`: Adapter mit lokaler Transportfunktion, ohne Netzwerk/Discord-Posts.

Die Tests senden keine produktiven Nachrichten und benutzen keine realen Secrets. Noch ausstehende Aktivierung: produktive D1-Bindung/Migration, Worker-Deployment und später die echten Bot-Variablen/Heartbeat-Hooks.
