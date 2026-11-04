# Galerie

Die Galerie nutzt dieselben VeloCity-Farben, das vorhandene Burgbanner und den
dunklen Seitenrahmen wie News und Serverkarte. Bildkarten haben eine 16:9-Vorschau,
einen Titel und eine Kategorie. Ein Klick auf die Bildkarte öffnet das Original.

Ein Bild öffnet einen fensterfüllenden nativen Dialog ohne Panelrand oder
Breitenbegrenzung. Das Original füllt den verfügbaren Platz mit `object-fit: contain`:
Es bleibt vollständig sichtbar und wird nicht verzerrt oder abgeschnitten.
Bei unterschiedlichen Seitenverhältnissen bleiben freie Flächen; auf dem Handy
bietet Querformat mehr Platz für die vorhandenen Landschaftsaufnahmen.

Bedienung: Pfeiltasten oder Pfeilbuttons, Wischen bei einfachem Touch, X und Escape.
Pinch-Zoom wird durch die Touch-Regeln nicht gesperrt; bei gezoomter Ansicht wird
kein Bildwechsel durch Wischen ausgelöst. Der native Dialog übernimmt Fokusfang
und Fokus-Rückgabe. Während der Bildansicht wird das Scrollen der Seite gesperrt.

Die Bildansicht nutzt die gesamte Fensterfläche ohne zusätzlichen Vollbildbutton.
Zum Schliessen dienen X oder Escape; die Pfeile wechseln das Bild.

Inhalte bleiben in `assets/data/gallery.json`, Bilder und Thumbnails unter
`assets/img/gallery/`. Neue Dateien: `assets/css/gallery.css` und
`tests/gallery-fullscreen.cjs`. Aktualisiert: `galerie.html`, `assets/js/gallery.js`.

Lokale Prüfung mit echten Galerie-Bildern:
`node tests/gallery-fullscreen.cjs` prüft sechs Bildschirmgrössen inklusive
Handy-Querformat, Vorschaubild-Seitenverhältnis, fensterfüllende Bildfläche,
Navigation, Touch-Geste, entfernte Vergrösserungssymbole, Schliessen, Fokus-Rückgabe,
Scroll-Freigabe und Bildfehler. Die Touch-Prüfung nutzt simulierte Events;
physische iOS-/Android-Geräte wurden nicht getestet.
