# VeloCity – Qualitätsprüfung vom 1. November 2026

Grundlage: `AGENTS.md`, bestehendes Design und beide öffentlichen Seiten. Kein Redesign; keine Änderungen an Preisen, JSON-Format, Berechnung, Worker, API-Adresse oder Authentifizierungsverfahren. Die Prüfungen wurden vor dem Upload lokal ausgeführt.

## Behobene Probleme

- Die goldenen Trennlinien verwendeten `100vw`, das bei sichtbaren Scrollleisten breiter als der nutzbare Seitenbereich sein kann. Globale Überlauf-Unterdrückung entfernt. Die Linien verwenden jetzt die tatsächliche Containerbreite und denselben Seitenabstand wie der Inhalt. Der gemeinsame Wert `--site-gutter` sitzt auf `.site-page` und wird an den bestehenden Breakpoints angepasst. Für Browser ohne Container-Einheiten bleibt die Linie innerhalb der Inhaltsbreite.
- Bei fehlgeschlagenem Erstladen verursachte „Zurücksetzen“ einen Zugriff auf ein nicht vorhandenes Item. Der Reset bleibt ohne geladene Daten jetzt folgenlos, die Ladefehlermeldung erhalten.
- Nach fehlgeschlagener Speicherung überschrieb das erfolgreiche Neuladen der Online-Liste die Fehlermeldung. Die Oberfläche zeigt jetzt ausdrücklich, dass die Änderung nicht gespeichert wurde und die Online-Werte wiederhergestellt wurden. Der bestätigte Änderungszeitstempel bleibt unverändert.
- Grid-/Flex-Kinder dürfen auf schmalen Ansichten schrumpfen; Statusmeldungen dürfen umbrechen. Checkbox und Löschbuttons behalten ihre Breite.

## Optimierungen und Barrierefreiheit

- Zahlen- und Datumsformatierer werden wiederverwendet statt für jedes Suchergebnis neu erzeugt. Gebietsschema, Genauigkeit und Rundungsregeln bleiben gleich.
- Der Zähler geänderter Preise prüft jeden Eintrag direkt, statt für jeden Eintrag die komplette Liste neu aufzubauen und zu durchsuchen.
- Nur nachweislich ungenutzte Datei-Upload-Styles, alte Ergebnis-Unterzeilen und eine vollständig überschriebene `.wrap`-Definition entfernt. Bestehende responsive Kaskade und Legacy-Farbvariablen erhalten; keine `!important`-Regeln nötig.
- Vorhandenes VC-Favicon mit unverändertem Motiv auf 48 × 48 px verkleinert: 1'580'482 → 3'913 Bytes (rund 99,8 % weniger). Auf beiden Seiten explizit als PNG dieser Grösse eingebunden; keine Bilder generiert.
- Rechneraktionen und individuelle Löschbuttons haben verständliche Screenreader-Namen. Preisüberschriften sind keine unzugeordneten Formularlabels mehr; Preisgruppen sind benannt. Lade-/Speichermeldungen werden als Status angekündigt. Selects haben einen sichtbaren Tastaturfokus.

## Veränderte Dateien

- `index.html`, `umrechner.html`: Favicon-Angaben und semantische Beschriftungen.
- `assets/css/styles.css`: tatsächliche Überlaufursache, schmale Inhalte, Fokus und sichere Bereinigung.
- `assets/js/app.js`: Formatter-Wiederverwendung, linearer Änderungszähler, Erhalt von Speicherfehlern, Reset vor Datenladung und benannte Löschbuttons.
- `assets/images/favicon.png`: resampeltes bestehendes Motiv.
- `tests/site.cjs`, `tests/browser.cjs`, `tests/header.cjs`, `tests/quality.cjs`: erweiterte Prüfungen und deterministisches Warten auf die bereits vorhandene Disclosure-Animation; durch die schnellere Initialisierung war sie beim Daten-Ladesignal noch nicht immer beendet.
- `README.md`, dieser Bericht: Testanleitung und Befunde.

## Erfolgreiche Tests

- `node tests/site.cjs`: Navigation, gemeinsame Assets, Favicon tatsächlich geladen und decodiert, Impressum, schlanke Startseite ohne Preis-/Admin-Abfragen, GitHub-Pages-Unterpfad und Layout mit reservierter Scrollleistenbreite.
- `node tests/quality.cjs`: 320, 375, 430, 768, 1024, 1440 und 1920 px; ausgeklappte/gesperrte sowie entsperrte Verwaltung, lange zulässige Itemnamen, grosse Zahlen, Suchlisten, Dialoge, Formularbeschriftungen, Standardpreise wiederherstellen, eigene Items hinzufügen/löschen, Export, Sperren und Reset nach fehlgeschlagenem Erstladen.
- `node tests/browser.cjs`: Live-Suche, Pfeiltasten/Enter/Escape/Tab, Vergleich Sell/Sell, Shop Sell/Buy, Bruchteile, Ganzzahlrundung und Null-Ergebnisse, Schnellwahl, Tauschen, Ergebnisübernahme, Kopieren, Reset, Taschenrechner, Online-Preisänderung, Listenwechsel, Fehler-Rollback, Sitzungswiederherstellung, Logout/Ablauf und Touch-Bedienung.
- `node tests/header.cjs`: Integration mit tatsächlichem Worker-Code und simuliertem GitHub-Speicher; Zeitstempel, Export, fehlgeschlagene Speicher-/Ladevorgänge, Wiederherstellung, dynamischer Status und Geometrie. Speicherfehler bleiben nach Wiederherstellung sichtbar.
- `node --test tests/worker.test.mjs`: drei erfolgreiche Backend-Tests für Dateiauswahl, Schreibschutz, signierte Sitzungen, Manipulationsschutz, Ablauf und serverseitige Zeitstempel.
- Browserkonsolen ohne unbehandelte Fehler; keine fehlenden Assets. Erwartete, absichtlich simulierte HTTP-Fehler werden von den Tests geprüft. Screenshots von Desktop und Mobilansicht visuell kontrolliert.
- `git diff --check` und JavaScript-Syntaxprüfung.

Alle zwanzig im Auftrag genannten Bedienfunktionen sind damit automatisiert abgedeckt. Online-Schreibaktionen erfolgen ausschliesslich in lokalen Test-Doubles, nicht gegen die produktive Preisliste.

## Sicherheit und verbleibende Einschränkungen

Frontend und Worker auf offensichtliche Schwachstellen geprüft: Itemtexte werden als Text eingesetzt, der Mini-Rechner verwendet kein `eval`; im Frontend liegen keine Passwort-/GitHub-Secrets. Im Browser wird nur das zeitlich begrenzte Sitzungstoken gespeichert. Der Worker prüft Schreibautorisierung, Origin, signierte Sitzung, JSON und GitHub-Dateiversion. Keine zwingende Änderung des Authentifizierungsverfahrens festgestellt und kein neues Sicherheitsmodell eingeführt.

`python -m unittest discover -s tests -p 'test_*.py'`: 11 von 12 Prüfungen bestehen. Der schon vor diesem Auftrag vorhandene Test `test_variants_do_not_overwrite_each_other_and_assumptions_are_visible` erwartet ein Custom-Item „Enderperle“, das in der aktuellen Preisliste fehlt (`StopIteration`). Preise und Test-Erwartung wurden nicht zum Verbergen dieses Altbefunds verändert.

Automatisiert getestet wurde Chromium, inklusive Touch-Emulation. Keine Aussage über manuelle Tests mit echten Screenreadern, Safari/Firefox oder physischen Mobilgeräten. Tastatur, ARIA-Namen und Fokusverhalten wurden geprüft; kein vollständiges WCAG-Audit. Cloudflare und produktive GitHub-Schreibzugriffe wurden nicht ausgeführt.
