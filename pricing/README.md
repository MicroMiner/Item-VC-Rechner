# Preisbasis für VeloCoin

Diese Liste ist ein neuer **Arbeitsstand für die Spielökonomie**, ausgehend von der bereitgestellten `shops.csv`. Sie verändert keine laufenden Minecraft-Shops. Die Quellen-CSV bleibt unverändert; die Vorschläge stehen in `../preislisten/VeloCoin_Preisliste.json`.

## Grundregeln

- **Sell mindestens 0.01 VC; Buy = Sell × 4 und höchstens 500'000 VC.** Das Spielerkonto wird hier nicht verwaltet; dessen Limit beträgt weiterhin 10'000'000 VC.
- Das Verhältnis Sell zu Buy beträgt **1:4**, also beispielsweise **1 Sell / 4 Buy**, **500 Sell / 2'000 Buy** oder am unteren Rand **0.01 Sell / 0.04 Buy**. Es handelt sich um einen Faktor, nicht um einen Prozentaufschlag.
- Der Sell-Wert ist die Bewertungsgrundlage. Weil Faktor 4 ganzzahlig ist, bleiben Cent-Preise exakt im Verhältnis 1:4. Falls eine Referenz den Buy-Deckel überschreiten würde, wird zuerst Sell auf höchstens 125'000 VC begrenzt; danach wird Buy daraus berechnet. Aktuell maximal: **200'000 Buy / 50'000 Sell**.
- Die CSV-Kaufpreise bleiben als historische Material-/Kategorie-Referenz erhalten, sind aber **keine endgültigen Shop-Kaufpreise mehr**. Auch die frühere manuelle Dirt-Buy-Vorgabe von 3 VC wird durch das Verhältnis 1:4 ersetzt.
- Die CSV-Sell-Werte und materialbasierte Ableitungen liefern den Ausgangspunkt. Für weitere herstellbare Items werden Materialmengen und tatsächliche Rezeptausgaben berücksichtigt. `3 Planks -> 6 Slabs` bedeutet eine halbe Planke pro Slab. Der Bewertungsabschlag von 0.85 wird einmal auf den Rohmaterial-Sell-Wert eines abgeleiteten Items angewendet; beim Neuberechnen werden keine alten Ausgabe-Preise erneut multipliziert.
- Kauf-/Herstellungs-/Verkaufsschleifen werden anhand der aktuellen Einkaufspreise geschlossen. Wo nötig sinken **auch Sell-Werte**, danach wird Buy erneut als vierfacher Sell gebildet. Die Berechnung wiederholt dies bis zu stabilen Cent-Preisen. Es gibt keinen zusätzlichen pauschalen Sicherheitsabschlag.
- Die Schleifenprüfung ermittelt den günstigsten erreichbaren Einkauf einschliesslich mehrstufiger Herstellung, Zerlegen, bestätigter Rezeptalternativen und modellierter Drops. Kein geprüftes Item darf mehr Sell erlösen, als seine günstigste bekannte Beschaffung kostet. Brennstoff folgt dabei ebenfalls den neuen Einkaufspreisen.
- Pro Item entsteht weiterhin eine eigenständige Material-/Seltenheitsbewertung. Einheitlich ist jetzt das Verhältnis zwischen Sell und Buy; nicht alle Items erhalten denselben Preis.
- Die zuvor begrenzten Referenzen (Elytra, Drachenei, Netherite-Block) bleiben als Ausgangsbewertung erhalten; deren frühere Referenzbegrenzung steht unter `summary.buyCaps`. Die aktuellen tatsächlichen Höchstpreise stehen unter `summary.maxBuy` und `summary.maxSell`.
- Netherite ist ein **Smithing-Upgrade**: ein passendes Diamant-Item + ein Netherite-Ingot + eine verbrauchte Upgrade-Vorlage. Keine erneute vollständige Rüstung aus acht Netherite-Ingots. Vorlagenvervielfältigung berücksichtigt ihre zusätzliche Ausgabe.
- Die neuen Preise werden auch als `defaultBuy`/`defaultSell` eingetragen, damit „Standard wiederherstellen“ keine früheren Preise zurückbringt. Vorherige Werte stehen im Änderungsbericht und in der Git-Historie.

`policy.json -> buySellFactor` ist auf 4 gesetzt. `maximumBuy` steuert weiterhin den absoluten Buy-Deckel. `summary.corrections` enthält die Sell-Korrekturen der Schleifenprüfung. Die verworfene 3-Prozent-Regel wird nicht mehr verwendet. Eine globale Preisänderung im laufenden Minecraft-Server erfolgt hierdurch nicht automatisch.

## Varianten und fehlende Daten

Die CSV hat **459 Zeilen** und **456 eigenständige Preisreferenzen**. Drei identische doppelte Fisch-Einträge werden zusammengefasst. Die 42 verzauberten Bücher, 19 Tränke und 19 Effektpfeile behalten getrennte IDs und Namen; sie überschreiben sich nicht gegenseitig. Die bisherigen generischen IDs bleiben als Basis-/Schätzwerte bestehen und sind kein Ersatz für einen bestimmten Zauber oder Effekt. Fehlende CSV-Materialien wurden ergänzt; vorhandene IDs und Namen bleiben kompatibel. Der bereits vorhandene eigene Eintrag „Enderperle“ ist auf denselben Preis wie `ENDER_PEARL` gesetzt.

**11 leere Sell-Felder** erhalten als Ausgangspunkt einen ausdrücklich geschätzten Verkaufspreis von 10 % des historischen CSV-Buy-Preises; danach gelten ebenfalls die neue Buy-Spanne und Schleifenprüfung. Der CSV-Wert **0** bei Binding Curse wird als Arbeitsvorschlag auf **0.01** angehoben. Ein leeres/Null-Feld kann im echten Shop „Verkauf gesperrt“ bedeuten: Diese Vorschläge erteilen dort keine Verkaufsfreigabe und sind nicht als unverändert übernommene CSV-Werte zu behandeln. Details: `report.json -> summary.inferredCsvSales`.

Nicht herstellbare Ressourcen und seltene Fundstücke erhalten explizite Vergleichspreise in `policy.json`, etwa für Pflanzen, Archäologie und Musikplatten. Alte generierte Preise werden hierfür **nicht** als Berechnungsgrundlage verwendet. Nicht-Vanilla-Einträge aus der vorhandenen Liste (z. B. Wolltreppen, Poplar, Kissen oder zusätzliche Mauervarianten) bleiben erhalten und werden als **Analogie** bewertet. Deren echte Serverrezepte sind nicht bekannt. Der Bericht unterscheidet diese von bestätigten Rezepten.

## Daten und Prüfbereich

Die eingefrorenen Vanilla-Rezepte stammen aus Minecraft Java **1.21.11**, passend zu den vorhandenen Copper-/Spear-Einträgen:

- [mcmeta-Rezeptdaten, Commit 3926dfaf527cbf692f161ef8f7cdad17a1a06b74](https://github.com/misode/mcmeta/tree/3926dfaf527cbf692f161ef8f7cdad17a1a06b74/data/minecraft/recipe)
- `sources/recipes.json`: aufgelöste Item-Tags, echte Ausgabemengen, Crafting, Schmelzen, Steinmetz, Smithing und dokumentierte Umwandlungen.
- `sources/shops.csv`: unveränderte Nutzerdatei; SHA-256 im Bericht.
- `policy.json`: Referenzschätzungen und Faktoren; Python-Generator ergänzt dokumentierte Analogien und Braurezepte.

Schmelzen vergleicht Brennstoff aus Kohleblöcken (80 Vorgänge), Kohle/Charcoal (8) und getrockneten Kelpblöcken (20); der günstigste Weg aus aktuellen Buy-Preisen begrenzt die Brennstoffkosten. Die ursprüngliche Referenz von 2.25 VC pro Vorgang ist lediglich eine obere Startschätzung. Lagerfeuerrezepte benötigen keinen verbrauchten Brennstoff. Brauen wird pro Dreiercharge berechnet, mit einem Blaze Powder für 20 Brauvorgänge; Effektpfeile ergeben acht Stück. Ernten, zeitabhängige Farmen, Villager-Handel, Reparatur/XP, Fortune-Schwankungen und unbekannte Plugin-/Mod-Rezepte sind nicht vollständig modelliert. Der Test beweist keine lückenlose Exploitfreiheit auf einem beliebig modifizierten Server.

Nachteilige oder teurere alternative Rezepte sind zulässig; der günstigste bekannte Weg begrenzt den Verkaufserlös. Das ist eine konservative Dauerbetriebsrechnung, kein Einkaufsplan für einen Spieler ohne Werkzeuge oder Startbestand. Behälterrückgaben werden als zusätzliche Rezeptausgaben berücksichtigt, einschliesslich der weiteren Verwertung zurückgegebener Eimer durch kostenloses Wasserfüllen. Komplexe Weltmechaniken und unbekannte Serverrezepte sind weiterhin nicht vollständig erfasst.

## Ergebnisse nachvollziehen

- `price-changes.csv`: pro Item alter/neuer Buy und Sell, kanonische ID, Methode, Rezept und günstigste Beschaffungskosten.
- `report.json`: derselbe Bericht maschinenlesbar sowie CSV-Ausnahmen, Annahmen und Korrekturen.
- `recipeType: analogy` und `*reference` kennzeichnen Schätzungen. `modeled_*` bezeichnet explizit ergänzte Spielmechanik. `reference` in der Rezeptspalte allein bedeutet, dass kein Herstellungsrezept angewendet wurde; die Spalte `method` unterscheidet CSV und Schätzung.

Prüfen ohne Dateiänderungen:

```sh
python3 scripts/balance_prices.py --check
python3 -m unittest discover -s tests -p 'test_pricing.py' -v
node --test tests/worker.test.mjs
node tests/browser.cjs
```

Bewusst neu berechnen und JSON/Änderungsbericht schreiben:

```sh
python3 scripts/balance_prices.py
```

Der Generator arbeitet offline, verändert keine Anwendung oder Serverkonfiguration und pusht/deployt nichts. Er erhält die ursprünglichen Vorher-Werte aus dem Bericht, solange kein zwischenzeitlicher manueller Preiswechsel vorliegt. Spätere manuelle Balanceentscheidungen gehören in die Policy, damit sie beim erneuten Berechnen erhalten bleiben.


## Erweiterter Sicherheitscheck

Der Generator berücksichtigt jetzt Entzaubern gewöhnlicher verzauberter Bücher (keine Flüche), kostenloses Wasserfüllen, Lavaeimer als Brennstoff für 100 Schmelzvorgänge sowie gleichzeitig zurückgegebene Behälter. Bei Nebenprodukten zählt auch deren beste bekannte Weiterverwertung, nicht nur der unmittelbare Sell-Preis. Die geprüften maximalen Pilzblock-Drops werden als konservative Grenze berücksichtigt.

Die unabhängige lineare Gegenprüfung testet mehrstufige Abläufe und mehrere Ausgaben gleichzeitig anhand der tatsächlichen JSON-Preise. [Aktueller Sicherheitsbericht](security-audit.md); die historischen Befunde bleiben in [security-audit-before.md](security-audit-before.md) erhalten. Alle Prüfungen müssen vor dem Push bestehen:

```sh
python3 scripts/audit_trade_loops.py
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

Das zusätzliche Audit benötigt SciPy; der Preisgenerator selbst bleibt ohne diese Abhängigkeit lauffähig. Exitstatus 1 bedeutet gefundene Gewinnschleifen, 2 eine unvollständige Solverprüfung. Kein Test darf übersprungen oder als bestanden bezeichnet werden, wenn SciPy für die unabhängige Prüfung fehlt.
