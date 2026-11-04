# Serverkarte / BlueMap

Die statische GitHub-Pages-Seite ist unter `serverkarte.html` erreichbar.
Alle fünf öffentlichen Hauptseiten verlinken sie in derselben Navigation.
Das Banner verwendet das bereits vorhandene VeloCity-Burgbild.

## Konfiguration

In `assets/js/site-config.js`:

- `blueMapUrl`: öffentlicher Link für den neuen Tab; HTTP oder HTTPS.
- `blueMapEmbedUrl`: HTTPS-Adresse für das iframe; mit `null` bleibt die
  externe Ansicht aktiv. Falls beide Adressen gleich sind, beide auf dieselbe
  HTTPS-Adresse setzen. Der externe Button verwendet ersatzweise die Embed-URL.

Aktuell ist die mitgeteilte Karte nur unter HTTP verfügbar:
`http://134.255.208.82:13003/#world:0:0:0:1500:0:0:0:0:perspective`.
Der Tracking-Parameter wurde entfernt, die Kartenposition bleibt erhalten.
GitHub Pages nutzt HTTPS. Eine HTTP-Einbettung würde deshalb als Mixed Content
blockiert. Aktuell wird stattdessen eine Hinweisfläche mit externem Link gezeigt.
Es wird kein Live-/Online-Status für diese Hinweisfläche angezeigt.

## HTTPS-Einbettung aktivieren

BlueMap zuerst über eine öffentliche HTTPS-Adresse mit gültigem Zertifikat
bereitstellen, zum Beispiel über einen Reverse Proxy. Danach die Embed-URL
konfigurieren. Der Kartenserver muss die Einbettung durch
`https://microminer.github.io` erlauben: kein widersprechendes
`X-Frame-Options: DENY/SAMEORIGIN` oder CSP `frame-ancestors`.
CORS-Freigaben allein erlauben keine iframe-Einbettung.
Beim Konfigurationswechsel den Cache-Parameter des Konfigurationsskripts in
`serverkarte.html` erhöhen.

Die Karte nutzt die nativen BlueMap-Steuerelemente; der zusätzliche
Vollbildbutton nutzt die Browser-Fullscreen-API. Das iframe lädt verzögert.
Der Link in einen neuen Tab bleibt auch bei einer blockierten Einbettung nutzbar.
Cross-Origin-iframe-Load-Events können Erreichbarkeit und Header-Blockaden
nicht zuverlässig bestätigen. Das Label „Live“ kennzeichnet eine konfigurierte
Einbettung und ist kein Verfügbarkeitsmonitor.

## Prüfung

`node tests/serverkarte-browser.cjs` prüft sechs Bildschirmgrössen,
Navigation auf allen Hauptseiten, HTTP-Fallback, sichere URL-Protokolle,
fehlende Konfiguration, eine simulierte HTTPS-Karte und den Fehlerfallback.
Der reale Kartenhost ist aus der Ausführungsumgebung nicht erreichbar
(Netzwerkfreigabe fehlt); seine Erreichbarkeit und Sicherheitsheader
wurden daher nicht live bestätigt.
