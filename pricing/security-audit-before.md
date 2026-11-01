# Audit der Buy-/Sell-Schleifen

Prüfstand: Repository-Preise mit **Sell:Buy = 1:4**, Commit `7ce21a0`.

**Ergebnis: Die Liste ist gegen die folgenden Vanilla-Schleifen noch nicht abgesichert.** Die Preisdatei wurde in diesem Audit nicht geändert. Die Berechnung gilt für die vorhandenen Listenpreise und Minecraft Java 1.21.11; Server-Plugins können Mechaniken verändern.

## Rechnerisch nachgewiesene Wege

Vorhandene Werkzeuge, Ofen bzw. Braustand und eine Wasserquelle werden vorausgesetzt. Diese Einrichtungen sind keine pro Durchlauf verbrauchten Zutaten. Die Beispiele verwenden ganze Items sowie vollständige Brennstoff-/Brauchargen und benötigen keine zufälligen Drops.

| Ablauf | Einkauf | Verkauf | Gewinn pro Durchlauf |
| --- | ---: | ---: | ---: |
| Ein Channeling-I-Buch für 8 VC kaufen, am Schleifstein entzaubern, normales Buch verkaufen | 8.00 | 13.60 | **5.60 VC** |
| 100 Sand und einen Lavaeimer kaufen, 100 Glas schmelzen, Glas und zurückgegebenen Eimer verkaufen | 444.20 | 498.50 | **54.30 VC** |
| Material für 240 Schwächetränke kaufen, Glasflaschen herstellen und mit Wasser befüllen, brauen und verkaufen | 4'344.00 | 4'584.00 | **240.00 VC** |
| Material für 240 Infestation-Tränke kaufen, Glasflaschen herstellen und mit Wasser befüllen, brauen und verkaufen | 3'992.00 | 4'231.20 | **239.20 VC** |

### Entzaubern

Nur das konkret günstigste betroffene Buch wird als Beispiel behauptet: `ENCHANTED_BOOK_CHANNELING_1` Buy 8.00, `BOOK` Sell 13.60. Der Schleifstein entfernt gewöhnliche Verzauberungen, aber keine Flüche. Binding Curse für 0.04 VC wurde daher **nicht** fälschlich als entzauberbares normales Buch behandelt. Zusätzliche XP wurden nicht in VC bewertet.

### Glas und Lava

Ein Lavaeimer reicht für **100** Schmelzvorgänge; der leere Eimer bleibt übrig:

- 100 × Sand Buy 4.00 + Lavaeimer Buy 44.20 = 444.20 VC.
- 100 × Glas Sell 4.90 + Eimer Sell 8.50 = 498.50 VC.

Die frühere Prüfung kannte Kohle, Kohleblöcke und Kelp als Brennstoff, aber keinen Lava-Brennweg mit gleichzeitiger Behälterrückgabe.

### Brauen und Wasser

Die bisherige Modellierung hat für Wasser eine künstliche `WATER_SERVICE`-Gebühr angesetzt. Tatsächlich kostet das Befüllen von Glasflaschen an einer Wasserquelle kein VC. Dadurch begrenzt das bisherige Modell den Trankverkauf nicht ausreichend.

240 Tränke ergeben 80 Dreierchargen. 240 Glas benötigen 240 Sand und drei Kohleblöcke für genau 240 Schmelzvorgänge. Die Rezeptausgabe beträgt drei Flaschen aus drei Glas.

**Schwäche:** zusätzlich 80 braune Pilze, 80 Spinnenaugen und 80 Zucker für fermentierte Spinnenaugen; vier Blaze Powder reichen für 80 Brauvorgänge. Schwäche benötigt keinen Nether Wart. 240 × Sell 19.10 ergibt 4'584 VC.

**Infestation:** zusätzlich 80 Nether Wart und 80 Stein. Zwei Braustufen ergeben 160 Brauvorgänge, also acht Blaze Powder. 240 × Sell 17.63 ergibt 4'231.20 VC.

Kombinationen mit dem günstigeren Lava-Brennstoff sind zusätzlich möglich; die obigen Beispiele zeigen bereits ohne Kombination positive Gewinne.

## Umfang und unabhängige Gegenprüfung

- Alle **1'548** Einträge auf gültige Cent-Preise, Sell-Minimum, Buy-Deckel und Faktor 4 geprüft; **keine numerischen Verstösse**.
- Aliasse zu **1'503** Märkten zusammengeführt und jeweils günstigsten Buy/höchsten Sell verglichen; **keine unmittelbare Buy→Sell-Differenz positiv**.
- **4'211** bisherige Rezept-/Alternativ-Operationen sowie **99** ergänzte Mechanik-Operationen untersucht. Darunter Crafting-Reste, Lava-Brennstoff, Entzaubern ohne Flüche, Behälterentleerung, konsumierte Suppen, Buch-/Kartenkopien, Wasserfüllung und zusätzliche Blockdrops.
- Ein unabhängiges lineares Inventar-/Geldmodell prüft Kombinationen und mehrere Ausgaben gleichzeitig. Es liest die **tatsächlichen JSON-Preise**, nicht frisch generierte Ersatzpreise.
- Bisheriger Rezeptumfang allein: maximaler Gewinn **0** bei optimaler Lösung.
- Erweiterter deterministischer Umfang: bei 10'000 VC Einkaufsbudget maximal **7'000 VC Gewinn**, entsprechend 1'250 Channeling-Büchern. Das ist keine Einzeltransaktionsgrenze, sondern die Skalierung des obigen Ablaufs.
- Wenn die drei identifizierten Mechanikklassen rechnerisch ausgeblendet werden, findet derselbe Solver **keine weiteren profitablen Kombinationen im verbleibenden Modell**. Das Ausblenden ist nur zur Eingrenzung der Befunde erfolgt, **keine Behebung**.
- Zufällige Maximaldrops wurden getrennt als konservatives Szenario gerechnet. Der geprüfte Vanilla-Loot-Stand lässt bei braunen/roten Pilzblöcken maximal zwei Pilze zu; Fortune erhöht dies nicht. Kein fünf-Pilze-Fortune-Ertrag wurde als garantierter Gewinn angenommen. [Loot-Quelle](https://github.com/misode/mcmeta/blob/3926dfaf527cbf692f161ef8f7cdad17a1a06b74/data/minecraft/loot_table/blocks/brown_mushroom_block.json).

Das lineare Modell kann Bruchteile von Produktionschargen verwenden und betrachtet wiederverwendbare Werkzeuge als vorhandenes Startkapital. Die vier gezeigten Beispiele wurden deshalb zusätzlich mit ganzen Chargen und konkreten Einkaufslisten nachgerechnet.

## Zusätzlich im echten Shop zu prüfen

Die CSV führt 42 verzauberte Bücher unter `enchanted_book` sowie 19 Tränke und 19 Effektpfeile jeweils unter derselben Material-ID. Die Web-App trennt ihre Bewertungs-IDs; das beweist **keine korrekte Serverprüfung** von Verzauberungen, Effekt, Stufe und weiteren Item-Komponenten.

Falls der echte Shop beim Ankauf nur die Material-ID oder den Anzeigenamen prüft, könnten billige Varianten zu teuren Variantenpreisen verkauft werden. Beispiel: Binding-Curse-Buch kaufen für 0.04 VC und bei unzureichender Metadatenprüfung als Mending-Buch für 30 VC verkaufen. **Dies ist ein bedingter Konfigurationsbefund, kein nachgewiesenes Verhalten des laufenden Servers.** Die eigentliche Shop-Konfiguration liegt nicht vor.

166 als Analogie angenommene Rezepte aus der alten Liste wurden nicht als bestätigte Vanilla-Rezepte ausgegeben. Unbekannte Plugin-Rezepte, andere Spielversionen, Villager-Handel, Farmen/Wachstum und komplexe Reparatur-/XP-Systeme sind nicht vollständig erfasst. Eine pauschale Zusicherung „keine weiteren Lücken auf dem Server“ ist damit nicht möglich.

## Erforderliche Korrekturen

Der Preisgenerator muss Entzaubern, Brennstoff mit Behälterrückgabe und kostenlose Wasserfüllung als tatsächliche Mechaniken berücksichtigen. Anschliessend sind die abhängigen Preise unter Beibehaltung von 1:4 neu auszubalancieren. Nur einzelne Beispielpreise zu ändern würde alternative Wege und Folgerezepturen nicht zuverlässig schliessen.

Die ursprüngliche Quellen-CSV und die aktuelle Preisdatei wurden nicht verändert. Maschinenlesbare Befunde, Einkaufslisten und Optimierungsergebnisse stehen in `security-audit.json`.

Erneut ausführen (Python mit SciPy erforderlich):

```sh
python3 scripts/audit_trade_loops.py
```

Exitstatus **1** bedeutet gefundene Lücken; **2** bedeutet unvollständige Solverprüfung. Ein erfolgreicher Test des Audit-Werkzeugs bedeutet nicht, dass diese Preisliste sicher ist.
