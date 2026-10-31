# Preisbasis für VeloCoin

Diese Liste ist ein neuer **Arbeitsstand für die Spielökonomie**, ausgehend von der bereitgestellten `shops.csv`. Sie verändert keine laufenden Minecraft-Shops. Die Quellen-CSV bleibt unverändert; die Vorschläge stehen in `../preislisten/VeloCoin_Preisliste.json`.

## Grundregeln

- Pro Item mindestens **0.01 VC**, höchstens **500'000 VC Buy**, ausschliesslich Cent-Beträge. Das Spielerkonto wird hier nicht verwaltet. Das Konto kann maximal 10'000'000 VC halten. Die neue Liste reicht bis 500'000 VC Buy bzw. 50'000 VC Sell; der Kontodeckel ist keine Zielvorgabe für seltene Items. Überschreitet eine Referenz den Buy-Deckel, werden ihr Buy und Sell im selben Verhältnis gesenkt; danach greifen die Rezept- und Gewinnschleifenprüfungen. `policy.json -> maximumBuy` steuert den Deckel. Die Anpassungen stehen unter `report.json -> summary.buyCaps`.
- CSV-Preise unterhalb des Buy-Deckels bleiben Referenzen mit ihren unterschiedlichen Handelsspannen. **Dirt 3 / 1** aus dem bereits geänderten Repository hat Vorrang vor **10 / 1** aus der CSV.
- Weitere herstellbare Items: Materialkosten und echte Rezeptausgabe berücksichtigen. `3 Planks -> 6 Slabs` bedeutet Materialkosten pro Slab von einer halben Planke. Steinmetz-Alternativen werden berücksichtigt.
- Buy = Materialwert Buy × **1.10**, auf Cent aufrunden. Sell = Materialwert Sell × **0.85**, auf Cent abrunden. Die Auf-/Abschläge gelten **einmal am fertigen Item**, werden nie von Herstellungsschritt zu Herstellungsschritt weiter multipliziert. Die CSV selbst erhält keinen pauschalen Faktor. Durch unterschiedliche Materialwerte und CSV-Spannen entsteht kein überall identisches Buy-/Sell-Verhältnis.
- Für die Materialableitung werden CSV-/Kategorie-Referenzen festgehalten. Für die separate Prüfung von Verkaufsschleifen werden diese Grenzen geöffnet: Es zählt der günstigste erreichbare Einkauf einschliesslich mehrstufiger Herstellung, Zerlegen und modellierter Drops. Sell darf höchstens **90 % dieser Beschaffungskosten** betragen. Notwendige Korrekturen an CSV-Referenzen sind ausdrücklich protokolliert; deren Buy-Preise bleiben erhalten.
- CSV-Kaufpreise können deshalb weiterhin einen Komfort-/Seltenheitsaufschlag gegenüber Selbstherstellung haben. Insbesondere End Crystal und Lodestone sind im CSV-Einkauf teuer. Ihre Verkaufspreise wurden reduziert, damit billige Herstellung keine Gewinnschleife erzeugt. Diese Liste macht die CSV-Verkaufspreise konsistent; sie ersetzt nicht sämtliche vorgegebenen CSV-Kaufpreise durch Selbstkosten.
- Netherite ist ein **Smithing-Upgrade**: ein passendes Diamant-Item + ein Netherite-Ingot + eine verbrauchte Upgrade-Vorlage. Keine erneute vollständige Rüstung aus acht Netherite-Ingots. Vorlagenvervielfältigung berücksichtigt ihre zusätzliche Ausgabe.
- Die neuen Preise werden auch als `defaultBuy`/`defaultSell` eingetragen, damit „Standard wiederherstellen“ keine alten Millionenwerte zurückbringt. Vorherige Werte stehen im Änderungsbericht und in der Git-Historie.

Die Faktoren sind eine nachvollziehbare Balance-Entscheidung, keine aus der CSV eindeutig bestimmbare Naturkonstante. Sie können in `policy.json` angepasst werden. Erneutes Berechnen wendet sie nicht nochmals auf die bereits berechneten Preise an.

## Varianten und fehlende Daten

Die CSV hat **459 Zeilen** und **456 eigenständige Preisreferenzen**. Drei identische doppelte Fisch-Einträge werden zusammengefasst. Die 42 verzauberten Bücher, 19 Tränke und 19 Effektpfeile behalten getrennte IDs und Namen; sie überschreiben sich nicht gegenseitig. Die bisherigen generischen IDs bleiben als Basis-/Schätzwerte bestehen und sind kein Ersatz für einen bestimmten Zauber oder Effekt. Fehlende CSV-Materialien wurden ergänzt; vorhandene IDs und Namen bleiben kompatibel. Der bereits vorhandene eigene Eintrag „Enderperle“ ist auf denselben Preis wie `ENDER_PEARL` gesetzt.

**11 leere Sell-Felder** bekommen im JSON einen ausdrücklich geschätzten Verkaufspreis von 10 % des CSV-Buy-Preises. Der CSV-Wert **0** bei Binding Curse wird als Arbeitsvorschlag auf **0.01** angehoben. Ein leeres/Null-Feld kann im echten Shop „Verkauf gesperrt“ bedeuten: Diese Vorschläge erteilen dort keine Verkaufsfreigabe und sind nicht als unverändert übernommene CSV-Werte zu behandeln. Details: `report.json -> summary.inferredCsvSales`.

Nicht herstellbare Ressourcen und seltene Fundstücke erhalten explizite Vergleichspreise in `policy.json`, etwa für Pflanzen, Archäologie und Musikplatten. Alte generierte Preise werden hierfür **nicht** als Berechnungsgrundlage verwendet. Nicht-Vanilla-Einträge aus der vorhandenen Liste (z. B. Wolltreppen, Poplar, Kissen oder zusätzliche Mauervarianten) bleiben erhalten und werden als **Analogie** bewertet. Deren echte Serverrezepte sind nicht bekannt. Der Bericht unterscheidet diese von bestätigten Rezepten.

## Daten und Prüfbereich

Die eingefrorenen Vanilla-Rezepte stammen aus Minecraft Java **1.21.11**, passend zu den vorhandenen Copper-/Spear-Einträgen:

- [mcmeta-Rezeptdaten, Commit 3926dfaf527cbf692f161ef8f7cdad17a1a06b74](https://github.com/misode/mcmeta/tree/3926dfaf527cbf692f161ef8f7cdad17a1a06b74/data/minecraft/recipe)
- `sources/recipes.json`: aufgelöste Item-Tags, echte Ausgabemengen, Crafting, Schmelzen, Steinmetz, Smithing und dokumentierte Umwandlungen.
- `sources/shops.csv`: unveränderte Nutzerdatei; SHA-256 im Bericht.
- `policy.json`: Referenzschätzungen und Faktoren; Python-Generator ergänzt dokumentierte Analogien und Braurezepte.

Schmelzen verwendet konservativ einen Kohleblock als 80 Brennvorgänge (2.25 VC Einkauf pro Vorgang bei 180 VC pro Block). Lagerfeuerrezepte benötigen keinen verbrauchten Brennstoff. Brauen wird pro Dreiercharge berechnet, mit einem Blaze Powder für 20 Brauvorgänge; Effektpfeile ergeben acht Stück. Ernten, zeitabhängige Farmen, Villager-Handel, Reparatur/XP, Fortune-Schwankungen und unbekannte Plugin-/Mod-Rezepte sind nicht vollständig modelliert. Der Test beweist keine lückenlose Exploitfreiheit auf einem beliebig modifizierten Server.

Nachteilige oder teurere alternative Rezepte sind zulässig; der günstigste bekannte Weg begrenzt den Verkaufserlös. Das ist eine konservative Dauerbetriebsrechnung, kein Einkaufsplan für einen Spieler ohne Werkzeuge oder Startbestand. Rückgabe mehrerer Nebenprodukte und komplexe Weltmechaniken sind nicht vollständig erfasst.

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
