# Kompaktere Desktopdarstellung

Ab 1100 CSS-Pixeln Fensterbreite verwendet die Webseite eine Skalierung von 0.9,
ähnlich einer Ansicht mit 90 % Browserzoom. Der Browser selbst bleibt auf der
vom Nutzer gewählten Zoomstufe. Kleinere Fenster behalten die Skalierung 1,
damit Schrift und Touch-Bedienelemente lesbar bleiben.

Die Einstellung liegt zentral in `assets/css/styles.css` (`--site-scale`).
Sie wird nur aktiviert, wenn der Browser CSS `zoom` unterstützt. Die bestehenden
responsiven Breakpoints bleiben erhalten. Ein zusätzlicher manueller Browserzoom
wirkt weiterhin auf die Ansicht; zum Vergleichen den Browser auf 100 % stellen.

Viewportfüllende Höhen der Galerie und die Seiten-Mindesthöhe werden entsprechend
korrigiert. Der Taschenrechner berücksichtigt die Skalierung beim Positionieren,
Verschieben und Begrenzen auf das sichtbare Fenster. Neue frei positionierbare
Elemente müssen ebenfalls zwischen Bildschirmkoordinaten und skalierten
CSS-Koordinaten unterscheiden.

Prüfung: `node tests/desktop-density.cjs` prüft alle fünf öffentlichen Seiten auf
sieben Fensterbreiten, unveränderte mobile Skalierung, Navigation und Überläufe,
Itemtausch, Rechner per Maus/Tastatur, Galerie-Vollbild und simulierte BlueMap.
Zusätzlich wurde die Galerie-Funktionsprüfung ausgeführt. Die Browserprüfungen
arbeiten lokal ohne produktive Zugangsdaten oder API-Schreibzugriffe.
