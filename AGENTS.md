# VeloCity — Codex-Projektanweisungen

## Zweck und Design-Haltepunkt
Diese Datei ist die verbindliche Arbeitsgrundlage für Änderungen an der VeloCity-Webseite. Referenz ist die vorhandene **`umrechner.html`** und vor allem **`assets/css/styles.css`** auf dem jeweils aktuellen Branch. Diese Anweisungen dokumentieren das Design; sie ersetzen NICHT die tatsächlich vorhandenen CSS-Regeln.

### Zentrale Regel
**Die Webseite soll wie ein zusammengehörendes Produkt wirken.** Keine eigenständig erfundenen Themes pro Seite. Vor Änderungen die aktuelle Implementierung lesen und deren Funktionsweise erhalten. Änderungen am globalen Theme zentral im gemeinsamen Stylesheet vornehmen.

## 1. Verifizierte Design-Tokens (aus `assets/css/styles.css`)
Der bestehende `:root` definiert aktuell:

```css
:root {
  color-scheme: dark;
  --bg-dark: #081326;
  --bg-navy: #0c1d35;
  --bg-blue: #142b49;
  --panel-bg: rgba(23, 42, 68, 0.78);
  --panel-border: #425b77;
  --input-bg: #0b192d;
  --text-primary: #f3f6fc;
  --text-secondary: #acbfd5;
  --accent-gold: #ffd21f;
  --accent-gold-soft: #e9ad28;
  --success: #64efad;
  --success-bg: rgba(22, 90, 70, 0.3);
  --danger: #ff7381;

  /* Aliase für bestehende Tool-Komponenten */
  --bg: var(--bg-dark);
  --panel: var(--panel-bg);
  --field: var(--input-bg);
  --line: var(--panel-border);
  --fg: var(--text-primary);
  --sub: var(--text-secondary);
  --gold: var(--accent-gold);
  --green: var(--success);

  --site-radius: 18px;
  --site-gap: 20px;
  --gold-line: rgba(255, 210, 31, 0.45);
  --panel-shadow: 0 10px 30px rgba(4, 13, 28, 0.2);
}
```

Diese Definitionen sind *Ist-Werte*, nicht bloß Vorschläge. Bei Änderungen bestehende Aliase erhalten, solange sie verwendet werden.

## 2. Bestehendes Layout (Ist-Zustand)
- `body`: `radial-gradient(ellipse at top, #203451 0%, var(--bg) 65%)`, 16 px / 1.45 Systemschrift (u. a. Segoe UI), Mindesthöhe 100vh.
- `.wrap`: `max-width: 1140px`, zentriert. **Nicht ohne ausdrücklichen Auftrag auf 1512 px verbreitern.**
- `.card`: dunkle blaue Oberfläche, `1px`-Kontur, `18px` Eckenradius, `20px` Innenabstand, dezenter Schatten.
- Eingabefelder und Selects: dunkler Hintergrund, `10px` Eckenradius, Kontur via `--line`.
- Grundtext hell; Sekundärtext in `--text-secondary`. Gold für aktive Navigation, Leitlinien und wesentliche Aktionen. Mintgrün für erfolgreiche Resultate und Status.
- Header, Navigation, Logo und Footer möglichst als gemeinsame visuelle Komponenten behandeln.

Die konkrete aktuelle Implementierung hat Vorrang vor diesen Notizen, falls sich der Code zwischenzeitlich geändert hat.

## 3. Gestaltung neuer Seiten
1. Gemeinsame Farbpalette, Typografie, Radien, Schatten und Abstände verwenden.
2. Dunkelblau statt Schwarz als dominierende Fläche einsetzen.
3. Panels schlicht halten; kein neonlastiges Gaming-Portal, keine Hintergrundlandschaften, keine unnötigen Dekorationen.
4. Gold sparsam für wichtige Interaktionen verwenden; Mintgrün für Resultate und positive Statusanzeigen.
5. Gleiche Header- und Footer-Optik auf `index.html`, `umrechner.html` und neuen Tools.
6. Auf Desktop, Tablet und Smartphone lesbar und ohne horizontales Überlaufen.
7. Tastaturbedienbarkeit, sichtbaren Fokus und ausreichenden Kontrast erhalten.

## 4. Technische Schutzregeln
- Der Item-Umrechner ist ein bestehendes, funktionsfähiges Tool. Keine Neuentwicklung nur wegen eines Redesigns.
- Itemsuche, Integer-Mengen, Null-Ergebnis bei unzureichender Zielmenge, Tauschen, Schnellwahltasten, Kopieren, Reset und Mini-Taschenrechner beibehalten.
- Buy und Sell unterscheiden; Preisformatierung, Standardwerte und bestehende Berechnungssemantik beibehalten.
- Preislisten-JSON, Worker-/API-Verbindungen, Admin-Anmeldung, Freigabe/Sperrung, Speicherung, Export und Synchronisation nicht ohne Auftrag verändern.
- Keine Zugangsdaten oder Secrets in öffentlich ausgelieferten Dateien hinterlegen.
- Relative Seiten- und Asset-Links verwenden, damit GitHub Pages auch unter `/Item-VC-Rechner/` funktioniert.
- Vor Änderungen Dateien und Selektoren prüfen; nach Änderungen betroffene Funktionen und Navigation testen.

## 5. Vorgehen für Codex
1. Diese Datei und die aktuelle `assets/css/styles.css` lesen.
2. Betroffene HTML-/JS-Dateien und tatsächliche Ressourcenpfade prüfen.
3. Möglichst kleine, zielgerichtete Änderungen vornehmen.
4. Visuelle Änderungen über gemeinsame Klassen und Tokens umsetzen, nicht durch divergierende Seiten-Themes.
5. Nach jeder Änderung mindestens Navigation, Berechnung, JSON-Laden und bei Admin-Eingriffen die Verwaltungsfunktionen prüfen.
6. Im Abschluss nennen: geänderte Dateien, Tests, verbleibende Einschränkungen.

## 6. Haltelinie für Erweiterungen
`umrechner.html` ist der **visuelle Referenzpunkt**, `assets/css/styles.css` die **technische Quelle der Wahrheit**. Neue Seiten dürfen anders angeordnet sein, müssen aber zur VeloCity-Designfamilie passen. Zusätzliche Design-Tokens nur bei Bedarf ergänzen und zentral dokumentieren.
