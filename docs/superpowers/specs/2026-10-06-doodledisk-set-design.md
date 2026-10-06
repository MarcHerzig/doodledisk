# Doodle Disk Set (Schablone + Abdeckung + Halter) – Design

Stand: 2026-10-06 · Status: vom Besitzer freigegeben ("Jaja") nach Rückfrage; baut auf `2026-10-06-doodledisk-design.md` auf.

## Ziel

Die App erzeugt nicht mehr nur eine Einzelschablone, sondern ein **Set für das Nachzeichnen in N nummerierten Schritten** (N einstellbar, 2–36, Standard 12), wie die "Doodle Discs": Das Bild ist so gross wie die Scheibe. Man dreht eine Abdeckung auf die Zahl k, zeichnet nur das im Fenster sichtbare Tortenstück k nach, dreht weiter bis N, hebt alles ab, und das ganze Bild liegt auf dem Papier.

Drei Teile, drei STL-Downloads:
1. **Schablone** (liegt fest im Halter): das DXF-Motiv als Schlitze (bisheriges Verhalten inkl. Fase und Stegprüfung) plus Passkerbe bei 12 Uhr.
2. **Abdeckung** (dreht sich auf der Schablone, im Ring geführt): Scheibe mit **einem Fenster** (Tortenstück) und den Zahlen 1..N eingraviert am Rand.
3. **Halter**: Ring um Schablone und Abdeckung, Passnase für die Schablone, Zeigerpfeil bei 12 Uhr, C-Klemme für einen A4-Block (hochkant), der Ring sitzt mittig auf dem Blatt.

Modus-Schalter in der App: **Einzelschablone** (wie bisher, unverändert) oder **Set**. Im Set-Modus gibt es zusätzlich "Anzahl Zahlen", "Blockdicke", "Seite der Klemme" und eine Teile-Auswahl für die Vorschau.

## Koordinaten und Konstanten (alle mm)

Alle Teile: Mittelpunkt im Ursprung der XY-Ebene, Winkel mathematisch (0° = +X, gegen den Uhrzeigersinn positiv), 12 Uhr = 90°. Konstanten in einer Datei `src/setparams.js`:

| Name | Wert | Bedeutung |
|---|---|---|
| `D` | `state.durchmesser` (Standard 120) | Durchmesser Schablone |
| `T_S` | `state.dicke` (Standard 3) | Dicke Schablone |
| `T_C` | 2 | Dicke Abdeckung |
| `BAND` | 12 | Zahlenrand der Abdeckung (radial) |
| `R_P` | `D/2 - BAND` | Bildradius: Motiv und Fenster reichen nur bis hier |
| `FIT_P` | 0.95 | Motiv wird beim Laden auf `FIT_P * R_P` eingepasst (statt 80 % von D/2), nur im Set-Modus |
| `COVER_D` | `D - 0.4` | Durchmesser Abdeckung (Spiel im Ring) |
| `RING_SPIEL` | 0.5 | Ring-Innenradius = `D/2 + RING_SPIEL` |
| `RING_WAND` | 3 | Wandstärke Ring |
| `RING_H` | `T_S + T_C + 0.6` | Höhe Ring |
| `ENGRAVE` | 0.8 | Gravurtiefe Zahlen (Abdeckung) und Pfeil (Halter) |
| `WIN_OVERLAP_DEG` | 1 | Fenster je Seite um 1° breiter als das Tortenstück |
| `KEY_W`, `KEY_D` | 6.4, 1.6 | Passkerbe in der Schablone (Breite tangential, Tiefe radial) bei 90° |
| `TAB_W`, `TAB_D`, `TAB_H` | 5.6, 1.2, `T_S` | Passnase im Ring bei 90° (ragt nach innen, Höhe nur bis Oberkante Schablone) |
| `CLIP_W` | 24 | Breite Brücke/Klemme (Richtung entlang der Blockkante) |
| `CLIP_T` | 2.4 | Wandstärke Klemme/Arme |
| `CLIP_BACK` | 20 | Länge des unteren Arms unter dem Block |
| `KLEMM_SPIEL` | 0.2 | Klemmspalt = `Blockdicke + KLEMM_SPIEL` |
| `A4_W`, `A4_H` | 210, 297 | Blatt hochkant |

`α = 360 / N` ist die Breite eines Tortenstücks.

## Geometrie der drei Teile

### Schablone
Wie `buildDisk` heute, plus: Passkerbe = Rechteck `KEY_W` (tangential) x `KEY_D` (radial, von aussen nach innen) am Rand bei 90° über die volle Dicke ausgeschnitten. Das Motiv muss innerhalb `R_P` liegen: die bestehende Randprüfung (`rim: true`, gelb) prüft im Set-Modus gegen `R_P` statt gegen `D/2` (Text: "Das Motiv ragt in den Zahlenrand."). Stegprüfung, Fase, Insel-Warnung bleiben wie bisher.

### Abdeckung
Scheibe `COVER_D` x `T_C`, z von 0 bis `T_C`. Davon wird abgezogen:
- **Fenster**: Tortenstück-Polygon von Winkel `90 - (α/2 + WIN_OVERLAP_DEG)` bis `90 + (α/2 + WIN_OVERLAP_DEG)` (um 90° zentriert), Radius von 0 bis `R_P`, Bogen in höchstens 1°-Schritten abgetastet, über die volle Dicke. Ist `α/2 + WIN_OVERLAP_DEG >= 179` (N=2), wird das Fenster auf höchstens 358° begrenzt; die Abdeckung bleibt in einem Stück (Rand ab `R_P` ist rundum geschlossen).
- **Zahlen** 1..N, eingraviert (nur Oberseite, Tiefe `ENGRAVE`): Zahl k im Winkel `ψ_k = 90 - (k-1) * α` (im Uhrzeigersinn aufsteigend), Mittelpunkt auf Radius `r_num = R_P + BAND/2` (bei D=120: 54). Ziffern stehen so, dass "oben" der Ziffer radial nach aussen zeigt (lokale Drehung `ψ_k - 90°`); bei Zahl 1 (ψ=90°) stehen sie also aufrecht, wenn sie bei 12 Uhr steht. Mehrstellige Zahlen: Ziffern nebeneinander in tangentialer Richtung, als Block zentriert.
- **Ziffernschrift** (eigene 7-Segment-Schrift, keine Fonts): Ziffernhöhe `GH = 6`, Ziffernbreite `GW = 3.4`, Segmentdicke `GS = 0.9`, Abstand zwischen Ziffern `GG = 0.8`. Segmente a (oben), b (oben rechts), c (unten rechts), d (unten), e (unten links), f (oben links), g (Mitte) als Rechtecke, die sich an den Ecken überlappen; Ziffer→Segmente: 0:abcdef, 1:bc, 2:abdeg, 3:abcdg, 4:bcfg, 5:acdfg, 6:acdefg, 7:abc, 8:abcdefg, 9:abcdfg.
- Beziehung Zahl ↔ Fenster: Dreht man die Abdeckung um `(k-1) * α` gegen den Uhrzeigersinn, steht Zahl k bei 12 Uhr (am Zeigerpfeil des Halters) und das Fenster liegt über dem Tortenstück k der Schablone, Mittenwinkel `φ_k = 90 + (k-1) * α`. Bei Zahl 1 ist die Abdeckung unverdreht.
- Grenzen: N von 2 bis 36. Bei N > 30 passen zweistellige Zahlen knapp (Bogenlänge bei `r_num` = 54: 9,4 mm bei N=36, Zahl hat 7,6 mm), das ist zulässig.

### Halter
In Gebrauchslage (Papieroberseite = Ebene z = 0, Block darunter, z ≤ 0). Ring-Mitte im Ursprung. Seite "links" (Standard): Klemme an der linken Blattkante, Blattkante bei `x = -A4_W/2` (= -105). Seite "unten": gleiche Geometrie um +90° um die Z-Achse gedreht (Klemme an der unteren Blattkante bei `y = -A4_H/2` = -148.5).
- **Ring**: Innenradius `D/2 + RING_SPIEL`, Aussenradius `+ RING_WAND`, z von 0 bis `RING_H`.
- **Passnase**: Quader `TAB_W` x `TAB_D` an der Innenwand bei 90°, ragt nach innen, z von 0 bis `TAB_H`.
- **Zeigerpfeil**: gleichschenkliges Dreieck (Basis 6, Höhe 5, Spitze nach innen zur Mitte) bei 90° auf der Ringoberkante, eingraviert (Tiefe `ENGRAVE`). Dazu eine lokale Verbreiterung des Rings bei 90°: Quader 12 breit x 8 tief, der nach aussen an die Ringwand anschliesst und die gleiche Höhe `RING_H` hat, damit der Pfeil Platz hat (Pfeilspitze liegt innen am Rand der Verbreiterung).
- **Brücke**: Platte `CLIP_W` breit (y-Richtung), Dicke `CLIP_T`, z von 0 bis `CLIP_T`, von der Ringaussenwand bis zur Klemmrückwand (in x-Richtung nach links).
- **Klemme** (C-Profil, Öffnung zeigt in +x, also zum Blatt): Rückwand bei `x` von `-A4_W/2 - CLIP_T` bis `-A4_W/2`, `CLIP_W` breit, z von `-(Blockdicke + KLEMM_SPIEL) - CLIP_T` bis `CLIP_T`; oberer Arm = die Brücke (liegt auf dem Papier, z 0 bis `CLIP_T`); unterer Arm: z von `-(Blockdicke + KLEMM_SPIEL) - CLIP_T` bis `-(Blockdicke + KLEMM_SPIEL)`, x von `-A4_W/2 - CLIP_T` bis `-A4_W/2 + CLIP_BACK`.
- Ring und Brücke bilden zusammen ein Teil, alles in einem Stück (union), wasserdicht.
- **Export in Druckausrichtung**: Teil um 180° um die X-Achse gedreht und so verschoben, dass die tiefste Stelle bei z = 0 liegt (Ringoberkante auf dem Druckbett). Die untere Klemmbacke braucht Stützen. Hinweis dazu in der Oberfläche ("Stützen einschalten, PETG empfohlen").

## Berechnung (src)

- Neue Module: `src/setparams.js` (Konstanten und `sectorAngles(N)`), `src/glyphs.js` (Ziffern → `CrossSection`-Polygonlisten), `src/cover.js` (`buildCover(wasm, state)`), `src/holder.js` (`buildHolder(wasm, state, { forPrint })`), Erweiterung `src/disk.js` (`buildDisk` bekommt im Set-Modus die Passkerbe) und `src/compute.js` (`compute` bekommt `part: 'schablone' | 'abdeckung' | 'halter'`, Standard `'schablone'`, `state.modus: 'einzel' | 'set'`).
- Neuer Zustand (`DEFAULTS`/`clampState`): `modus` ('einzel'), `zahlen` (12, Bereich 2..36, ganzzahlig), `blockdicke` (4, Bereich 1..30), `seite` ('links' | 'unten'). In `localStorage` werden diese vier mit gespeichert (mit Validierung).
- Alle WASM-Objekte über den `scope`-Helfer freigeben (wie bisher), alle Teile müssen wasserdicht sein (`isOk`).

## Oberfläche

- Neuer Abschnitt "Modus" oben im Bedienfeld: Umschalter Einzelschablone / Set. Im Set-Modus erscheinen die Felder "Anzahl Zahlen", "Blockdicke (mm)", "Klemme an" (links/unten) und eine Teile-Auswahl **Schablone / Abdeckung / Halter**, die bestimmt, was die Vorschau zeigt.
- Export: Im Einzelmodus ein Knopf wie bisher. Im Set-Modus **drei Knöpfe** (Schablone, Abdeckung, Halter), Dateinamen `<dxf-name>-schablone-<D>x<T>.stl`, `<dxf-name>-abdeckung-<N>.stl` (N = Anzahl Zahlen), `<dxf-name>-halter-<N>.stl` bzw. ohne dxf-name `doodledisk-…`. Schablone-Export weiterhin nur ohne rote Meldung. Abdeckung und Halter brauchen kein DXF und sind immer exportierbar, sobald ihre Berechnung (fein) fertig ist.
- Beim Laden eines DXF im Set-Modus wird auf `FIT_P * R_P` statt auf 80 % von `D/2` eingepasst.
- Das Worker-Protokoll bekommt `part` in Anfrage und Antwort; die bestehende Versions-/Veraltet-Logik gilt pro Anfrage unverändert.
- Der Hinweis zu Druck/Stützen steht im Set-Modus unter den Export-Knöpfen.

## Nicht im Umfang

Zerlegung des Bildes nach Strichgruppen (jetzt rein nach Winkel um die Mitte), mehrere Scheiben pro Set, Anpassung des Blatt-Formats (nur A4 hochkant), Schnapp-Nasen an der Klemme, Mittelstift für die Abdeckung.

## Tests

Vitest mit der echten manifold-WASM, wie bisher:
- `glyphs`: jede Ziffer 0–9 ergibt eine nicht leere Fläche; "8" hat die grösste Fläche; Fläche von "1" < Fläche von "8".
- `cover`: für N = 2, 12, 36 wasserdicht und in einem Stück (decompose = 1); Volumen = Scheibe − Fenster − Gravuren (Toleranz 1 %, Fenster-Fläche analytisch: Sektor `(α + 2*WIN_OVERLAP)/360 * π * R_P²`); das Fenster ist bei 90° offen und bei 270° geschlossen (Querschnitt mit `slice`); jede Zahl k liegt auf Winkel `ψ_k` (Gravur-Fläche im Umkreis des Zahlzentrums > 0 beim Slice auf Tiefe `T_C - ENGRAVE/2`, ausserhalb 0).
- `holder`: wasserdicht, ein Stück; Bounding-Box der Gebrauchslage stimmt mit den Massen überein (x-Minimum = `-A4_W/2 - CLIP_T`, z-Minimum = `-(Blockdicke + KLEMM_SPIEL) - CLIP_T`, z-Maximum = `RING_H`); Seite "unten" liefert die um 90° gedrehte Bounding-Box; `forPrint` hat z-Minimum 0; Innenradius des Rings frei (Querschnitt bei z = 1 hat die Passnase bei 90° und keine Wand im Inneren).
- `schablone` im Set-Modus: Passkerbe vorhanden (Volumen kleiner als ohne Kerbe um etwa `KEY_W * KEY_D * T_S`), Randprüfung gegen `R_P` (Motiv bei Radius 50 im Set-Modus warnt, im Einzelmodus nicht).
- `compute` mit `part` für alle drei Teile; `clampState` für `zahlen` (NaN → 12, 1 → 2, 99 → 36, 7.6 → 8), `blockdicke`, `seite` (ungültig → 'links').
