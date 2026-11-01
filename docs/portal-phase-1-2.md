# VeloCity Server-Portal – Phase 1 & 2

Die vier Seiten verwenden das bestehende Design, Logo, Favicon und Impressum. Die Erweiterung ist statisch und für `https://microminer.github.io/VeloCity/` ausgelegt. Kein Build, Framework, Bot, neuer Worker oder externer Dienst ist erforderlich. Die Umsetzung wurde vor dem Upload lokal geprüft.

## Dateien und Abgrenzung

Neu: `neuigkeiten.html`, `galerie.html`, `assets/css/portal.css`, `assets/js/site-config.js`, `assets/js/home.js`, `assets/js/news.js`, `assets/js/gallery.js`, `assets/js/portal-data.js`, `assets/data/updates.json`, `assets/data/gallery.json`, sechs WebP-Vorschauen und `tests/portal.cjs`.

Angepasst: `index.html` (Serverinfos, Begrüssung, Vorschau), `umrechner.html` (ausschliesslich zwei Navigationslinks), `assets/css/styles.css` (ausschliesslich responsive Vierseiten-Navigation), `tests/site.cjs` und `README.md`.

`assets/js/app.js`, `assets/js/calculator.js`, `assets/js/ui.js`, `config.js`, sämtliche Preislisten und der gesamte Cloudflare-Worker sind unverändert. Die Portalseiten laden keine Economy-API, Admin-Anmeldung oder Preislisten. Der Umrechner lädt weder das Portal-Stylesheet noch dessen neue Skripte.

## Zentrale Serverinformationen

`assets/js/site-config.js` ist die öffentliche Quelle für Name, Edition, Version und Adresse. Aktuell: Minecraft Java, Version `1.26.3`, `serverAddress: null`, `discordInvite: null`. Keine Secrets eintragen.

Solange die Adresse unbekannt bleibt, erscheint „Serveradresse folgt“ und der Kopierbutton ist deaktiviert. Sobald eine tatsächliche Domain/IP konfiguriert wird, verwendet der Button die Clipboard API und meldet kurz „IP kopiert“. Bei fehlender Unterstützung oder verweigerter Berechtigung wird die schreibgeschützte Adresse fokussiert und markiert; eine Meldung erklärt das manuelle Kopieren. Es gibt keinen Discord-Einladungsbutton.

## Neuigkeiten pflegen und Phase 3 vorbereiten

`assets/data/updates.json` enthält Version 1, `updatedAt: null` und eine leere `updates`-Liste. Es wurden keine News erfunden. Startseite und News-Seite haben eigene verständliche Leer- und Fehlerzustände. Die Vorschau zeigt höchstens den neuesten Beitrag, nur einen kurzen Textauszug und den Link zur News-Seite.

Ein Eintrag verwendet `id`, `source`, `sourceId`, `category`, `title`, `content`, `publishedAt`, `image` und `url`. `image` und `url` dürfen `null` sein. `publishedAt` ist ein gültiger ISO-Zeitstempel mit Zeitzone; die Darstellung erfolgt in Europe/Zurich. Kategorien: Ankündigung, Update, Changelog, Wartung. Die Anzeige sortiert nach Veröffentlichungszeit absteigend und überspringt ungültige Einträge sowie doppelte IDs.

Für manuelle Beiträge: `source: "manual"`, üblicherweise `sourceId: null`. Für spätere Discord-Importe: `source: "discord"` und die Nachrichten-ID als **String** in `sourceId` (damit keine numerische Genauigkeit verloren geht). Ein späterer Importer soll eine stabile eindeutige `id` pro Nachricht behalten und anhand `source`/`sourceId` vorhandene Datensätze aktualisieren statt doppelt anzulegen. `updatedAt` auf Dokumentebene ist für den letzten Datenstand vorgesehen. Es gibt in Phase 1/2 noch keinen Importer oder Synchronisationsworkflow.

Alle JSON-Texte werden als Text eingesetzt. Links und Bilder erlauben ausschliesslich HTTP(S); JavaScript-/Data-URLs werden verworfen. Fehlende optionale Bilder beeinträchtigen den Nachrichtentext nicht. Galerie-Ressourcen müssen zusätzlich im lokalen Galerieverzeichnis liegen.

## Bilder verschoben, Originale erhalten

Die vorhandenen Dateien lagen tatsächlich in **`assets/images/presentation/`**, nicht im im Auftrag genannten `assets/img/presentation/`. Alle sechs wurden nach **`assets/img/gallery/`** verschoben:

- `Deko Shop.png`
- `Eingang.png`
- `Kupfer Gollem.png`
- `Shop.png`
- `Spawn übersicht.png`
- `Spawn.png`

Alle Originale sind PNG, 1920 × 1017 px, unverändert erhalten; ihre SHA-256-Prüfsummen wurden gegen den bisherigen Git-Stand verglichen. Es gab keine bestehenden Seitenverweise auf das alte Verzeichnis. Das alte, nach dem Verschieben leere Verzeichnis ist entfernt. Logo und Favicon bleiben in `assets/images/`.

Die Originale sind jeweils etwa 3–4,8 MB gross. Separate WebP-Vorschauen liegen unter `assets/img/gallery/thumbs/`, maximal 800 px breit, jeweils etwa 48–88 KB. Vorschauen werden auf 16:9 zugeschnitten und nicht verzerrt. Die grosse Ansicht lädt das unveränderte Original und erhält dessen Seitenverhältnis. Breiten-/Höhenattribute reservieren den Bildplatz; Bilder ausserhalb des ersten sichtbaren Bereichs werden nachgeladen.

`assets/data/gallery.json` enthält die sechs echten Pfade mit neutralen Titeln und Alttexten. Alle sind bewusst der Kategorie Sonstiges zugeordnet; Spawn, Bauprojekte, Landschaften und Community werden als weitere Kategorien unterstützt. Titel/Beschreibungen lassen sich dort später sachlich ergänzen, ohne neue HTML-Dateien zu bearbeiten.

Die Galerie zeigt auf Desktop drei, auf Tablet zwei und auf schmalen Smartphones eine Spalte. Die native Dialogansicht bietet X, Escape, Klick ausserhalb, Vor/Zurück, Links-/Rechtspfeiltasten und Fokuswiederherstellung. Ladefehler werden verständlich angezeigt.

## Tests

Erfolgreich ausgeführt:

- `node tests/site.cjs`: alle vier Seiten, gemeinsame Navigation/Assets/Impressum, Repo-Unterpfad, Favicon, keine Economy-Abfragen auf der Startseite und responsive Geometrie mit reservierter Scrollleistenbreite.
- `node tests/portal.cjs`: alle vier aktiven Navigationszustände und Logo-/Seitenlinks; Serverversion aus Konfiguration, unbekannte Adresse, Kopiererfolg und manueller Fallback bei fehlender/verweigerter Clipboard API; leere/fehlerhafte News, Sortierung, Datumsanzeige, doppelte/ungültige Einträge, HTML-Injektionsschutz, sichere Links, maximal ein Vorschau-Beitrag und sehr lange Texte. Alle sechs echten Vorschauen und Originale werden decodiert; Lightbox, Fokus, Schliessen, Pfeiltasten und Galerie-Spalten werden geprüft. Tests verwenden fiktive News/Adressen nur im Browser-Mock, nicht in produktiven Dateien.
- `node tests/browser.cjs`, `node tests/header.cjs`, `node tests/quality.cjs`: bestehende Umrechner-, Mini-Rechner-, Schnellwahl-, Buy-/Sell-, Shop-, Admin-, Sitzungs-, Speicher-/Fehler-, Zeitstempel- und Exportfunktionen.
- `node --test tests/worker.test.mjs`: bestehende Backend-Regressionstests, drei erfolgreiche Tests.
- Bildschirmbreiten: 320, 375, 430, 768, 1024, 1440 und 1920 px. Desktop- und Mobil-Screenshots visuell geprüft. Keine unbehandelten Browserfehler, keine fehlenden Galerie-Ressourcen oder alten `presentation`-Pfade.
- JavaScript-Syntax und `git diff --check`.

Keine produktiven Admin-Schreibzugriffe; die Online-Speicherprüfungen verwenden lokale Test-Doubles. Getestet mit Chromium und Touch-Emulation, nicht mit allen realen Browsern/Geräten. Der aus der früheren Qualitätsprüfung bekannte Python-Preistest-Befund ist in `quality-review.md` dokumentiert; Preislisten und Preiswerkzeuge werden hier nicht verändert.

Offen sind ausschliesslich die tatsächliche Serveradresse, echte zukünftige Neuigkeiten und die ausdrücklich auf Phase 3 verschobene Discord-Automatisierung. In Cloudflare ist für diese statische Erweiterung keine Änderung nötig.
