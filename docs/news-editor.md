# Direkte News-Verwaltung und Bild-Upload

## Aktivieren

Die bisherigen Secrets und die vorhandene D1-Bindung `NEWS_DB` bleiben bestehen.
Es sind keine neue Datenbank, Migration, GitHub-Schreibrechte oder R2-Buckets nötig.

Im Cloudflare-Dashboard den bestehenden Admin-/News-Worker
`holy-sunset-4eb4velocity-admin-api` öffnen, Edit code wählen und den gesamten Code
durch `worker/dashboard-worker.mjs` ersetzen. Danach Deploy klicken.
NICHT den separaten BlueMap-Worker ersetzen.

Die Einzeldatei wird mit `node scripts/build-news-worker.mjs` aus den drei
Worker-Quelldateien erzeugt. Bei Nutzung von Wrangler wird weiterhin
`npx wrangler deploy --config worker/wrangler.toml` verwendet.

Der Frontend-Code ist mit dem älteren Worker kompatibel: `/news/overlay` mit 404
lässt den bisherigen JSON-Feed bestehen. Ohne neue Capability werden keine
direkten Bearbeitungs-/Löschbuttons eingeblendet und der Datei-Upload bleibt
deaktiviert. Die neuen Funktionen werden nach dem Worker-Deployment verfügbar.

## Beiträge und Discord

Der bestehende GitHub-Import behält Nachrichten bei, die aus Discord entfernt
wurden. Auf der Webseite kann ein angemeldeter Admin alle vorhandenen Beiträge
in der Verwaltung unter dem Formular bearbeiten oder per rotem X löschen.
Bearbeiten und Lösch-X stehen nebeneinander rechts in jeder Zeile. Im öffentlichen
Feed und auf der Detailseite gibt es keine Admin-Steuerbuttons. Jede Löschung erfordert Bestätigung.
Diese Aktionen ändern keine Discord-Nachrichten.

Das Frontend kombiniert den statischen Import mit `/news/overlay`: D1-Versionen
ersetzen JSON-Versionen mit derselben ID. Auch Entwürfe oder gelöschte Versionen
unterdrücken die alte JSON-Version. Öffentlich werden keine Entwurfstitel,
Inhalte, Bilder oder Admin-Daten ausgegeben, nur die erforderlichen IDs.
Nach Aktivierung führen API-Fehler zu einer Ladefehlermeldung, damit gelöschte
Beiträge nicht durch einen ungefilterten JSON-Fallback wieder auftauchen.

Website-Versionen werden durch `source_event_id='website'` vor späteren
Bot-Ereignissen geschützt. Löschen behält einen unsichtbaren D1-Eintrag als
Sperrvermerk, statt den Eintrag vollständig zu entfernen. Revisionsprüfungen
verhindern das Überschreiben zwischen mehreren Admin-Sitzungen.
Details, Übersicht und Startseiten-Vorschau nutzen dieselbe öffentliche Quelle.

## Bilder

Dateiauswahl: JPEG, PNG oder WebP, höchstens 10 MB / 40 Megapixel.
Der Browser zeigt einen festen 16:9-Ausschnitt mit Drag-Steuerung sowie Reglern
für Horizontal-/Vertikalposition und Grösse. Das ganze Bild wird standardmässig
eingepasst. Mit „Ganzes Bild“ lässt sich diese Ansicht wiederherstellen;
„Rahmen füllen“ füllt den 16:9-Rahmen und schneidet gegebenenfalls Ränder ab.
Verkleinern bis 10 % ist möglich; freie Flächen bleiben dunkelblau. Die Vorschau
im Formular ist höchstens 640 Pixel breit. Beim Speichern entsteht ein JPEG
mit 1600 × 900 Pixeln und maximal 750 KB. Die Bilddatei wird separat per
authentifiziertem POST an `/news/admin/image` hochgeladen und erst danach
der Beitrag gespeichert. Ein bereits hochgeladenes Bild wird beim erneuten
Speichern ohne Bildänderung nicht nochmals hochgeladen.

Der Worker prüft Authentifizierung, Uploadlänge, JPEG-Kennung und Abmessungen.
Bilder werden Base64-kodiert in der vorhandenen D1-Tabelle `news_state` abgelegt.
Das Limit hält auch den kodierten Wert unter den D1-Grössenlimits. Der öffentliche
Bild-Endpunkt braucht kein Admin-Token und liefert nur JPEG, mit `nosniff` und
einer unveränderlichen UUID-Adresse. Die tatsächlichen JPEG-Pixel werden im
Browserintegrationstest dekodiert. Der Worker hat keinen eigenen JPEG-Decoder.

Da Bilder dauerhaft erreichbar bleiben müssen, werden sie beim Verwerfen eines
Entwurfs oder beim Löschen eines Beitrags nicht automatisch gelöscht. Vorläufig
kann es dadurch unbenutzte Bilder geben; sie zählen zum D1-Speicherverbrauch.

## Prüfung

- `node tests/news-worker.test.mjs`
- `node tests/news-editor-worker.test.mjs`
- `node tests/news-editor-browser.cjs`
- `node tests/news-auth-errors.cjs`

Browserprüfungen verwenden eine lokale Worker-/SQLite-Simulation, einen echten
lokalen Bildausschnitt und mehrere Bildschirmgrössen. Produktive Zugangsdaten
werden nicht verwendet und keine Discord-Nachrichten verändert.

### Pages-Deployment und veraltete Verwaltung
Die vorhandenen Beiträge stehen nach Formular und Vorschau. Jede Zeile bietet
Bearbeiten und ein rotes Lösch-X; Löschen verlangt eine Bestätigung und hinterlegt
auch für statisch importierte Discord-Beiträge eine dauerhafte Website-Sperre.

Unter Repository → Settings → Pages → Build and deployment muss Source auf
**GitHub Actions** stehen. `sync-news.yml` veröffentlicht dann sowohl Änderungen
auf main als auch manuelle/geplante News-Abgleiche. Push-Läufe importieren keine
Discord-Nachrichten; manuelle/geplante Läufe behalten den bisherigen Import.
Die gemeinsame Concurrency-Gruppe serialisiert Veröffentlichungen.
Nicht gleichzeitig den eingebauten Branch-/Jekyll-Pages-Workflow verwenden:
sonst können zwei Deployments mit „in progress deployment“ kollidieren.

Bei einer noch alten Admin-Oberfläche die Seite nach abgeschlossenem Deployment
mit Strg+F5 neu laden. Die News-Ressourcen verwenden eine neue Cache-Version.
