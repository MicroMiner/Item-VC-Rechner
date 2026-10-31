# VeloCity – GitHub Pages mit geschützter Preisverwaltung

## Was das Paket macht

- **GitHub Pages** zeigt den öffentlichen Umrechner (`index.html`) und die veröffentlichte Preisliste.
- Der Browser lädt aktuelle Preise über einen **Cloudflare Worker**. Wenn die API-Adresse noch nicht konfiguriert ist, liest er die beigefügte JSON-Datei direkt, aber das Bearbeiten bleibt gesperrt.
- Ebene 2 ist bis zum Passwort-Check unscharf. Die Prüfung erfolgt **auf dem Worker**, nicht im HTML.
- Der Worker schreibt Änderungen via **GitHub Contents API** zurück in dieselbe JSON-Datei. Kauf- und Verkaufspreise stehen getrennt in `buy` und `sell`; die ursprünglichen Werte bleiben in `defaultBuy` und `defaultSell` erhalten.
- Die Preise gelten für alle Besucher. Nach Änderung lädt jeder Besucher die neue Fassung beim nächsten Seitenaufruf.

## 1. GitHub Pages einrichten

1. Erstelle ein **öffentliches GitHub-Repository**, z. B. `velocity-rechner`.
2. Lade aus diesem Paket `index.html` und `config.js` sowie den gesamten Ordner `preislisten/` (inklusive `index.json`) ins Stammverzeichnis des Repositories hoch. Die Dateien aus `worker/` brauchst du NICHT als öffentliche Website-Dateien.
3. Auf GitHub **Settings → Pages → Build and deployment → Deploy from a branch**: `main` und `/ (root)` wählen.
4. Deine Website lautet z. B. `https://DEIN_GITHUB_NAME.github.io/velocity-rechner/`.

## 2. GitHub-Token (nur für den Worker) erstellen

Erstelle in GitHub unter **Settings → Developer settings → Personal access tokens → Fine-grained tokens** einen Token, nur für dieses Repository, mit **Repository permission: Contents – Read and write**. Bewahre ihn geheim auf. Gib ihn NIEMALS in `index.html`, `config.js`, in GitHub-Commits oder im Browser ein.

## 3. Cloudflare Worker einrichten

1. Kostenloses Cloudflare-Konto eröffnen und einen Worker anlegen (Dashboard → Workers & Pages). Den Inhalt von `worker/worker.js` als Worker-Code verwenden. Alternativ mit Wrangler aus dem Ordner `worker` deployen: `npx wrangler deploy`.
2. In `worker/wrangler.toml` (oder im Cloudflare-Dashboard unter Settings → Variables) konfigurieren:
   - `GITHUB_OWNER`: GitHub-Benutzername
   - `GITHUB_REPO`: Repositoryname
   - `GITHUB_BRANCH`: `main`
   - `SITE_ORIGIN`: **exakt** `https://DEIN_GITHUB_NAME.github.io` (ohne Pfad / ohne abschliessenden Slash)
3. In Cloudflare **Settings → Variables and Secrets** zwei **Secrets** hinzufügen (nicht einfache öffentliche Variablen):
   - `ADMIN_PASSWORD`: ein langes, einzigartiges Passwort (am besten zufällig, mindestens 16 Zeichen)
   - `GITHUB_TOKEN`: der GitHub-Token aus Schritt 2
   Mit Wrangler: `npx wrangler secret put ADMIN_PASSWORD` und `npx wrangler secret put GITHUB_TOKEN`.
4. Worker deployen, seine `https://...workers.dev`-Adresse kopieren und in `config.js` bei `window.VELOCITY_API_URL` eintragen; `config.js` erneut auf GitHub hochladen.
5. Website laden, nach unten scrollen, Passwort eingeben und Änderungen ausprobieren.

## Hinweise zur Sicherheit

- **Nur Unschärfe wäre KEIN Schutz.** Der eigentliche Schreibschutz kommt von der Passwortprüfung im Worker und dem privaten GitHub-Token.
- Das Admin-Passwort wird nicht im Browser gespeichert. Nach erfolgreicher Anmeldung speichert die App für maximal 30 Minuten ein vom Worker signiertes Sitzungstoken in localStorage und prüft es nach jedem Neuladen erneut beim Worker. „Verwaltung sperren“ entfernt die Anmeldung auf diesem Gerät; nach Ablauf wird die Verwaltung automatisch gesperrt. Ein Wechsel des Worker-Admin-Passworts macht bestehende Tokens ungültig. Das Token ist ein temporärer Zugangsschlüssel; auf gemeinsam genutzten Geräten nach der Arbeit sperren. Die lokale Abmeldung widerruft keine zuvor kopierten Tokens; diese gelten bis zum Ablauf oder Passwortwechsel.
- Die JSON ist absichtlich öffentlich: andere Spieler können sie lesen und kopieren, aber nicht ohne gültige Server-Anmeldung verändern.
- Jeder, der das gemeinsame Passwort kennt, kann alle Preise verändern. Verwende ein starkes Passwort und ändere es bei Bedarf in Cloudflare. Für individuelle Accounts, Audit-Protokolle oder Sperrung einzelner Personen wären getrennte Login-Konten nötig.
- Bei mehreren gleichzeitigen Bearbeitern schützt die GitHub-Dateiversion (`sha`) vor unbemerktem Überschreiben. Im Konflikt wird die aktuelle Liste neu geladen.
- Für öffentliche, stark frequentierte Webseiten empfehlen sich zusätzlich Cloudflare Rate Limiting / Turnstile, damit Passwörter nicht unbegrenzt ausprobiert werden können.
- Bei jeder Änderung entsteht ein Commit im GitHub-Repository. Das Ergebnis ist normalerweise über GitHub Pages nach dem nächsten Deployment sichtbar; der Worker liefert neue Daten unmittelbar nach dem GitHub-Commit.
- Wenn du eine eigene Domain verwendest, muss `SITE_ORIGIN` genau auf diese Domain geändert werden.


## Mehrere Preislisten

Die Web-App bietet im gesperrten Admin-Bereich bei „Liste laden“ eine kompakte Listenauswahl. Nach dem Login eine Liste auswählen und mit „Liste laden“ übernehmen; ohne Login wird die erste verfügbare Liste automatisch für den öffentlichen Umrechner geladen. JSON-Preislisten liegen direkt in `preislisten/`. Der Worker liefert mit `GET /lists` die Dateien dieses Ordners aus dem konfigurierten GitHub-Branch. Neue Dateien erscheinen nach dem Neuladen der Web-App automatisch. Zulässig sind Dateinamen wie `VeloCoin_Preisliste.json` oder `shop-2.json` (Buchstaben ohne Umlaute, Ziffern, `_`, `-`, `.`; erster Buchstabe oder Ziffer). Unterordner und `index.json` sind keine auswählbaren Preislisten.

`GET /prices?file=shop-2.json` lädt die gewählte Liste; `PUT /prices?file=shop-2.json` speichert sie mit Passwort und Versions-SHA. Änderungen wirken ausschliesslich auf die gewählte Liste. Beim Listenwechsel wartet die App ausstehende Speichervorgänge ab. Schlägt das Laden fehl, bleibt die bisherige Liste aktiv. Das Erstellen und Hochladen neuer Listen erfolgt im Repository, nicht im Browser.

Ohne Worker (`window.VELOCITY_API_URL = ''`) liest die statische Website die Auswahl aus `preislisten/index.json`. Hier muss jede zusätzliche Liste eingetragen werden, etwa:

```json
{"lists":[{"file":"VeloCoin_Preisliste.json","name":"Standard"},{"file":"shop-2.json","name":"Shop 2"}]}
```

Statischer Betrieb erlaubt Lesen und Umrechnen; Online-Bearbeitung benötigt den Worker. GitHub Pages bietet keine automatische Ordnerauflistung.

Jede Preisliste verwendet `format: "VeloCoin-Preisliste"`, `version: 2`, `items` und `customItems`. Preise sind endliche Zahlen grösser als null; zusätzliche Nachkommastellen bleiben erhalten. Alte `standardPrice`/`price`-Einträge werden weiterhin gelesen. Fehlt bei einem alten eigenen Item der Buy-Preis, wird dessen Sell-Preis übernommen. Vorhandene Buy-/Sell-Preise werden nicht gerundet.

## Lokal prüfen

Es gibt keinen Build-Schritt und keine npm-Projektabhängigkeiten. Die Worker-Tests mit simuliertem GitHub-Zugriff benötigen Node.js 22 oder neuer:

```sh
node --test tests/worker.test.mjs
```

Der Browser-Test benötigt Playwright und Chromium (in der Cloud-Umgebung vorhanden). Er startet seinen eigenen lokalen Testserver, prüft die mitgelieferte Liste und simuliert für Schreibtests die API; es erfolgen keine produktiven Schreibzugriffe:

```sh
node tests/browser.cjs
```

Zum manuellen lokalen Betrieb kann ein statischer HTTP-Server verwendet werden. Für den Betrieb ohne Worker muss `config.js` lokal bzw. per Serverüberschreibung eine leere API-Adresse liefern. Der Cloud-Helfer `/workspace/velocity-dev/serve.py` stellt diese Überschreibung bereit, ohne die Datei zu ändern.

Website-Dateien, Ordner und Worker müssen für die neue Listen-API gemeinsam veröffentlicht werden. Ein alter Worker unterstützt die Listenauswahl noch nicht. Dieses Repository führt kein automatisches Deployment aus.


## Wertvergleich und Shop-Umrechnung

Standardmässig vergleicht der Rechner den Verkaufswert beider Items: `Menge × Sell(A) / Sell(B)`. Dieser Gegenwert darf Bruchteile enthalten. Der Schalter „Shop-Umrechnung“ berechnet stattdessen `floor(Menge × Sell(A) / Buy(B))`: Die angegebene ganze Menge wird verkauft, davon werden so viele ganze Ziel-Items wie möglich gekauft. Nicht ausgegebene VC werden als Rest angezeigt. Die Menge wird ausschliesslich beim Ausgangs-Item eingegeben; die Zielmenge erscheint nur im Ergebnis. Der Tauschbutton vertauscht nur die beiden Items und behält die eingegebene Ausgangsmenge bei. „Zurücksetzen“ aktiviert wieder den Sell-/Sell-Vergleich.


## Neue Preisbasis aus shops.csv

Die Preisliste wurde anhand der bereitgestellten Shop-CSV und materialbasierter Rezepte neu berechnet. Alle Preise liegen auf Cent-Beträgen ab 0.01 VC; Buy ist auf 500’000 VC begrenzt, bei einem Kontolimit von 10 Mio. VC. CSV-Referenzen behalten unterschiedliche Handelsspannen; Aufschläge werden nicht über Herstellungsketten mehrfach multipliziert. Varianten von Tränken, Effektpfeilen und verzauberten Büchern sind getrennte Einträge.

Die vollständigen Regeln, gezielten CSV-Korrekturen und Schätzungen stehen in [pricing/README.md](pricing/README.md). Der [Änderungsbericht](pricing/price-changes.csv) enthält alle Vorher-/Nachher-Preise. Leere CSV-Verkaufspreise und Einträge ohne verifizierte Serverrezepte sind ausdrücklich als Vorschläge zu behandeln. Die Quelldatei bleibt unverändert.


Die Symboltaste im Ergebnis übernimmt das Ziel-Item und seine berechnete Menge als neuen Ausgang. Das Ziel-Item bleibt ausgewählt. Unter der Ausgangsmenge addieren die Schnellwahltasten 1, 3, 5, 10, 15, 20, 30, 50 und 100 ihren jeweiligen Wert zur Eingabe. Die Löschtaste leert das Mengenfeld; eine leere Eingabe wird als null berechnet. Die direkte Mengeneingabe bleibt möglich.
