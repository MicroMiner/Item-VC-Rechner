# Discord-News-Editor aktivieren

## Was bereits besteht und so bleibt

- Webseite: GitHub Pages, News-Übersicht, Detailseite und manuelle Admin-Verwaltung.
- Admin-/News-Worker: `holy-sunset-4eb4velocity-admin-api`, vorhandene D1-Bindung
  `NEWS_DB`, bestehendes Website-Passwort und signierte Website-Sitzungen.
- Discord-Abgleich: `.github/workflows/sync-news.yml`, manuell startbar und
  `17,47 * * * *`. Das sind zwei Läufe pro Stunde zur Minute 17 und 47. GitHub
  wertet Cron in UTC aus; in der Schweiz sind die Minuten ebenfalls 17 und 47.
  GitHub kann die Ausführung verzögern. Der Zeitplan wurde nicht verändert.
- Gelöschte Discord-Nachrichten werden im aktiven statischen Import weiterhin
  aufbewahrt. Die manuelle Website-Verwaltung kann sie wie bisher ausblenden/löschen;
  deren D1-Überlagerungen werden von späteren Importen nicht überschrieben.

Es gibt keinen neuen dauerhaften Bot-Prozess und keine zweite Datenbank.
Die Discord-Anwendung empfängt Interaktionen über den vorhandenen Worker.
Ihre sichtbare Offline-Präsenz in Discord ist dafür unerheblich.

## 1. Werte bereitstellen

Im Discord Developer Portal dieselbe Anwendung öffnen, deren Bot schon vom
bestehenden News-Import verwendet wird.

| Einstellung | Fundort / Verwendung |
|---|---|
| `DISCORD_APPLICATION_ID` | General Information → Application ID |
| `DISCORD_PUBLIC_KEY` | General Information → Public Key, 64 Hex-Zeichen; öffentlich |
| `DISCORD_GUILD_ID` | ID eures Discord-Servers |
| `DISCORD_CHANNEL_ID` | bestehende News-Kanal-ID |
| `DISCORD_NEWS_ADMIN_ROLE_IDS` | erlaubte Rollen-IDs, kommagetrennt |
| `DISCORD_NEWS_ADMIN_USER_IDS` | optional erlaubte Benutzer-IDs, kommagetrennt |
| `DISCORD_BOT_TOKEN` | Bot-Token dieser Anwendung; ausschliesslich als Secret |

Discord-IDs lassen sich bei aktiviertem Entwicklermodus per Rechtsklick kopieren.
Rollen-IDs werden in den Servereinstellungen bei den Rollen kopiert. Mindestens
eine Rollen- oder Benutzerfreigabe muss gesetzt sein. Ohne Freigabe verweigert
der Worker alle Editor-Zugriffe, auch für Discord-Administratoren.

Das vorhandene GitHub-Actions-Secret `DISCORD_BOT_TOKEN` bleibt bestehen.
Für das Veröffentlichen durch den Worker wird derselbe Token zusätzlich als
Cloudflare-Secret benötigt. Er ist weder das Website-Admin-Passwort noch der
`DISCORD_INGEST_TOKEN`. Keine Tokens in Frontend-Dateien oder ins Repository schreiben.
Falls der ursprüngliche Token nicht mehr vorliegt und zurückgesetzt werden muss,
müssen anschliessend **Cloudflare und das bestehende GitHub-Secret** aktualisiert
werden, damit der laufende Import nicht ausfällt. Nicht unnötig zurücksetzen.

Beispiel ohne echte Zugangsdaten: `worker/discord-editor.env.example`.

## 2. Cloudflare-Worker aktualisieren

Im bestehenden Admin-/News-Worker unter Settings → Variables and Secrets die
öffentlichen Einstellungen aus der Tabelle als Textvariablen hinzufügen und
`DISCORD_BOT_TOKEN` als Secret setzen. `ADMIN_PASSWORD`, `GITHUB_TOKEN`,
`DISCORD_INGEST_TOKEN` und die Datenbankbindung `NEWS_DB` unverändert lassen.

Dann Edit code öffnen und den gesamten Code durch
[`worker/dashboard-worker.mjs`](../worker/dashboard-worker.mjs) ersetzen; Deploy klicken.
**Nicht den separaten BlueMap-Proxy ersetzen.** Neue SQL-Migrationen sind nicht nötig.

Alternativ mit bereits angemeldetem Wrangler:
`npx wrangler deploy --config worker/wrangler.toml`.
Bei Wrangler die öffentlichen Variablen tatsächlich konfigurieren; die Beispiele
in `wrangler.toml` sind absichtlich auskommentiert. Tokens nur per Secret verwalten.

Die Einzeldatei wird mit `node scripts/build-news-worker.mjs` erzeugt.

## 3. Interactions Endpoint im Developer Portal

Unter General Information → Interactions Endpoint URL eintragen:

`https://holy-sunset-4eb4velocity-admin-api.red-base-d220.workers.dev/discord/interactions`

Speichern. Discord prüft dabei eine signierte PING-Anfrage. Der Worker antwortet
nur bei gültiger Ed25519-Signatur mit PONG; falsche Signaturen erhalten HTTP 401.
PING braucht kein Website-Admin-Passwort und keine neue Website-Anmeldung.

Schlägt das Speichern fehl: Deployment und Public Key prüfen. Public Key und
Application ID müssen aus derselben Anwendung stammen. Ein Browser-Aufruf der
Endpoint-URL zeigt absichtlich HTTP 405; das ist kein gültiger Discord-PING.

## 4. Slash-Command registrieren – ohne Codespaces-Anmeldung

Im Repository unter Actions den Workflow **Discord news command einrichten** wählen.
Run workflow → Branch `main`, Application ID und Guild ID eintragen, starten.
Er verwendet das bereits vorhandene GitHub-Secret `DISCORD_BOT_TOKEN`.
Es wird nur der Guild-Command `/news` mit dem Unterbefehl `erstellen` registriert
oder aktualisiert. Andere Command-Namen werden nicht gelöscht. Die Optionen eines
bereits bestehenden `/news`-Commands werden durch diese Definition ersetzt.
Die Registrierung erstellt **keinen News-Beitrag** und ist wiederholbar.

Alternativ lokal mit den drei gesetzten Umgebungsvariablen:

```bash
node scripts/register-discord-news.mjs --dry-run
node scripts/register-discord-news.mjs --apply
```

Ohne `--apply` gibt es keine Discord-Schreibzugriffe. Echte lokale Secret-Dateien
werden durch `.gitignore` ausgeschlossen. Tokens nicht in die Shell-Historie schreiben.

## 5. Discord-Berechtigungen

Die Anwendung muss mit `bot` und `applications.commands` im Server installiert sein.
Im News-Kanal braucht der Bot View Channel, Read Message History, Send Messages,
Embed Links und Attach Files. Der vorhandene Message Content Intent bleibt für
normale Kanalnachrichten aktiviert; der Editor ersetzt ihn nicht.

Der registrierte Command ist standardmässig für Nicht-Administratoren deaktiviert.
Unter Servereinstellungen → Integrationen → Anwendung → `/news` gegebenenfalls die
erlaubten Rollen/Benutzer freigeben. Zusätzlich bleibt die Worker-Allowlist aus
Schritt 1 zwingend. Die Discord-Sichtbarkeit allein ist keine Veröffentlichungsfreigabe.

Der Worker prüft signierten Server, Anwendung, Eigentümer und aktuelle Rollen bei
jeder Editor-Aktion. Unmittelbar vor dem Senden werden Mitgliedschaft/Rollen erneut
per Discord-REST gelesen; auch Bot-Anwendung und Zielkanal werden überprüft.

## Bedienung

`/news erstellen` öffnet fünf Felder: Titel (1–160 Zeichen), Kategorie (bestehende
fünf Kategorien), optionale Kurzbeschreibung (400), Inhalt (1–4000) und optionales
Titelbild (JPEG/PNG/WebP/GIF, maximal 8 MB). Aktuelle Modal-Komponenten werden genutzt:
Labels, Text Inputs, String Select und File Upload.

Danach erscheint nur für den Ersteller eine Vorschau mit **Veröffentlichen,
Bearbeiten, Abbrechen**. Bearbeiten füllt die Texte wieder aus. Ein bereits
gewähltes Bild bleibt erhalten, wenn kein neues ausgewählt wird; Datei-Uploads
können vom Modal selbst nicht als bereits ausgewählte Datei vorgefüllt werden.
Entwürfe/Vorschauen laufen nach 15 Minuten ab.

Erst Veröffentlichen erzeugt die Nachricht im konfigurierten Kanal. Es gibt keine
automatischen Erwähnungen/Pings. Ein Bild wird aus der privaten Interaktion als
öffentlicher Nachrichtenanhang neu hochgeladen, nicht bloss über den kurzlebigen
Vorschaulink referenziert. Erfolgreich bestätigte Veröffentlichungen liefern den
Discord-Link. Bei unklarem Netzwerkergebnis wird nicht blind erneut gesendet;
stattdessen zuerst den News-Kanal prüfen. Atomare Statuswechsel plus Discord-Nonce
verhindern doppelte Sendungen durch wiederholte oder parallele Klicks.

## Wie der bestehende Import beide Formate verarbeitet

Normale menschliche Nachrichten behalten ihre bisherige Titel-/Textverarbeitung.
Andere Bot-Nachrichten und Webhooks werden weiter ignoriert. Nur Nachrichten des
durch den bestehenden Import-Token identifizierten Bots mit dem exakten Embed-Footer
`VeloCity News · v1` werden als strukturierte News akzeptiert. Kategorie und
Kurzbeschreibung stehen in Embed-Feldern, Titel und vollständiger Inhalt bleiben
ungetrennt im Embed. Bot-ID, Marker und Feldgrenzen werden geprüft.

Der Worker schreibt beim Discord-Veröffentlichen **keinen Beitrag in `news_posts`**.
Die Übernahme auf die Webseite geschieht allein durch den bestehenden Kanalabgleich,
mit derselben Nachrichten-ID (`discord-<message-id>`). Wiederholte Importe bleiben
duplikatfrei. Änderungen in den gelesenen Nachrichten werden weiter übernommen;
der bisherige 200-Nachrichten-Lesebereich und die Aufbewahrung älterer Beiträge bleiben.

Strukturierte Titelbilder werden dabei nach `assets/img/news/` archiviert und mit
demselben Workflow veröffentlicht. Dadurch bleiben ältere Bilder auch nach Ablauf
signierter Discord-CDN-Links verfügbar. Wiederholte Importe laden dieselbe Anhang-ID
nicht erneut. Der bestehende optionale API-Bridge-Modus verarbeitet die strukturierten
Felder ebenfalls; dort zeigt das Bild auf das gemeinsam veröffentlichte GitHub-Asset.
Für eine andere öffentliche Basisadresse kann `NEWS_PUBLIC_BASE_URL` gesetzt werden.
Archivierte Bilder zählen zum Speicher des GitHub-Repositories; alte Bilddateien
werden zur Erhaltung älterer Beiträge nicht automatisch entfernt.

## Prüfung und noch ausstehende Live-Aktivierung

Lokal geprüft, ohne produktive Discord-Nachrichten:

- Signierte PINGs, ungültige Signaturen, veränderte Bodies, alte Zeitstempel.
- Guild-/Rollen-/Benutzerfreigabe, Eigentümer, abgelaufene Entwürfe, entzogene Rollen.
- Fünf Modal-Felder, Längengrenzen, Vorschau, Bearbeiten und Abbrechen.
- Explizites Senden, Dateiprüfung, Nonce/Doppelklickschutz, sichere Fehlerfälle.
- Tatsächlicher Importer als separater Prozess mit simuliertem Discord: normale
  und strukturierte Nachrichten, voller Text/Kategorie/Kurzbeschreibung/Bild,
  Bildarchivierung, Änderungen, Aufbewahrung und wiederholte Synchronisierung.
- Idempotente Command-Registrierung und bestehende News-/Website-Authentifizierung.

```bash
node tests/discord-editor.test.mjs
node tests/discord-editor-sync.test.mjs
node tests/discord-news-client.test.mjs
node tests/news-worker.test.mjs
```

Der reale Portal-PING, die echte Command-Registrierung und eine produktive
Veröffentlichung können erst nach den obigen Einrichtungsschritten bestätigt
werden. Es wurde kein produktiver Testbeitrag veröffentlicht. Ein Live-Test mit
Veröffentlichen soll nur nach ausdrücklicher Freigabe erfolgen. Die vorhandene
manuelle GitHub-Synchronisierung kann danach zum Prüfen sofort gestartet werden.

API-Referenzen: [Discord-Modals](https://docs.discord.com/developers/components/using-modal-components),
[Komponenten inkl. File Upload](https://docs.discord.com/developers/components/reference),
[Interactions](https://docs.discord.com/developers/interactions/receiving-and-responding),
[Commands](https://docs.discord.com/developers/interactions/application-commands),
[Nachrichten und Nonce](https://docs.discord.com/developers/resources/message).

### Veröffentlichung und Status (Aktualisierung)
Beim Bestätigen wird die private Vorschau sofort durch eine Fortschrittsanzeige mit
„Status aktualisieren“ ersetzt. Dieser Button liest den gespeicherten Entwurf und
sendet keine neue Kanalnachricht. Auch wenn Discord das nachträgliche Aktualisieren
der Vorschau ablehnt, bleibt der gespeicherte Erfolg oder Fehler darüber abrufbar.
Unterbrochene Veröffentlichungen werden nach 40 Sekunden als unklar angezeigt;
in diesem Fall den Kanal prüfen, nicht automatisch erneut veröffentlichen.

REST-Aufrufe haben Zeitlimits. Nur das private, idempotente Status-PATCH wird bei
vorübergehenden Fehlern wiederholt. Der öffentliche Nachrichten-POST wird nie
 automatisch wiederholt. Logs enthalten Ereignis, Entwurfs-ID, Verarbeitungsschritt,
HTTP-Status und numerischen Discord-Fehlercode, keine Tokens oder Beitragsinhalte.

Die neue Embed-Darstellung zeigt Kategorie im Kopf, farbige Seitenlinie,
Beitragsinhalt, optionale Kurzbeschreibung, Titelbild und Veröffentlichungszeit.
Der Importer erkennt sowohl bisherige v1-Nachrichten als auch das neue v2-Format.

Deployment: `node scripts/build-news-worker.mjs` ausführen und den Inhalt von
`worker/dashboard-worker.mjs` im bestehenden Admin-/News-Worker veröffentlichen.
Keine neue Datenbank, Secrets oder Befehlsregistrierung erforderlich.
