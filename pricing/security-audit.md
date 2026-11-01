# Sicherheitsprüfung nach der Preis-Korrektur

**Ergebnis: Keine profitablen Kombinationen im erweiterten geprüften Modell gefunden.** Die früheren Befunde stehen unverändert in [security-audit-before.md](security-audit-before.md) und `security-audit-before.json`. Dieser Bericht bezeichnet die korrigierten Preise, keine ungeprüften Änderungen an der laufenden Minecraft-Shop-Konfiguration.

Die korrigierte Liste enthält weiterhin **1'548 Einträge**, alle mit **Buy = Sell × 4**, Sell mindestens **0.01 VC** und Buy höchstens **500'000 VC**. Gegenüber Commit `7ce21a0` wurden **25 Preise** geändert; die übrigen bleiben gleich. Auch `defaultBuy`/`defaultSell` sind angepasst, damit die alten Lücken nicht durch „Standard wiederherstellen“ zurückkommen.

## Frühere Angriffspfade mit den neuen Preisen

Vorhandene Arbeitsstationen werden vorausgesetzt. Alle Beispiele sind mit ganzen Mengen und vollständigen Brennstoff-/Brauchargen nachgerechnet:

| Ablauf | Einkauf VC | Verkauf VC | Gewinn/Verlust VC |
| --- | ---: | ---: | ---: |
| Channeling-Buch → normales Buch | 8.00 | 8.00 | 0.00 |
| 100 Glas mit Lava, Eimer verkaufen | 444.20 | 443.50 | -0.70 |
| 240 Schwächetränke | 4344.00 | 3972.00 | -372.00 |
| 240 Infestation-Tränke | 3992.00 | 3859.20 | -132.80 |

Das Entzaubern gewöhnlicher Bücher bleibt möglich, bringt aber keinen VC-Gewinn mehr. Fluchbücher sind ausdrücklich ausgeschlossen. XP wurden nicht in Geld bewertet.

## Änderungen am Modell

- **Entzaubern:** Das normale Buch darf nicht mehr erlösen, als der Einkauf eines entzauberbaren Buchs kostet.
- **Lava:** Ein Lavaeimer liefert 100 Brennvorgänge und gibt gleichzeitig einen leeren Eimer zurück. Beides wird im selben Rezept berücksichtigt.
- **Nebenprodukte:** Zurückgegebene Behälter werden als zusätzliche Ausgabe bewertet. Auch ihre weitere Verwertung zählt: Ein leerer Eimer kann beispielsweise kostenlos mit Wasser gefüllt werden und hat dann einen leicht höheren Verkaufswert. So wurde auch eine kleine Folgeschleife über Blumentöpfe geschlossen.
- **Wasser:** Flaschen und Eimer lassen sich an einer vorhandenen Wasserquelle ohne erfundene VC-Servicegebühr füllen.
- **Drops:** Pilzblöcke werden zusätzlich mit maximal zwei Pilzen als konservative Grenze gerechnet, ohne einen garantierten Ertrag zu behaupten.
- Alle daraus folgenden Crafting-/Brau-Ketten werden erneut bis zu stabilen Cent-Preisen gerechnet. Der Generator arbeitet weiterhin offline und benötigt selbst kein SciPy.

## Gegenprüfung

Die unabhängige lineare Prüfung liest die tatsächlichen JSON-Preise und berücksichtigt gleichzeitige Ausgaben, alternative Zutaten und mehrstufige Inventarflüsse. SciPy/HiGHS hat alle vier Prüfungen optimal abgeschlossen:

| Prüfung | Höchster gefundener Gewinn bei 10'000 VC Gesamteinkauf |
| --- | ---: |
| Erweiterte Generator-Rezepte, ohne zufällige Maximaldrops | 0.00 VC |
| Zusätzliche deterministische Mechaniken | 0.00 VC |
| Zusätzliche maximale Drops, konservatives Szenario | 0.00 VC |
| Kontrollrechnung mit ausgeblendeten früheren Lückenklassen | 0.00 VC |

Umfang: **1'503 zusammengeführte Märkte**, **4256** aufgelöste Rezept-/Alternativoperationen und **99** zusätzliche Mechanikoperationen. Der Nachweis ohne profitable Kombinationen gilt **auch mit eingeschalteten korrigierten Mechaniken**; er basiert nicht auf deren Ausblenden. Die lineare Prüfung erlaubt sogar Bruchteile von Chargen und ist damit konservativer als eine Prüfung nur einzelner ganzer Rezepte.

Der vollständige Bericht samt Preis-SHA-256 steht in `security-audit.json`. Alle 12 Python-Tests bestanden, einschliesslich unabhängiger Mehrfachausgaben- und Mehrstufentests. Worker- und Browser-Tests bestanden ebenfalls.

## Geltungsbereich

Vanilla Java 1.21.11 plus die ausdrücklich modellierten Mechaniken. 166 angenommene Analogie-Rezepte aus der ursprünglichen Liste sind keine bestätigten Serverrezepte. Unbekannte Plugin-Rezepte, andere Versionen, Villager-Handel, Wachstum/Farmen und komplexe Reparatur-/XP-Systeme sind nicht vollständig erfasst.

Die tatsächliche Shop-Konfiguration wurde nicht geliefert. Besonders Bücher, Tränke und Effektpfeile müssen beim Ankauf anhand ihrer vollständigen Metadaten unterschieden werden; eine Material-ID allein reicht nicht. Preisänderungen im JSON reparieren keine falsche NBT-/Komponentenprüfung eines Minecraft-Plugins.

## Reproduzieren

```sh
python3 -m pip install -r pricing/requirements-audit.txt
python3 scripts/balance_prices.py --check
python3 scripts/audit_trade_loops.py
python3 -m unittest discover -s tests -p 'test_*.py' -v
node --test tests/worker.test.mjs
node tests/browser.cjs
```

Exitstatus 1 des Audits bedeutet gefundene Lücken, Status 2 eine unvollständige Solverprüfung. Fehlende Audit-Abhängigkeiten oder übersprungene Tests begründen keine Sicherheitsfreigabe.
