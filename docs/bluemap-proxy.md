# Separater BlueMap-HTTPS-Proxy

Dieser Worker gehört NICHT in den bestehenden Admin-/News-Worker.
Er benötigt keine Secrets, Datenbank oder zusätzlichen Bindings.

1. Cloudflare → Workers & Pages → Create application → Worker erstellen.
2. Name: `velocity-bluemap-proxy`. Einen einfachen Hello-World-Worker veröffentlichen.
3. Edit code: den gesamten Standardcode durch `bluemap-worker/worker.mjs` ersetzen.
4. Deploy. Die angezeigte HTTPS-Adresse im Browser öffnen.
5. Prüfen: Karte erscheint, Zoomen/Drehen funktionieren, Kartenteile und Texturen
   laden. Die URL mit `#world:0:0:0:1500:0:0:0:0:perspective` zusätzlich testen.
6. Erst nach erfolgreichem Test die tatsächliche Worker-Adresse als
   `blueMapEmbedUrl` in `assets/js/site-config.js` hinterlegen und den
   Cache-Parameter des Konfigurationsskripts in `serverkarte.html` erhöhen.
   Der externe Link kann bis dahin auf dem funktionierenden Nitrado-Link bleiben.

Alternativ mit authentifiziertem Wrangler:
`npx wrangler deploy --config bluemap-worker/wrangler.toml`.

Der Upstream ist fest auf `http://bluemap-origin.microminer.ch:13003` beschränkt. Nur GET/HEAD,
keine Weitergabe von Cookies oder Authorization, keine beliebigen Proxy-Ziele.
Relative Dateien, Abfragen, binäre Kartenkacheln, Komprimierung und Range-Requests
werden durchgereicht. Weiterleitungen bleiben auf derselben Nitrado-Adresse
und werden auf die HTTPS-Worker-Adresse umgeschrieben.

Das ist ein Testkandidat, kein bereits bestätigter produktiver HTTPS-Endpunkt:
Die Ausführungsumgebung hat weder Cloudflare-Zugang noch Netzwerkfreigabe zum
Nitrado-Host. Ob Cloudflare den nicht standardmässigen Port 13003 und die
IP-Adresse erreicht, muss nach Deployment geprüft werden. Fehler von Cloudflare
oder Nitrado werden nicht als Erfolg ausgegeben. 502 mit Port-Hinweis bedeutet,
dass der Upstream-Fetch fehlgeschlagen ist.

BlueMap verwendet üblicherweise relative Assets. Falls eure Installation feste
HTTP-Adressen in Einstellungen oder Dateien enthält, können Browser diese als
Mixed Content blockieren. Solche URLs müssen dann gezielt angepasst werden;
der Proxy verändert keine beliebigen JSON-/JavaScript-/Binärinhalte.
Zusätzliche WebSocket-Integrationen sind nicht enthalten.

Browser → Cloudflare ist HTTPS, Cloudflare → Nitrado bleibt HTTP.
Der Proxy macht eine bereits öffentliche Karte einbettbar und ist kein Schutz
für vertrauliche Daten. Pro Kartendatei entsteht ein Worker-Aufruf; Aufrufe und
Tariflimits im Dashboard beobachten. Während des Tests wird nicht gecacht,
damit Änderungen an Karte/Spielerpositionen nicht durch alte Daten verdeckt werden.
Die öffentlichen HTML-Antworten erlauben Einbettung nur durch dieselbe
Worker-Origin und `https://microminer.github.io`.

Lokale Prüfung: `node --test tests/bluemap-proxy.test.mjs` (simulierte Antworten,
keine Behauptung über reale Nitrado-/Cloudflare-Erreichbarkeit).
