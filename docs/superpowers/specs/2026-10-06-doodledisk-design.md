# Doodle Disk Creator – Design

Stand: 2026-10-06 · Status: Entwurf zur Freigabe

## Ziel

Eine Web-App unter `doodledisk.maegu.be`. Du lädst eine saubere DXF-Datei hoch (Motivkontur), die App baut daraus eine runde Schablonen-Scheibe mit ausgestanztem Motiv und exportiert sie als **STL** zum 3D-Druck. Kinder fahren mit einem Stift der Ausschnittkante entlang.

**Erfolgskriterium:** DXF hochladen → in unter 10 s eine druckbare, wasserdichte STL mit Fase am Ausschnitt, deren Vorschau dem Export entspricht.

## Entschieden

| Thema | Entscheid |
|---|---|
| Fertigung | 3D-Druck, Ausgabe STL (SVG nicht im Umfang) |
| Eingabe | Nur saubere DXF, kein Bild-Tracing, keine Schwellwert-Regler |
| Stege gegen herausfallende Inseln | Liegen schon im DXF, die App prüft nur |
| Umfang | Variante B: Parameter + Motiv schieben/drehen/skalieren + Fase |
| Extras | Nur Fase am Ausschnitt (kein Aufhängeloch, Rand, Gravur) |
| Standardmasse | Ø 120 mm, 3 mm dick |
| Architektur | Alles im Browser, kein Backend, `manifold-3d` (WASM) + `dxf-parser` + `three.js`, Vite + Vanilla JS |
| Hosting | nginx-Pod im k3s, ArgoCD, Cloudflare Tunnel, offen ohne Access |

## Nicht im Umfang

SVG/DXF-Export, Bild-Upload, Batch/ZIP, Aufhängeloch, erhabener Rand, Gravur, Benutzerkonten, serverseitiges Speichern.

## Module

| Modul | Aufgabe | Eingabe → Ausgabe |
|---|---|---|
| `dxf.js` | DXF lesen. Entities LINE, ARC, CIRCLE, LWPOLYLINE, SPLINE; Bögen und Splines mit fester Toleranz abtasten. `$INSUNITS` auswerten (Zoll → mm). | DXF-Text → Polylinien + Liste ignorierter Entities |
| `contours.js` | Segmente mit Toleranz (0,01 mm) zu geschlossenen Konturen verketten; Aussenkontur und Inseln erkennen. | Polylinien → geschlossene Konturen oder Fehler mit Position |
| `disk.js` | Zylinder minus Ausschnitt; Motiv vorher skalieren, drehen, verschieben; Fase als Schichtstapel. | Konturen + Parameter → Manifold-Mesh |
| `preview.js` | three.js-Szene, Orbit-Kamera, Motiv per Maus ziehen. | Mesh → Bild |
| `export.js` | Binär-STL schreiben, Download. | Mesh → Datei |

**Zustand:** ein Objekt `{contours, durchmesser, dicke, fasenTiefe, fasenAufweitung, fasenOben, offsetX, offsetY, winkel, skalierung}`. Alles andere wird daraus abgeleitet, damit Vorschau und Export identisch bleiben.

**Datenfluss:** Datei → `dxf` → `contours` → Zustand → `disk` (Web Worker) → `preview`; Knopf „STL“ → `export`.

**Worker:** `manifold` läuft in einem Web Worker. Beim Ziehen wird eine grobe Fase (wenige Schichten) gerechnet, beim Loslassen und Export die feine (0,2 mm).

## Fase

Der Ausschnitt ist oben breiter als unten, damit die Stiftspitze der Kante folgt. Unten entspricht die Kontur exakt dem DXF.

- Parameter: Fasentiefe (Standard 1 mm), Aufweitung (Standard 0,8 mm), Schalter oben/unten (Standard oben, Vorschau zeigt die Scheibe in Druckrichtung).
- Aufbau: Das Loch wird in Schichten zu 0,2 mm zerlegt. Schicht *i* von *n* nutzt `offset(Aufweitung · i / n)`. Der Rest unter der Fase bleibt senkrecht.
- Schichten statt glattem Trichter, weil der Drucker ohnehin schichtweise arbeitet und die Boolean-Operation stabil bleibt.
- Die Stegprüfung rechnet mit der aufgeweiteten Kontur, damit verschmelzende Löcher auffallen.

## Fehlerfälle

| Fall | Verhalten |
|---|---|
| Kontur nicht geschlossen (Lücke > Toleranz) | Stopp, Meldung „Lücke bei x, y“, Stelle in der Vorschau rot |
| Selbstüberschneidung | Warnung, Berechnung läuft trotzdem |
| Motiv grösser als Scheibe | Beim Laden auf 80 % des Durchmessers eingepasst |
| Motiv ragt über den Rand | Roter Rand, Export mit Warnung möglich |
| Steg < 1 mm (Ausschnitt–Rand oder Ausschnitt–Ausschnitt) | Gelbe Warnung |
| Nicht unterstützte Entities (Text, Blöcke) | Liste der ignorierten Elemente |
| Zoll-Einheiten | Umrechnung und Hinweis |

Ampel: rot sperrt den Export, gelb warnt, grün ok.

## Bedienoberfläche

Eine Seite: links 3D-Vorschau (dunkler Grund), rechts Bedienfeld (auf dem Handy darunter).

1. Drop-Zone „DXF hierher ziehen“, danach Dateiname mit „Andere Datei“.
2. Scheibe: Durchmesser, Dicke, Fase.
3. Motiv: Regler Grösse und Drehung, Zahlenfelder X/Y, „Zentrieren“, Ziehen mit der Maus.
4. Prüfung: Meldungsliste mit Ampel, dünnster Steg, Anzahl Ausschnitte, Druckdauer-Schätzung.
5. Export: „STL herunterladen“, Dateiname `<dxf-name>-120x3.stl`.

Einstellungen (ohne DXF) merkt sich der Browser in `localStorage`, mit try/catch gekapselt.

## Deployment

- Repo `MarcHerzig/doodledisk`, öffentlich (kein `imagePullSecret`). GitHub Actions baut `ghcr.io/marcherzig/doodledisk`.
- Image: Multi-Stage, Node baut, `nginx-alpine` liefert aus (MIME `application/wasm`, gzip).
- `argo-homelab/apps/doodledisk/`: Deployment (1 Replica, 50m CPU / 32Mi RAM), Service, Traefik-IngressRoute `doodledisk.maegu.be`; dazu `bootstrap/applications/doodledisk.yaml` und Eintrag in `bootstrap/kustomization.yaml`. Keine PVC.
- Cloudflare: zuerst CNAME in `maegu.be` (Token `cloudflare-maegu-dns.token`), dann Tunnel-Route (Token `cloudflare-maegu.token`). Erst danach den Namen abfragen. Kein Cloudflare Access.
- Wiki: Eintrag in `wiki-homelab`.
- GitOps: Änderungen am Cluster nur über `argo-homelab`, kein `kubectl patch`.

## Grösse und Last

Bundle ca. 1,5 MB (gzip ca. 600 KB): `manifold-3d` ca. 1 MB, `three.js` ca. 150 KB gzip, `dxf-parser` ca. 20 KB, eigener Code 30–50 KB. Eigener Code ca. 800–1000 Zeilen. Pod im Leerlauf ca. 10 MB RAM, praktisch keine CPU; die Geometrie rechnet der Browser.

## Tests

Vitest je Modul mit kleinen DXF-Beispielen: Kreis, Herz mit Insel, offene Kontur, Zoll-Einheit, Spline. Die Fase wird per Volumenvergleich des Meshs geprüft, die Wasserdichtigkeit per `manifold`-Status.

## Offene Punkte

Keine.
