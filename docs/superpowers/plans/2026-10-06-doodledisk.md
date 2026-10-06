# Doodle Disk Creator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Web-App unter `doodledisk.maegu.be`, die ein DXF-Motiv in eine druckbare Schablonen-Scheibe (STL, mit Fase am Ausschnitt) verwandelt.

**Architecture:** Alles läuft im Browser: `dxf-parser` liest das DXF, eigene Module verketten Konturen, `manifold-3d` (WASM, im Web Worker) baut Zylinder minus Ausschnitt mit Fase als Schichtstapel, `three.js` zeigt die Vorschau, ein eigener Writer exportiert Binär-STL. Ausgeliefert wird das Vite-Bundle von einem nginx-Pod im k3s.

**Tech Stack:** Node 20, Vite 6, Vitest 2, Vanilla JS (ES-Module), `manifold-3d`, `dxf-parser`, `three`, nginx-alpine, GitHub Actions, ArgoCD, Traefik, Cloudflare Tunnel.

**Spec:** `docs/superpowers/specs/2026-10-06-doodledisk-design.md`

## Global Constraints

- Standardmasse: Ø 120 mm, 3 mm dick; Fase Standard: Tiefe 1 mm, Aufweitung 0,8 mm, oben.
- Fasen-Schichthöhe 0,2 mm (`LAYER`); Verkettungs-Toleranz 0,01 mm (`CLOSE_TOL`); Bogen-Abtastung max. 0,02 mm Abweichung.
- Mindeststeg 1 mm (nur Warnung); Motiv wird beim Laden auf 80 % des Durchmessers eingepasst, falls grösser.
- Kein Backend, keine Uploads, nichts wird serverseitig gespeichert. Einstellungen (ohne DXF) nur in `localStorage`, immer in try/catch.
- Ampel: `rot` sperrt den STL-Export, `gelb` warnt nur.
- STL-Dateiname: `<dxf-name>-<durchmesser>x<dicke>.stl`. Oberflächentexte auf Deutsch.
- Pod: 1 Replica, requests 50m/32Mi, keine PVC. Image `ghcr.io/marcherzig/doodledisk:latest`. Host `doodledisk.maegu.be`, Namespace `applications`.
- GitOps: Cluster-Änderungen nur über `argo-homelab`, kein `kubectl patch`. Cloudflare: erst DNS-Record setzen, dann abfragen.
- Commit-Nachrichten enden mit den Zeilen `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` und `Claude-Session: https://claude.ai/code/session_01FYbdfie8zmNtEK2PevCbZp`.

## Review Focus

- **DXF mit offener Kontur (Lücke):** muss mit Position gemeldet werden, nie stillschweigend einen falschen Ausschnitt bauen. (Task 3)
- **DXF in Zoll oder Müll-Datei:** Zoll wird auf mm umgerechnet; eine Nicht-DXF-Datei gibt eine verständliche Fehlermeldung statt eines Absturzes. (Task 2)
- **Tausende Segmente (Spline-/Polylinien-Export):** Verkettung muss in unter 2 s fertig sein. (Task 3)
- **Leere/ungültige Zahlenfelder und Fase dicker als die Scheibe:** Werte werden geklemmt, nie NaN ins Modell. (Task 4)
- **Fase lässt zwei Ausschnitte verschmelzen oder Motiv ragt über den Rand:** Warnung statt stiller Fehlform. (Task 5)

---

### Task 1: Projektgerüst und WASM-Smoke-Test

**Files:**
- Create: `package.json`, `vite.config.js`, `.gitignore`, `.gitattributes`, `index.html` (Platzhalter), `src/wasm.js`
- Test: `tests/wasm.test.js`

**Interfaces:**
- Produces (`src/wasm.js`):
  - `loadManifold(locateFile?: (path: string) => string): Promise<Wasm>` (einmalig, gecacht, ruft `setup()` auf)
  - `isOk(manifold): boolean`
  - `volumeOf(manifold): number`
  - `scope(): { t<T>(x: T): T, done(): void }` (sammelt WASM-Objekte und löscht sie in `done()`)

- [ ] **Step 1: Repo-Einstellungen und Abhängigkeiten**

```bash
cd /mnt/c/Users/mherz/git/doodledisk
git config user.name "Marc Herzig" && git config user.email "maegu87@gmail.com"
git config core.autocrlf false
printf '* text=auto eol=lf\n' > .gitattributes
printf 'node_modules\ndist\n.DS_Store\n' > .gitignore
cat > package.json <<'EOF'
{
  "name": "doodledisk",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "dxf-parser": "^1.1.2",
    "manifold-3d": "^3.0.0",
    "three": "^0.170.0"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
EOF
cat > vite.config.js <<'EOF'
import { defineConfig } from 'vitest/config';

export default defineConfig({
  worker: { format: 'es' },
  test: { environment: 'node', testTimeout: 30000 },
});
EOF
printf '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Doodle Disk</title></head><body></body></html>\n' > index.html
npm install
```

Expected: `package-lock.json` entsteht, keine Fehler (auf `/mnt/c` dauert das etwas).

- [ ] **Step 2: Failing Test schreiben**

`tests/wasm.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { loadManifold, isOk, volumeOf } from '../src/wasm.js';

describe('manifold WASM', () => {
  it('lädt und baut einen Zylinder mit plausiblem Volumen', async () => {
    const { Manifold } = await loadManifold();
    const c = Manifold.cylinder(3, 60, 60, 256);
    expect(isOk(c)).toBe(true);
    const expected = Math.PI * 60 * 60 * 3;
    expect(volumeOf(c)).toBeGreaterThan(expected * 0.99);
    expect(volumeOf(c)).toBeLessThan(expected * 1.001);
    c.delete();
  });
});
```

- [ ] **Step 3: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run tests/wasm.test.js`
Expected: FAIL (`Cannot find module '../src/wasm.js'`)

- [ ] **Step 4: Implementieren**

`src/wasm.js`:

```js
import Module from 'manifold-3d';

let ready;

export function loadManifold(locateFile) {
  ready ??= Module(locateFile ? { locateFile } : undefined).then((wasm) => {
    wasm.setup();
    return wasm;
  });
  return ready;
}

export function isOk(m) {
  const s = m.status();
  return s === 'NoError' || s === 0;
}

export function volumeOf(m) {
  return typeof m.volume === 'function' ? m.volume() : m.getProperties().volume;
}

export function scope() {
  const items = [];
  return {
    t(x) {
      items.push(x);
      return x;
    },
    done() {
      for (const i of items) {
        try {
          i.delete();
        } catch {
          /* schon gelöscht */
        }
      }
      items.length = 0;
    },
  };
}
```

- [ ] **Step 5: Test laufen lassen, muss bestehen**

Run: `npx vitest run tests/wasm.test.js`
Expected: PASS. Falls `status()` einen anderen Wert liefert, `isOk` anpassen, bis der Test grün ist.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: Projektgerüst, manifold-WASM-Lader"
```

---

### Task 2: DXF einlesen (`dxf.js`)

**Files:**
- Create: `src/dxf.js`, `tests/dxfText.js` (Testhilfe), `tests/dxf.test.js`

**Interfaces:**
- Produces:
  - `readDxf(text: string): { polylines: Polyline[], ignored: Record<string, number>, unitFactor: number }`
  - `type Polyline = { points: [number, number][], closed: boolean }` (Punkte schon in mm)
  - wirft `Error` mit deutscher Meldung bei unlesbarer Datei oder wenn kein unterstütztes Element vorhanden ist
- Test-Helfer (`tests/dxfText.js`): `dxf(entities: string[], { insunits? }): string`, `line`, `circle`, `arc`, `lwpoly(pts, closed=true)` (Punkte `[x, y, bulge?]`), `rect`, `spline(degree, knots, cps)`, `text`

- [ ] **Step 1: Testhilfe schreiben**

`tests/dxfText.js`:

```js
const pair = (code, value) => `${code}\n${value}\n`;

export function dxf(entities, { insunits } = {}) {
  let s = '';
  if (insunits !== undefined) {
    s += pair(0, 'SECTION') + pair(2, 'HEADER') + pair(9, '$INSUNITS') + pair(70, insunits) + pair(0, 'ENDSEC');
  }
  s += pair(0, 'SECTION') + pair(2, 'ENTITIES') + entities.join('') + pair(0, 'ENDSEC') + pair(0, 'EOF');
  return s;
}

export const line = (x1, y1, x2, y2) =>
  pair(0, 'LINE') + pair(8, '0') + pair(10, x1) + pair(20, y1) + pair(30, 0) + pair(11, x2) + pair(21, y2) + pair(31, 0);

export const circle = (x, y, r) =>
  pair(0, 'CIRCLE') + pair(8, '0') + pair(10, x) + pair(20, y) + pair(30, 0) + pair(40, r);

export const arc = (x, y, r, a0, a1) =>
  pair(0, 'ARC') + pair(8, '0') + pair(10, x) + pair(20, y) + pair(30, 0) + pair(40, r) + pair(50, a0) + pair(51, a1);

export const lwpoly = (pts, closed = true) =>
  pair(0, 'LWPOLYLINE') + pair(8, '0') + pair(90, pts.length) + pair(70, closed ? 1 : 0) +
  pts.map(([x, y, b]) => pair(10, x) + pair(20, y) + (b ? pair(42, b) : '')).join('');

export const rect = (x, y, w, h) => lwpoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);

export const spline = (degree, knots, cps) =>
  pair(0, 'SPLINE') + pair(8, '0') + pair(70, 8) + pair(71, degree) + pair(72, knots.length) + pair(73, cps.length) +
  pair(74, 0) + knots.map((k) => pair(40, k)).join('') +
  cps.map(([x, y]) => pair(10, x) + pair(20, y) + pair(30, 0)).join('');

export const text = () =>
  pair(0, 'TEXT') + pair(8, '0') + pair(10, 0) + pair(20, 0) + pair(30, 0) + pair(40, 2) + pair(1, 'hi');
```

- [ ] **Step 2: Failing Tests schreiben**

`tests/dxf.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readDxf } from '../src/dxf.js';
import { dxf, line, circle, arc, lwpoly, rect, spline, text } from './dxfText.js';

describe('readDxf', () => {
  it('liest eine LINE als offene Polylinie', () => {
    const { polylines } = readDxf(dxf([line(0, 0, 10, 0)]));
    expect(polylines).toEqual([{ points: [[0, 0], [10, 0]], closed: false }]);
  });

  it('liest einen CIRCLE als geschlossene Polylinie auf dem Radius', () => {
    const { polylines } = readDxf(dxf([circle(5, 5, 20)]));
    expect(polylines).toHaveLength(1);
    expect(polylines[0].closed).toBe(true);
    for (const [x, y] of polylines[0].points) expect(Math.hypot(x - 5, y - 5)).toBeCloseTo(20, 6);
    expect(polylines[0].points.length).toBeGreaterThan(30);
  });

  it('liest einen ARC von 0° bis 90°', () => {
    const { polylines } = readDxf(dxf([arc(0, 0, 10, 0, 90)]));
    const pts = polylines[0].points;
    expect(polylines[0].closed).toBe(false);
    expect(pts[0][0]).toBeCloseTo(10, 6);
    expect(pts[0][1]).toBeCloseTo(0, 6);
    expect(pts.at(-1)[0]).toBeCloseTo(0, 6);
    expect(pts.at(-1)[1]).toBeCloseTo(10, 6);
  });

  it('liest ein geschlossenes Rechteck (LWPOLYLINE) mit 4 Punkten', () => {
    const { polylines } = readDxf(dxf([rect(0, 0, 10, 5)]));
    expect(polylines[0].closed).toBe(true);
    expect(polylines[0].points).toHaveLength(4);
  });

  it('löst Bulge-Segmente zu einem Halbkreis auf', () => {
    const { polylines } = readDxf(dxf([lwpoly([[0, 0, 1], [10, 0]], false)]));
    const pts = polylines[0].points;
    expect(polylines[0].closed).toBe(false);
    expect(pts.length).toBeGreaterThan(10);
    for (const [x, y] of pts) expect(Math.hypot(x - 5, y)).toBeCloseTo(5, 6);
    expect(pts.some(([x, y]) => Math.abs(x - 5) < 0.3 && y < -4.9)).toBe(true);
  });

  it('tastet einen quadratischen B-Spline ab', () => {
    const { polylines } = readDxf(dxf([spline(2, [0, 0, 0, 1, 1, 1], [[0, 0], [10, 10], [20, 0]])]));
    const pts = polylines[0].points;
    expect(pts[0][0]).toBeCloseTo(0, 6);
    expect(pts.at(-1)[0]).toBeCloseTo(20, 3);
    expect(pts.some(([x, y]) => Math.abs(x - 10) < 0.2 && Math.abs(y - 5) < 0.1)).toBe(true);
  });

  it('zählt nicht unterstützte Elemente', () => {
    const { polylines, ignored } = readDxf(dxf([line(0, 0, 1, 0), text()]));
    expect(polylines).toHaveLength(1);
    expect(ignored).toEqual({ TEXT: 1 });
  });

  it('rechnet Zoll ($INSUNITS=1) in mm um', () => {
    const { polylines, unitFactor } = readDxf(dxf([line(0, 0, 1, 0)], { insunits: 1 }));
    expect(unitFactor).toBe(25.4);
    expect(polylines[0].points[1][0]).toBeCloseTo(25.4, 6);
  });

  it('wirft eine verständliche Meldung bei Müll-Dateien', () => {
    expect(() => readDxf('hallo das ist kein dxf')).toThrow();
    expect(() => readDxf(dxf([text()]))).toThrow(/unterstützt/);
  });
});
```

- [ ] **Step 3: Tests laufen lassen, müssen fehlschlagen**

Run: `npx vitest run tests/dxf.test.js`
Expected: FAIL (`Cannot find module '../src/dxf.js'`)

- [ ] **Step 4: Implementieren**

`src/dxf.js`:

```js
import DxfParser from 'dxf-parser';

const SAG = 0.02; // mm, max. Abweichung beim Abtasten von Bögen
const UNIT_FACTOR = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };

function steps(r, sweep) {
  if (r <= SAG) return 2;
  return Math.max(2, Math.ceil(Math.abs(sweep) / (2 * Math.acos(1 - SAG / r))));
}

function arcPoints(cx, cy, r, a0, sweep) {
  const n = steps(r, sweep);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function bulgeInterior(p0, p1, bulge) {
  const theta = 4 * Math.atan(bulge);
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const c = Math.hypot(dx, dy);
  if (c === 0) return [];
  const d = c / 2 / Math.tan(theta / 2);
  const cx = (p0.x + p1.x) / 2 - (dy / c) * d;
  const cy = (p0.y + p1.y) / 2 + (dx / c) * d;
  const r = Math.hypot(p0.x - cx, p0.y - cy);
  const a0 = Math.atan2(p0.y - cy, p0.x - cx);
  return arcPoints(cx, cy, r, a0, theta).slice(1, -1);
}

function polylinePoints(vertices, closed) {
  const out = [];
  const n = vertices.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = vertices[i];
    const p1 = vertices[(i + 1) % n];
    out.push([p0.x, p0.y]);
    if (p0.bulge) out.push(...bulgeInterior(p0, p1, p0.bulge));
  }
  if (!closed) {
    const l = vertices[n - 1];
    out.push([l.x, l.y]);
  }
  return out;
}

function deBoor(cp, U, p, t) {
  const n = cp.length - 1;
  let k = p;
  for (let i = p; i <= n; i++) {
    if (t >= U[i] && t < U[i + 1]) {
      k = i;
      break;
    }
  }
  const d = [];
  for (let j = 0; j <= p; j++) d.push([cp[j + k - p].x, cp[j + k - p].y]);
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const den = U[j + 1 + k - r] - U[j + k - p];
      const a = den === 0 ? 0 : (t - U[j + k - p]) / den;
      d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1]];
    }
  }
  return d[p];
}

function splinePoints(e) {
  const cp = e.controlPoints || [];
  const p = e.degree;
  const U = e.knotValues;
  if (!U || cp.length < 2 || U.length !== cp.length + p + 1) {
    const fit = e.fitPoints && e.fitPoints.length >= 2 ? e.fitPoints : cp;
    return fit.map((v) => [v.x, v.y]);
  }
  const t0 = U[p];
  const t1 = U[cp.length];
  const N = Math.max(48, cp.length * 12);
  const out = [];
  for (let i = 0; i <= N; i++) {
    const t = i === N ? t1 - 1e-12 : t0 + ((t1 - t0) * i) / N;
    out.push(deBoor(cp, U, p, t));
  }
  return out;
}

export function readDxf(text) {
  const parsed = new DxfParser().parseSync(text);
  const entities = (parsed && parsed.entities) || [];
  const polylines = [];
  const ignored = {};

  for (const e of entities) {
    switch (e.type) {
      case 'LINE':
        polylines.push({ points: [[e.vertices[0].x, e.vertices[0].y], [e.vertices[1].x, e.vertices[1].y]], closed: false });
        break;
      case 'CIRCLE': {
        const pts = arcPoints(e.center.x, e.center.y, e.radius, 0, 2 * Math.PI);
        pts.pop();
        polylines.push({ points: pts, closed: true });
        break;
      }
      case 'ARC': {
        let sweep = e.endAngle - e.startAngle;
        if (sweep <= 0) sweep += 2 * Math.PI;
        polylines.push({ points: arcPoints(e.center.x, e.center.y, e.radius, e.startAngle, sweep), closed: false });
        break;
      }
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const closed = Boolean(e.shape || e.closed);
        if (e.vertices && e.vertices.length >= 2) polylines.push({ points: polylinePoints(e.vertices, closed), closed });
        break;
      }
      case 'SPLINE': {
        const points = splinePoints(e);
        if (points.length >= 2) polylines.push({ points, closed: false });
        break;
      }
      default:
        ignored[e.type] = (ignored[e.type] || 0) + 1;
    }
  }

  if (!polylines.length) {
    throw new Error('Keine unterstützten Zeichenelemente gefunden (LINE, ARC, CIRCLE, POLYLINE, SPLINE).');
  }

  const unitFactor = UNIT_FACTOR[Number(parsed?.header?.$INSUNITS)] ?? 1;
  if (unitFactor !== 1) {
    for (const pl of polylines) pl.points = pl.points.map(([x, y]) => [x * unitFactor, y * unitFactor]);
  }
  return { polylines, ignored, unitFactor };
}
```

- [ ] **Step 5: Tests laufen lassen, müssen bestehen**

Run: `npx vitest run tests/dxf.test.js`
Expected: PASS (9 Tests). Falls `dxf-parser` Winkel in Grad statt Radiant liefert oder Header anders benennt, `ARC`/`$INSUNITS` entsprechend anpassen, bis grün.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: DXF-Leser (LINE, ARC, CIRCLE, POLYLINE, SPLINE, Einheiten)"
```

---

### Task 3: Konturen verketten und prüfen (`contours.js`)

**Files:**
- Create: `src/contours.js`
- Test: `tests/contours.test.js`

**Interfaces:**
- Consumes: `Polyline` aus Task 2.
- Produces:
  - `CLOSE_TOL = 0.01`
  - `buildContours(polylines: Polyline[], tol = CLOSE_TOL): { contours: [number, number][][], gaps: {x:number,y:number}[] }` (Konturen ohne doppelten Schlusspunkt, mind. 3 Punkte)
  - `findIntersections(contours, max = 10): {x:number,y:number}[]`

- [ ] **Step 1: Failing Tests schreiben**

`tests/contours.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildContours, findIntersections } from '../src/contours.js';

const seg = (a, b) => ({ points: [a, b], closed: false });

describe('buildContours', () => {
  it('schliesst vier Linien zu einem Quadrat, auch unsortiert und umgedreht', () => {
    const { contours, gaps } = buildContours([
      seg([10, 10], [0, 10]),
      seg([0, 0], [10, 0]),
      seg([0, 10], [0, 0]),
      seg([10, 0], [10, 10]),
    ]);
    expect(gaps).toEqual([]);
    expect(contours).toHaveLength(1);
    expect(contours[0]).toHaveLength(4);
  });

  it('meldet Lücken mit Position', () => {
    const { contours, gaps } = buildContours([
      seg([0, 0], [10, 0]),
      seg([10, 0], [10, 10]),
      seg([10, 10], [0, 10]),
      seg([0, 9.5], [0, 0]),
    ]);
    expect(contours).toHaveLength(0);
    expect(gaps).toHaveLength(2);
    expect(gaps.some((g) => Math.abs(g.x) < 1e-9 && Math.abs(g.y - 10) < 1e-9)).toBe(true);
  });

  it('akzeptiert Lücken unter der Toleranz', () => {
    const { contours, gaps } = buildContours([
      seg([0, 0], [10, 0]),
      seg([10, 0], [10, 10]),
      seg([10, 10], [0, 10]),
      seg([0, 10.005], [0, 0]),
    ]);
    expect(gaps).toEqual([]);
    expect(contours).toHaveLength(1);
  });

  it('übernimmt geschlossene Polylinien direkt und entfernt den doppelten Schlusspunkt', () => {
    const { contours } = buildContours([
      { points: [[0, 0], [5, 0], [5, 5], [0, 0]], closed: false },
      { points: [[10, 10], [20, 10], [20, 20]], closed: true },
    ]);
    expect(contours.map((c) => c.length)).toEqual([3, 3]);
  });

  it('verkettet 2000 gemischte Segmente eines Kreises in unter 2 s', () => {
    const n = 2000;
    const segs = [];
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      const b = (2 * Math.PI * (i + 1)) / n;
      segs.push(seg([50 * Math.cos(a), 50 * Math.sin(a)], [50 * Math.cos(b), 50 * Math.sin(b)]));
    }
    segs.sort(() => Math.random() - 0.5);
    const t0 = performance.now();
    const { contours, gaps } = buildContours(segs);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(gaps).toEqual([]);
    expect(contours).toHaveLength(1);
    expect(contours[0]).toHaveLength(n);
  });
});

describe('findIntersections', () => {
  it('findet die Kreuzung einer Schleife', () => {
    const r = findIntersections([[[0, 0], [10, 10], [10, 0], [0, 10]]]);
    expect(r).toHaveLength(1);
    expect(r[0].x).toBeCloseTo(5, 6);
    expect(r[0].y).toBeCloseTo(5, 6);
  });

  it('findet keine bei einem sauberen Quadrat', () => {
    expect(findIntersections([[[0, 0], [10, 0], [10, 10], [0, 10]]])).toEqual([]);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, müssen fehlschlagen**

Run: `npx vitest run tests/contours.test.js`
Expected: FAIL (`Cannot find module '../src/contours.js'`)

- [ ] **Step 3: Implementieren**

`src/contours.js`:

```js
export const CLOSE_TOL = 0.01;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function buildContours(polylines, tol = CLOSE_TOL) {
  const contours = [];
  const gaps = [];
  const open = [];

  const pushClosed = (pts) => {
    const c = pts.slice();
    if (c.length > 1 && dist(c[0], c.at(-1)) <= tol) c.pop();
    if (c.length >= 3) contours.push(c);
  };

  for (const pl of polylines) {
    const pts = pl.points;
    if (pts.length < 2) continue;
    if (pl.closed || (pts.length >= 4 && dist(pts[0], pts.at(-1)) <= tol)) pushClosed(pts);
    else if (!(pts.length === 2 && dist(pts[0], pts[1]) <= tol)) open.push(pts.slice());
  }

  while (open.length) {
    let chain = open.pop();
    let grew = true;
    while (grew) {
      grew = false;
      if (chain.length >= 4 && dist(chain[0], chain.at(-1)) <= tol) break;
      for (let i = 0; i < open.length; i++) {
        const o = open[i];
        const head = chain[0];
        const tail = chain.at(-1);
        let merged = null;
        if (dist(tail, o[0]) <= tol) merged = chain.concat(o.slice(1));
        else if (dist(tail, o.at(-1)) <= tol) merged = chain.concat(o.slice(0, -1).reverse());
        else if (dist(head, o.at(-1)) <= tol) merged = o.concat(chain.slice(1));
        else if (dist(head, o[0]) <= tol) merged = o.slice().reverse().concat(chain.slice(1));
        if (merged) {
          chain = merged;
          open.splice(i, 1);
          grew = true;
          break;
        }
      }
    }
    if (chain.length >= 4 && dist(chain[0], chain.at(-1)) <= tol) pushClosed(chain);
    else gaps.push({ x: chain[0][0], y: chain[0][1] }, { x: chain.at(-1)[0], y: chain.at(-1)[1] });
  }

  return { contours, gaps };
}

function cross(p, q, r) {
  return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
}

function crossing(a, b, c, d) {
  const o1 = cross(a, b, c);
  const o2 = cross(a, b, d);
  const o3 = cross(c, d, a);
  const o4 = cross(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) {
    const s = o1 / (o1 - o2);
    return { x: c[0] + s * (d[0] - c[0]), y: c[1] + s * (d[1] - c[1]) };
  }
  return null;
}

export function findIntersections(contours, max = 10) {
  const segs = [];
  contours.forEach((c, ci) => {
    for (let i = 0; i < c.length; i++) {
      const a = c[i];
      const b = c[(i + 1) % c.length];
      segs.push({ a, b, ci, i, n: c.length, minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]) });
    }
  });
  const found = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i];
      const t = segs[j];
      if (s.maxX < t.minX || t.maxX < s.minX || s.maxY < t.minY || t.maxY < s.minY) continue;
      if (s.ci === t.ci) {
        const d = Math.abs(s.i - t.i);
        if (d === 1 || d === s.n - 1) continue;
      }
      const p = crossing(s.a, s.b, t.a, t.b);
      if (p) {
        found.push(p);
        if (found.length >= max) return found;
      }
    }
  }
  return found;
}
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `npx vitest run tests/contours.test.js`
Expected: PASS (7 Tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Konturen verketten, Lücken und Selbstüberschneidungen finden"
```

---

### Task 4: Scheibe mit Fase bauen (`disk.js`)

**Files:**
- Create: `src/disk.js`
- Test: `tests/disk.test.js`

**Interfaces:**
- Consumes: `loadManifold`, `isOk`, `volumeOf`, `scope` aus Task 1.
- Produces (`src/disk.js`):
  - `DEFAULTS = { durchmesser:120, dicke:3, fasenTiefe:1, fasenAufweitung:0.8, fasenOben:true, offsetX:0, offsetY:0, winkel:0, skalierung:1 }`
  - `LAYER = 0.2`
  - `clampState(state): State` (klemmt alle Zahlen, NaN → Default, `fasenTiefe ≤ dicke`, `fasenOben` boolean)
  - `fitContours(contours, durchmesser): { contours, skalierung }` (zentriert auf Bounding-Box-Mitte, skaliert auf 80 % falls nötig)
  - `transformContours(contours, { skalierung, winkel, offsetX, offsetY })`
  - `layerPlan(state, fine = true): { z0:number, h:number, offset:number }[]`
  - `buildDisk(wasm, state, { fine = true } = {}): Manifold` (Aufrufer muss `.delete()` aufrufen)
- `State` = `DEFAULTS` plus `contours: [number, number][][]`.

- [ ] **Step 1: Failing Tests schreiben**

`tests/disk.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest';
import { loadManifold, isOk, volumeOf } from '../src/wasm.js';
import { DEFAULTS, clampState, fitContours, transformContours, layerPlan, buildDisk } from '../src/disk.js';

const square = (s) => [[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, s / 2], [-s / 2, s / 2]];
const diskVolume = (R, h) => 0.5 * 128 * R * R * Math.sin((2 * Math.PI) / 128) * h;
const close = (a, b, rel) => Math.abs(a - b) / b < rel;

let wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

describe('clampState', () => {
  it('ersetzt NaN durch Defaults und klemmt die Fase auf die Dicke', () => {
    const s = clampState({ ...DEFAULTS, contours: [], durchmesser: NaN, fasenTiefe: 5, dicke: 3, skalierung: 99 });
    expect(s.durchmesser).toBe(120);
    expect(s.fasenTiefe).toBe(3);
    expect(s.skalierung).toBe(5);
  });
});

describe('fitContours / transformContours', () => {
  it('zentriert und passt ein zu grosses Motiv auf 80 % ein', () => {
    const big = square(200).map(([x, y]) => [x + 500, y + 500]);
    const { contours, skalierung } = fitContours([big], 120);
    const xs = contours[0].map((p) => p[0]);
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 6);
    const maxR = Math.max(...contours[0].map(([x, y]) => Math.hypot(x, y)));
    expect(maxR * skalierung).toBeCloseTo(0.8 * 60, 6);
  });

  it('lässt kleine Motive unverändert (Skalierung 1)', () => {
    expect(fitContours([square(20)], 120).skalierung).toBe(1);
  });

  it('skaliert, dreht und verschiebt', () => {
    const [[p]] = transformContours([[[1, 0]]], { skalierung: 2, winkel: 90, offsetX: 1, offsetY: 1 });
    expect(p).toBeCloseTo(1, 9);
    expect(transformContours([[[1, 0]]], { skalierung: 2, winkel: 90, offsetX: 1, offsetY: 1 })[0][0][1]).toBeCloseTo(3, 9);
  });
});

describe('layerPlan', () => {
  it('ohne Fase: ein einziger Schnitt über die ganze Dicke', () => {
    expect(layerPlan({ ...DEFAULTS, fasenTiefe: 0 })).toEqual([{ z0: 0, h: 3, offset: 0 }]);
  });
  it('mit Fase oben: Basis plus 5 Schichten mit steigendem Offset', () => {
    const plan = layerPlan(DEFAULTS);
    expect(plan).toHaveLength(6);
    expect(plan[0]).toEqual({ z0: 0, h: 2, offset: 0 });
    expect(plan.at(-1).offset).toBeCloseTo(0.8, 9);
    expect(plan.at(-1).z0 + plan.at(-1).h).toBeCloseTo(3, 9);
  });
  it('grobe Vorschau nutzt höchstens 4 Schichten', () => {
    expect(layerPlan({ ...DEFAULTS, fasenTiefe: 2 }, false).length).toBeLessThanOrEqual(1 + 4);
  });
});

describe('buildDisk', () => {
  it('ohne Fase: Zylindervolumen minus Ausschnitt', () => {
    const d = buildDisk(wasm, { ...DEFAULTS, fasenTiefe: 0, contours: [square(20)] });
    expect(isOk(d)).toBe(true);
    expect(close(volumeOf(d), diskVolume(60, 3) - 400 * 3, 0.002)).toBe(true);
    d.delete();
  });

  it('mit Fase oben: Ausschnitt ist oben breiter als unten', () => {
    const state = { ...DEFAULTS, contours: [square(20)] };
    const d = buildDisk(wasm, state);
    expect(isOk(d)).toBe(true);
    const A = 0.8;
    const area = (a) => 400 + 80 * a + Math.PI * a * a;
    let removed = 400 * 2;
    for (let i = 1; i <= 5; i++) removed += 0.2 * area((A * i) / 5);
    expect(close(volumeOf(d), diskVolume(60, 3) - removed, 0.005)).toBe(true);
    const disc = Math.PI * 3600;
    const holeAt = (z) => {
      const s = d.slice(z);
      const a = s.area();
      s.delete();
      return disc - a;
    };
    expect(holeAt(2.9)).toBeGreaterThan(holeAt(0.5) + 20);
    d.delete();
  });

  it('mit Fase unten: Ausschnitt ist unten breiter als oben', () => {
    const d = buildDisk(wasm, { ...DEFAULTS, fasenOben: false, contours: [square(20)] });
    const disc = Math.PI * 3600;
    const holeAt = (z) => {
      const s = d.slice(z);
      const a = s.area();
      s.delete();
      return disc - a;
    };
    expect(holeAt(0.1)).toBeGreaterThan(holeAt(2.5) + 20);
    d.delete();
  });

  it('ohne Konturen: volle Scheibe', () => {
    const d = buildDisk(wasm, { ...DEFAULTS, contours: [] });
    expect(close(volumeOf(d), diskVolume(60, 3), 0.001)).toBe(true);
    d.delete();
  });

  it('Insel im Ausschnitt bleibt stehen (EvenOdd)', () => {
    const ring = [square(40), square(20)];
    const d = buildDisk(wasm, { ...DEFAULTS, fasenTiefe: 0, contours: ring });
    expect(close(volumeOf(d), diskVolume(60, 3) - (1600 - 400) * 3, 0.002)).toBe(true);
    d.delete();
  });
});
```

- [ ] **Step 2: Tests laufen lassen, müssen fehlschlagen**

Run: `npx vitest run tests/disk.test.js`
Expected: FAIL (`Cannot find module '../src/disk.js'`)

- [ ] **Step 3: Implementieren**

`src/disk.js`:

```js
import { scope } from './wasm.js';

export const DEFAULTS = {
  durchmesser: 120,
  dicke: 3,
  fasenTiefe: 1,
  fasenAufweitung: 0.8,
  fasenOben: true,
  offsetX: 0,
  offsetY: 0,
  winkel: 0,
  skalierung: 1,
};

export const LAYER = 0.2;
const OVERLAP = 0.01;
const FIT = 0.8;

const LIMITS = {
  durchmesser: [30, 250],
  dicke: [1, 20],
  fasenTiefe: [0, 20],
  fasenAufweitung: [0, 5],
  skalierung: [0.05, 5],
  winkel: [-360, 360],
  offsetX: [-200, 200],
  offsetY: [-200, 200],
};

export function clampState(s) {
  const out = { ...s };
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    const v = Number(s[k]);
    out[k] = Number.isFinite(v) && s[k] !== '' && s[k] !== null ? Math.min(hi, Math.max(lo, v)) : DEFAULTS[k];
  }
  out.fasenTiefe = Math.min(out.fasenTiefe, out.dicke);
  out.fasenOben = s.fasenOben !== false;
  out.contours = s.contours || [];
  return out;
}

export function fitContours(contours, durchmesser) {
  const pts = contours.flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const centered = contours.map((c) => c.map(([x, y]) => [x - cx, y - cy]));
  const maxR = Math.max(...centered.flat().map(([x, y]) => Math.hypot(x, y)));
  const limit = (FIT * durchmesser) / 2;
  return { contours: centered, skalierung: maxR > limit ? limit / maxR : 1 };
}

export function transformContours(contours, { skalierung, winkel, offsetX, offsetY }) {
  const a = (winkel * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return contours.map((ct) =>
    ct.map(([x, y]) => {
      const X = x * skalierung;
      const Y = y * skalierung;
      return [X * c - Y * s + offsetX, X * s + Y * c + offsetY];
    }),
  );
}

export function layerPlan(state, fine = true) {
  const { dicke, fasenTiefe, fasenAufweitung, fasenOben } = state;
  const D = Math.min(fasenTiefe, dicke);
  if (D <= 0 || fasenAufweitung <= 0) return [{ z0: 0, h: dicke, offset: 0 }];
  const full = Math.max(1, Math.round(D / LAYER));
  const n = fine ? full : Math.min(4, full);
  const hl = D / n;
  const base = dicke - D;
  const plan = [];
  if (base > 1e-9) plan.push({ z0: fasenOben ? 0 : D, h: base, offset: 0 });
  for (let i = 1; i <= n; i++) {
    const offset = (fasenAufweitung * i) / n;
    plan.push({ z0: fasenOben ? base + (i - 1) * hl : D - i * hl, h: hl, offset });
  }
  return plan;
}

export function buildDisk(wasm, rawState, { fine = true } = {}) {
  const { Manifold, CrossSection } = wasm;
  const state = clampState(rawState);
  const R = state.durchmesser / 2;
  const disk = Manifold.cylinder(state.dicke, R, R, 128);
  if (!state.contours.length) return disk;

  const s = scope();
  try {
    const placed = transformContours(state.contours, state);
    const base = s.t(CrossSection.ofPolygons(placed, 'EvenOdd'));
    const cutters = layerPlan(state, fine).map((l) => {
      const cs = l.offset > 0 ? s.t(base.offset(l.offset, 'Round', 2, 24)) : base;
      const e = s.t(Manifold.extrude(cs, l.h + 2 * OVERLAP));
      return s.t(e.translate([0, 0, l.z0 - OVERLAP]));
    });
    const cutter = s.t(Manifold.union(cutters));
    const result = disk.subtract(cutter);
    disk.delete();
    return result;
  } finally {
    s.done();
  }
}
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `npx vitest run tests/disk.test.js`
Expected: PASS. Falls die `slice`-Methode am Manifold fehlt, in den beiden Fase-Tests das Lochprofil über `d.splitByPlane`/`d.trimByPlane` prüfen; die Volumen-Tests bleiben unverändert.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Scheibe mit Ausschnitt und Fase als Schichtstapel"
```

---

### Task 5: Prüfungen (`checks.js`)

**Files:**
- Create: `src/checks.js`
- Test: `tests/checks.test.js`

**Interfaces:**
- Consumes: `clampState`, `transformContours`, `layerPlan` (Task 4), `findIntersections` (Task 3), `scope` (Task 1).
- Produces:
  - `MIN_WALL = 1`
  - `analyze(wasm, state): { warnings: Warning[], stats: { ausschnitte: number } }`
  - `type Warning = { level: 'rot' | 'gelb', text: string, rim?: true }`

- [ ] **Step 1: Failing Tests schreiben**

`tests/checks.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest';
import { loadManifold } from '../src/wasm.js';
import { DEFAULTS } from '../src/disk.js';
import { analyze } from '../src/checks.js';

let wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const circle = (r, n = 64) => Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)]);
const texts = (r) => r.warnings.map((w) => w.text).join(' | ');

describe('analyze', () => {
  it('meldet nichts bei einem sauberen Kreis', () => {
    const r = analyze(wasm, { ...DEFAULTS, contours: [circle(20)] });
    expect(r.warnings).toEqual([]);
    expect(r.stats.ausschnitte).toBe(1);
  });

  it('warnt vor einem 0,5 mm Steg zwischen zwei Ausschnitten', () => {
    const r = analyze(wasm, { ...DEFAULTS, fasenTiefe: 0, contours: [box(-15, -5, -0.25, 5), box(0.25, -5, 15, 5)] });
    expect(texts(r)).toMatch(/Steg/);
    expect(r.warnings.every((w) => w.level === 'gelb')).toBe(true);
  });

  it('warnt nicht bei einem 3 mm Steg', () => {
    const r = analyze(wasm, { ...DEFAULTS, fasenTiefe: 0, contours: [box(-15, -5, -1.5, 5), box(1.5, -5, 15, 5)] });
    expect(r.warnings).toEqual([]);
    expect(r.stats.ausschnitte).toBe(2);
  });

  it('warnt, wenn das Motiv über den Rand ragt, und markiert den Rand', () => {
    const r = analyze(wasm, { ...DEFAULTS, contours: [box(65, -5, 75, 5)] });
    expect(r.warnings.some((w) => w.rim)).toBe(true);
  });

  it('warnt, wenn die Fase zwei Ausschnitte verschmelzen lässt', () => {
    const r = analyze(wasm, { ...DEFAULTS, contours: [box(-11.2, -5, -0.6, 5), box(0.6, -5, 11.2, 5)] });
    expect(texts(r)).toMatch(/verschmelz/);
  });

  it('meldet Selbstüberschneidung', () => {
    const r = analyze(wasm, { ...DEFAULTS, contours: [[[-10, -10], [10, 10], [10, -10], [-10, 10]]] });
    expect(texts(r)).toMatch(/schneidet sich/);
  });

  it('meldet rot, wenn keine Konturen vorhanden sind', () => {
    const r = analyze(wasm, { ...DEFAULTS, contours: [] });
    expect(r.warnings[0].level).toBe('rot');
  });
});
```

- [ ] **Step 2: Tests laufen lassen, müssen fehlschlagen**

Run: `npx vitest run tests/checks.test.js`
Expected: FAIL (`Cannot find module '../src/checks.js'`)

- [ ] **Step 3: Implementieren**

`src/checks.js`:

```js
import { scope } from './wasm.js';
import { clampState, transformContours } from './disk.js';
import { findIntersections } from './contours.js';

export const MIN_WALL = 1;
const THIN_AREA = 0.2; // mm², kleinere Reste sind Rundungsartefakte an Ecken
const RIM_AREA = 0.01;

const fmt = (v) => v.toFixed(1);

function pieces(s, cs) {
  return cs.decompose().map((p) => s.t(p));
}

function thinSpot(s, material) {
  const r = MIN_WALL / 2;
  const opened = s.t(s.t(material.offset(-r, 'Round', 2, 16)).offset(r, 'Round', 2, 16));
  const thin = s.t(material.subtract(opened));
  const big = pieces(s, thin).filter((p) => p.area() > THIN_AREA);
  if (!big.length) return null;
  big.sort((a, b) => b.area() - a.area());
  const b = big[0].bounds();
  return { x: (b.min[0] + b.max[0]) / 2, y: (b.min[1] + b.max[1]) / 2 };
}

export function analyze(wasm, rawState) {
  const { CrossSection } = wasm;
  const state = clampState(rawState);
  const warnings = [];
  if (!state.contours.length) {
    return { warnings: [{ level: 'rot', text: 'Keine Konturen vorhanden.' }], stats: { ausschnitte: 0 } };
  }

  const s = scope();
  try {
    const placed = transformContours(state.contours, state);
    const cut = s.t(CrossSection.ofPolygons(placed, 'EvenOdd'));
    const disc = s.t(CrossSection.circle(state.durchmesser / 2, 128));
    const count = pieces(s, cut).length;

    for (const p of findIntersections(state.contours, 3)) {
      warnings.push({ level: 'gelb', text: `Eine Kontur schneidet sich selbst bei x=${fmt(p.x)}, y=${fmt(p.y)}.` });
    }

    if (s.t(cut.subtract(disc)).area() > RIM_AREA) {
      warnings.push({ level: 'gelb', rim: true, text: 'Das Motiv ragt über den Scheibenrand.' });
    }

    const thin = thinSpot(s, s.t(disc.subtract(cut)));
    if (thin) {
      warnings.push({ level: 'gelb', text: `Steg unter ${MIN_WALL} mm bei x=${fmt(thin.x)}, y=${fmt(thin.y)}.` });
    }

    if (state.fasenTiefe > 0 && state.fasenAufweitung > 0) {
      const widened = s.t(cut.offset(state.fasenAufweitung, 'Round', 2, 24));
      if (pieces(s, widened).length < count) {
        warnings.push({ level: 'gelb', text: 'Die Fase lässt Ausschnitte verschmelzen. Aufweitung verkleinern oder Motiv auseinanderziehen.' });
      } else if (!thin) {
        const t2 = thinSpot(s, s.t(disc.subtract(widened)));
        if (t2) {
          warnings.push({ level: 'gelb', text: `Steg unter ${MIN_WALL} mm durch die Fase bei x=${fmt(t2.x)}, y=${fmt(t2.y)}.` });
        }
      }
    }

    return { warnings, stats: { ausschnitte: count } };
  } finally {
    s.done();
  }
}
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen**

Run: `npx vitest run tests/checks.test.js`
Expected: PASS (7 Tests). Wenn der saubere Kreis fälschlich einen Steg meldet, `THIN_AREA` erhöhen, bis er sauber ist, und der 0,5-mm-Test weiterhin grün bleibt.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Prüfungen für Stege, Rand, Selbstüberschneidung und Fase"
```

---

### Task 6: STL-Export (`export.js`)

**Files:**
- Create: `src/export.js`
- Test: `tests/export.test.js`

**Interfaces:**
- Produces:
  - `stlBuffer(positions: Float32Array, indices: Uint32Array): ArrayBuffer` (Binär-STL)
  - `downloadStl(name: string, buffer: ArrayBuffer): void` (Browser-Download, nicht unit-getestet)

- [ ] **Step 1: Failing Test schreiben**

`tests/export.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { stlBuffer } from '../src/export.js';

describe('stlBuffer', () => {
  it('schreibt Header, Dreieckszahl, Normale und Eckpunkte', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const buf = stlBuffer(positions, indices);
    expect(buf.byteLength).toBe(84 + 50);
    const dv = new DataView(buf);
    expect(dv.getUint32(80, true)).toBe(1);
    expect(dv.getFloat32(84, true)).toBeCloseTo(0, 6);
    expect(dv.getFloat32(88, true)).toBeCloseTo(0, 6);
    expect(dv.getFloat32(92, true)).toBeCloseTo(1, 6);
    expect(dv.getFloat32(96 + 12, true)).toBeCloseTo(1, 6);
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run tests/export.test.js`
Expected: FAIL (`Cannot find module '../src/export.js'`)

- [ ] **Step 3: Implementieren**

`src/export.js`:

```js
export function stlBuffer(positions, indices) {
  const tris = indices.length / 3;
  const buf = new ArrayBuffer(84 + tris * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, tris, true);
  let o = 84;
  for (let t = 0; t < tris; t++) {
    const a = indices[3 * t] * 3;
    const b = indices[3 * t + 1] * 3;
    const c = indices[3 * t + 2] * 3;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (const v of [nx, ny, nz]) {
      dv.setFloat32(o, v, true);
      o += 4;
    }
    for (const i of [a, b, c]) {
      for (let k = 0; k < 3; k++) {
        dv.setFloat32(o, positions[i + k], true);
        o += 4;
      }
    }
    o += 2;
  }
  return buf;
}

export function downloadStl(name, buffer) {
  const url = URL.createObjectURL(new Blob([buffer], { type: 'model/stl' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
```

- [ ] **Step 4: Test laufen lassen, muss bestehen**

Run: `npx vitest run tests/export.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Binär-STL-Export"
```

---

### Task 7: Rechenpipeline und Worker (`compute.js`, `worker.js`)

**Files:**
- Create: `src/compute.js`, `src/worker.js`
- Test: `tests/compute.test.js`

**Interfaces:**
- Consumes: `buildDisk`, `clampState` (Task 4), `analyze` (Task 5), `isOk`, `volumeOf` (Task 1).
- Produces:
  - `compute(wasm, state, { fine = true } = {}): { positions: Float32Array, indices: Uint32Array, volume: number, warnings: Warning[] | null, stats: { ausschnitte: number, volumeCm3: number, minutes: number } | null }` (bei `fine: false` sind `warnings` und `stats` `null`; bei nicht wasserdichtem Modell wirft es `Error`)
  - `estimateMinutes(volumeMm3): number`
  - Worker-Protokoll: Nachricht `{ id, version, fine, state }` → Antwort `{ id, version, fine, ok: true, positions, indices, warnings, stats }` oder `{ id, version, fine, ok: false, error }`

- [ ] **Step 1: Failing Test schreiben**

`tests/compute.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest';
import { loadManifold } from '../src/wasm.js';
import { DEFAULTS } from '../src/disk.js';
import { compute, estimateMinutes } from '../src/compute.js';

let wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const square = [[-10, -10], [10, -10], [10, 10], [-10, 10]];

describe('compute', () => {
  it('liefert Mesh, Warnungen und Kennzahlen (fein)', () => {
    const r = compute(wasm, { ...DEFAULTS, contours: [square] });
    expect(r.positions.length % 3).toBe(0);
    expect(r.indices.length % 3).toBe(0);
    expect(r.indices.length).toBeGreaterThan(100);
    expect(r.warnings).toEqual([]);
    expect(r.stats.ausschnitte).toBe(1);
    expect(r.stats.volumeCm3).toBeGreaterThan(25);
    expect(r.stats.minutes).toBeGreaterThan(10);
  });

  it('grob: nur Mesh, keine Prüfungen', () => {
    const r = compute(wasm, { ...DEFAULTS, contours: [square] }, { fine: false });
    expect(r.indices.length).toBeGreaterThan(100);
    expect(r.warnings).toBeNull();
    expect(r.stats).toBeNull();
  });

  it('übersteht leere und ungültige Zahlenfelder', () => {
    const r = compute(wasm, { ...DEFAULTS, durchmesser: NaN, dicke: '', contours: [square] });
    expect(r.indices.length).toBeGreaterThan(100);
  });
});

describe('estimateMinutes', () => {
  it('rechnet mit 5 mm³/s', () => {
    expect(estimateMinutes(18000)).toBe(60);
  });
});
```

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npx vitest run tests/compute.test.js`
Expected: FAIL (`Cannot find module '../src/compute.js'`)

- [ ] **Step 3: Implementieren**

`src/compute.js`:

```js
import { buildDisk, clampState } from './disk.js';
import { analyze } from './checks.js';
import { isOk, volumeOf } from './wasm.js';

const FLOW_MM3_PER_S = 5;

export function estimateMinutes(volumeMm3) {
  return Math.round(volumeMm3 / FLOW_MM3_PER_S / 60);
}

export function compute(wasm, rawState, { fine = true } = {}) {
  const state = clampState(rawState);
  const check = fine ? analyze(wasm, state) : null;
  const disk = buildDisk(wasm, state, { fine });
  try {
    if (!isOk(disk)) throw new Error(`Das Modell ist nicht wasserdicht (${disk.status()}).`);
    const mesh = disk.getMesh();
    const stride = mesh.numProp;
    const n = mesh.vertProperties.length / stride;
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      positions[3 * i] = mesh.vertProperties[i * stride];
      positions[3 * i + 1] = mesh.vertProperties[i * stride + 1];
      positions[3 * i + 2] = mesh.vertProperties[i * stride + 2];
    }
    const indices = Uint32Array.from(mesh.triVerts);
    const volume = volumeOf(disk);
    return {
      positions,
      indices,
      volume,
      warnings: check ? check.warnings : null,
      stats: check
        ? { ausschnitte: check.stats.ausschnitte, volumeCm3: volume / 1000, minutes: estimateMinutes(volume) }
        : null,
    };
  } finally {
    disk.delete();
  }
}
```

`src/worker.js`:

```js
import { loadManifold } from './wasm.js';
import { compute } from './compute.js';

const wasmUrl = new URL('../node_modules/manifold-3d/manifold.wasm', import.meta.url).href;
const ready = loadManifold((p) => (p.endsWith('.wasm') ? wasmUrl : p));

self.onmessage = async (e) => {
  const { id, version, fine, state } = e.data;
  try {
    const wasm = await ready;
    const r = compute(wasm, state, { fine });
    self.postMessage({ id, version, fine, ok: true, ...r }, [r.positions.buffer, r.indices.buffer]);
  } catch (err) {
    self.postMessage({ id, version, fine, ok: false, error: String(err?.message || err) });
  }
};
```

- [ ] **Step 4: Tests laufen lassen, müssen bestehen; ganze Suite**

Run: `npx vitest run`
Expected: PASS (alle Tests aus Task 1–7)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Rechenpipeline und Web Worker"
```

---

### Task 8: Oberfläche (Zustand, Vorschau, Bedienung)

**Files:**
- Create: `src/state.js`, `src/preview.js`, `src/main.js`, `src/style.css`
- Modify: `index.html` (Platzhalter ersetzen)

**Interfaces:**
- Consumes: `readDxf` (2), `buildContours`, `findIntersections` (3), `DEFAULTS`, `fitContours`, `clampState` (4), `stlBuffer`, `downloadStl` (6), Worker-Protokoll (7).
- Produces:
  - `createStore(): { get(): State, set(patch, meta?): void, subscribe(fn: (state, meta) => void): () => void }` (`State` = `DEFAULTS` + `contours` + `fileName`; nur `durchmesser`, `dicke`, `fasenTiefe`, `fasenAufweitung`, `fasenOben` werden in `localStorage` gehalten)
  - `createPreview(canvas, { onDrag(dx, dy, phase) }): { setMesh(positions, indices), setDisk(durchmesser, dicke), setRim(bad), showDraft(polylines, gaps), clearDraft() }`

Hinweis: Hier gibt es keine automatischen Browser-Tests (kein Headless-Browser vorhanden). Verifiziert wird per `npm run build` und `vite preview` mit `curl`; die optische Prüfung macht Marc im laufenden Dienst.

- [ ] **Step 1: `index.html`**

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Doodle Disk</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <main>
      <section id="stage">
        <canvas id="view"></canvas>
        <div id="busy" hidden>Rechne …</div>
        <p id="hint">Linke Maustaste: Motiv verschieben · Rechte Maustaste: drehen · Mausrad: zoomen</p>
      </section>
      <aside id="panel">
        <h1>Doodle Disk</h1>

        <div id="drop" tabindex="0" role="button">
          <span id="dropText">DXF hierher ziehen oder klicken</span>
          <input type="file" id="file" accept=".dxf" hidden />
        </div>

        <fieldset>
          <legend>Scheibe</legend>
          <label>Durchmesser (mm)<input type="number" data-key="durchmesser" min="30" max="250" step="1" /></label>
          <label>Dicke (mm)<input type="number" data-key="dicke" min="1" max="20" step="0.2" /></label>
          <label>Fasentiefe (mm)<input type="number" data-key="fasenTiefe" min="0" max="20" step="0.2" /></label>
          <label>Fasen-Aufweitung (mm)<input type="number" data-key="fasenAufweitung" min="0" max="5" step="0.1" /></label>
          <label>Fase
            <select data-key="fasenOben"><option value="1">oben</option><option value="0">unten</option></select>
          </label>
        </fieldset>

        <fieldset>
          <legend>Motiv</legend>
          <label>Grösse<input type="range" data-key="skalierung" min="0.05" max="3" step="0.01" /></label>
          <label>Drehung (°)<input type="range" data-key="winkel" min="-180" max="180" step="1" /></label>
          <label>X (mm)<input type="number" data-key="offsetX" step="0.5" /></label>
          <label>Y (mm)<input type="number" data-key="offsetY" step="0.5" /></label>
          <button type="button" id="center">Zentrieren</button>
        </fieldset>

        <section>
          <h2>Prüfung</h2>
          <ul id="messages"></ul>
          <p id="stats"></p>
        </section>

        <button type="button" id="export" disabled>STL herunterladen</button>
      </aside>
    </main>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>
```

- [ ] **Step 2: `src/style.css`**

```css
:root {
  --bg: #14171c;
  --panel: #1b1f26;
  --line: #2a3038;
  --text: #e8eaed;
  --muted: #98a2b0;
  --accent: #ffb454;
  --red: #ff5c5c;
  --yellow: #ffd24d;
  --green: #5bd98b;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 system-ui, sans-serif; }
main { display: grid; grid-template-columns: 1fr 340px; height: 100vh; }
#stage { position: relative; min-height: 0; }
#view { width: 100%; height: 100%; display: block; touch-action: none; }
#busy { position: absolute; top: 12px; left: 12px; background: var(--panel); border: 1px solid var(--line); padding: 4px 10px; border-radius: 6px; color: var(--muted); }
#hint { position: absolute; bottom: 8px; left: 12px; right: 12px; margin: 0; color: var(--muted); font-size: 12px; }
#panel { background: var(--panel); border-left: 1px solid var(--line); padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
h1 { margin: 0; font-size: 20px; }
h2 { margin: 0 0 6px; font-size: 14px; color: var(--muted); font-weight: 600; }
#drop { border: 2px dashed var(--line); border-radius: 10px; padding: 18px; text-align: center; cursor: pointer; color: var(--muted); }
#drop:hover, #drop:focus, #drop.over { border-color: var(--accent); color: var(--text); outline: none; }
fieldset { border: 1px solid var(--line); border-radius: 8px; display: grid; gap: 8px; margin: 0; }
legend { color: var(--muted); padding: 0 6px; }
label { display: grid; grid-template-columns: 1fr 130px; align-items: center; gap: 8px; }
input, select, button { font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--line); border-radius: 6px; padding: 5px 8px; min-width: 0; }
input[type="range"] { padding: 0; accent-color: var(--accent); }
button { cursor: pointer; }
button:disabled { opacity: 0.4; cursor: not-allowed; }
#export { background: var(--accent); color: #1b1300; border: 0; padding: 10px; font-weight: 700; }
#messages { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
#messages li { padding-left: 18px; position: relative; font-size: 13px; }
#messages li::before { content: ""; position: absolute; left: 0; top: 6px; width: 10px; height: 10px; border-radius: 50%; background: var(--green); }
#messages li.rot::before { background: var(--red); }
#messages li.gelb::before { background: var(--yellow); }
#stats { color: var(--muted); font-size: 13px; margin: 6px 0 0; }
@media (max-width: 800px) {
  main { grid-template-columns: 1fr; grid-template-rows: 55vh auto; height: auto; }
  #panel { border-left: 0; border-top: 1px solid var(--line); }
  #hint { display: none; }
}
```

- [ ] **Step 3: `src/state.js`**

```js
import { DEFAULTS } from './disk.js';

const KEY = 'doodledisk.settings.v1';
const PERSIST = ['durchmesser', 'dicke', 'fasenTiefe', 'fasenAufweitung', 'fasenOben'];

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const out = {};
    for (const k of PERSIST) {
      if (k === 'fasenOben' ? typeof raw[k] === 'boolean' : Number.isFinite(raw[k])) out[k] = raw[k];
    }
    return out;
  } catch {
    return {};
  }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(PERSIST.map((k) => [k, state[k]]))));
  } catch {
    /* Speicher gesperrt: egal */
  }
}

export function createStore() {
  let state = { ...DEFAULTS, contours: [], fileName: '', ...load() };
  const subs = new Set();
  return {
    get: () => state,
    set(patch, meta = {}) {
      state = { ...state, ...patch };
      save(state);
      subs.forEach((fn) => fn(state, meta));
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}
```

- [ ] **Step 4: `src/preview.js`**

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function createPreview(canvas, { onDrag }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14171c);
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 3000);
  camera.up.set(0, 0, 1);
  const home = () => {
    camera.position.set(0, -110, 190);
    controls.target.set(0, 0, 0);
    controls.update();
  };
  const controls = new OrbitControls(camera, canvas);
  controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  home();

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(80, -120, 200);
  scene.add(sun);
  const grid = new THREE.GridHelper(300, 30, 0x2a3038, 0x20252b);
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  const ringPts = Array.from({ length: 128 }, (_, i) => new THREE.Vector3(Math.cos((i / 128) * 2 * Math.PI), Math.sin((i / 128) * 2 * Math.PI), 0));
  const rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: 0xff4d4d }));
  rim.visible = false;
  scene.add(rim);

  const draft = new THREE.Group();
  scene.add(draft);

  let mesh = null;
  let thickness = 3;
  let radius = 60;

  let queued = false;
  const render = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      renderer.render(scene, camera);
    });
  };
  controls.addEventListener('change', render);

  const holder = canvas.parentElement;
  new ResizeObserver(() => {
    const w = holder.clientWidth;
    const h = holder.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    render();
  }).observe(holder);

  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const pt = new THREE.Vector3();
  const hit = (ev) => {
    const r = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    plane.constant = -thickness;
    return ray.ray.intersectPlane(plane, pt) ? pt.clone() : null;
  };
  let last = null;
  canvas.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || ev.pointerType !== 'mouse') return;
    const p = hit(ev);
    if (p && Math.hypot(p.x, p.y) <= radius) {
      last = p;
      canvas.setPointerCapture(ev.pointerId);
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!last) return;
    const p = hit(ev);
    if (!p) return;
    onDrag(p.x - last.x, p.y - last.y, 'move');
    last = p;
  });
  const end = () => {
    if (last) {
      last = null;
      onDrag(0, 0, 'end');
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  function clearDraft() {
    for (const c of [...draft.children]) {
      c.geometry.dispose();
      draft.remove(c);
    }
    if (mesh) mesh.visible = true;
    render();
  }

  return {
    setMesh(positions, indices) {
      clearDraft();
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      g.setIndex(new THREE.BufferAttribute(indices, 1));
      const flat = g.toNonIndexed();
      flat.computeVertexNormals();
      g.dispose();
      if (mesh) {
        mesh.geometry.dispose();
        mesh.geometry = flat;
      } else {
        mesh = new THREE.Mesh(flat, new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.6 }));
        scene.add(mesh);
      }
      render();
    },
    setDisk(durchmesser, dicke) {
      radius = durchmesser / 2;
      thickness = dicke;
      rim.scale.set(radius, radius, 1);
      rim.position.z = dicke + 0.05;
      render();
    },
    setRim(bad) {
      rim.visible = bad;
      render();
    },
    showDraft(polylines, gaps) {
      clearDraft();
      if (mesh) mesh.visible = false;
      const all = polylines.flatMap((p) => p.points);
      for (const pl of polylines) {
        const g = new THREE.BufferGeometry().setFromPoints(pl.points.map(([x, y]) => new THREE.Vector3(x, y, 0)));
        draft.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xcfd6df })));
      }
      if (gaps.length) {
        const g = new THREE.BufferGeometry().setFromPoints(gaps.map((p) => new THREE.Vector3(p.x, p.y, 0.1)));
        draft.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xff4d4d, size: 8, sizeAttenuation: false })));
      }
      const xs = all.map((p) => p[0]);
      const ys = all.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 10);
      camera.position.set(cx, cy - 0.001, size * 1.6);
      controls.target.set(cx, cy, 0);
      controls.update();
      render();
    },
    clearDraft() {
      clearDraft();
      home();
    },
  };
}
```

- [ ] **Step 5: `src/main.js`**

```js
import { readDxf } from './dxf.js';
import { buildContours, findIntersections } from './contours.js';
import { fitContours, clampState } from './disk.js';
import { createStore } from './state.js';
import { createPreview } from './preview.js';
import { stlBuffer, downloadStl } from './export.js';

const $ = (sel) => document.querySelector(sel);
const store = createStore();
const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

function onDrag(dx, dy) {
  const s = store.get();
  store.set({ offsetX: s.offsetX + dx, offsetY: s.offsetY + dy });
}
const preview = createPreview($('#view'), { onDrag });

let version = 0;
let seq = 0;
let inflight = false;
let pending = null;
let timers = [];
let inputMessages = [];
let result = { warnings: [], stats: null };
let lastFine = null;

const round = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : '');

function syncInputs(state, skip) {
  for (const el of document.querySelectorAll('[data-key]')) {
    if (el === skip) continue;
    const k = el.dataset.key;
    el.value = k === 'fasenOben' ? (state.fasenOben ? '1' : '0') : String(round(state[k]));
  }
}

function renderMessages() {
  const all = [...inputMessages, ...result.warnings];
  const ul = $('#messages');
  ul.replaceChildren();
  const items = all.length ? all : [{ level: 'gruen', text: store.get().contours.length ? 'Alles in Ordnung.' : 'Noch keine Datei geladen.' }];
  for (const m of items) {
    const li = document.createElement('li');
    li.className = m.level;
    li.textContent = m.text;
    ul.append(li);
  }
  preview.setRim(all.some((m) => m.rim));
  const st = result.stats;
  $('#stats').textContent = st ? `${st.ausschnitte} Ausschnitt(e) · ${st.volumeCm3.toFixed(1)} cm³ · ca. ${st.minutes} min Druckzeit (Schätzung)` : '';
}

function updateExport() {
  $('#export').disabled = !(lastFine && !result.warnings.some((w) => w.level === 'rot') && !inputMessages.some((m) => m.level === 'rot'));
}

function request(fine) {
  pending = { fine };
  pump();
}

function pump() {
  if (inflight || !pending) return;
  const { fine } = pending;
  pending = null;
  inflight = true;
  $('#busy').hidden = false;
  worker.postMessage({ id: ++seq, version, fine, state: store.get() });
}

worker.onmessage = (e) => {
  const m = e.data;
  inflight = false;
  if (!pending) $('#busy').hidden = true;
  if (!m.ok) {
    result = { warnings: [{ level: 'rot', text: m.error }], stats: null };
    lastFine = null;
    renderMessages();
    updateExport();
  } else {
    preview.setMesh(m.positions, m.indices);
    if (m.fine) {
      result = { warnings: m.warnings, stats: m.stats };
      lastFine = m.version === version ? { positions: m.positions, indices: m.indices } : null;
      renderMessages();
      updateExport();
    }
  }
  pump();
};

function schedule() {
  version++;
  timers.forEach(clearTimeout);
  lastFine = null;
  updateExport();
  if (!store.get().contours.length) return;
  timers = [setTimeout(() => request(false), 30), setTimeout(() => request(true), 350)];
}

store.subscribe((state, meta) => {
  syncInputs(state, meta.from);
  const c = clampState(state);
  preview.setDisk(c.durchmesser, c.dicke);
  schedule();
});

document.addEventListener('input', (e) => {
  const el = e.target.closest?.('[data-key]');
  if (!el) return;
  const k = el.dataset.key;
  store.set({ [k]: k === 'fasenOben' ? el.value === '1' : parseFloat(el.value) }, { from: el });
});

$('#center').addEventListener('click', () => store.set({ offsetX: 0, offsetY: 0 }));

async function loadFile(file) {
  if (!file) return;
  inputMessages = [];
  try {
    const { polylines, ignored, unitFactor } = readDxf(await file.text());
    const { contours, gaps } = buildContours(polylines);
    if (gaps.length) {
      inputMessages = gaps.slice(0, 6).map((g) => ({ level: 'rot', text: `Kontur nicht geschlossen bei x=${g.x.toFixed(2)}, y=${g.y.toFixed(2)}.` }));
      preview.showDraft(polylines, gaps);
      store.set({ contours: [], fileName: '' });
      result = { warnings: [], stats: null };
      renderMessages();
      return;
    }
    if (!contours.length) throw new Error('Keine geschlossene Kontur gefunden.');
    const fit = fitContours(contours, clampState(store.get()).durchmesser);
    for (const p of findIntersections(contours, 3)) {
      inputMessages.push({ level: 'gelb', text: `Eine Kontur schneidet sich selbst bei x=${p.x.toFixed(1)}, y=${p.y.toFixed(1)}.` });
    }
    const skipped = Object.entries(ignored).map(([t, n]) => `${t} ×${n}`).join(', ');
    if (skipped) inputMessages.push({ level: 'gelb', text: `Ignorierte Elemente: ${skipped}.` });
    if (unitFactor !== 1) inputMessages.push({ level: 'gelb', text: `Einheiten umgerechnet (Faktor ${unitFactor} nach mm).` });
    if (fit.skalierung < 1) inputMessages.push({ level: 'gelb', text: `Motiv war zu gross und wurde auf ${(fit.skalierung * 100).toFixed(0)} % eingepasst.` });
    preview.clearDraft();
    $('#dropText').textContent = file.name;
    store.set({ contours: fit.contours, skalierung: fit.skalierung, winkel: 0, offsetX: 0, offsetY: 0, fileName: file.name.replace(/\.dxf$/i, '') });
    renderMessages();
  } catch (err) {
    inputMessages = [{ level: 'rot', text: String(err.message || err) }];
    renderMessages();
  }
}

const drop = $('#drop');
const fileInput = $('#file');
drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && fileInput.click());
fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => { e.preventDefault(); loadFile(e.dataTransfer.files[0]); });

$('#export').addEventListener('click', () => {
  if (!lastFine) return;
  const s = clampState(store.get());
  downloadStl(`${store.get().fileName || 'doodledisk'}-${s.durchmesser}x${s.dicke}.stl`, stlBuffer(lastFine.positions, lastFine.indices));
});

syncInputs(store.get());
{
  const c = clampState(store.get());
  preview.setDisk(c.durchmesser, c.dicke);
}
renderMessages();
```

- [ ] **Step 6: Build und Vorschau prüfen**

```bash
npm run build
```

Expected: Build erfolgreich; `dist/` enthält `index.html`, ein JS-Bundle, ein Worker-Bundle und die `manifold-*.wasm`-Datei.

```bash
ls dist/assets | grep -E '\.wasm$|worker' 
(npx vite preview --port 4173 >/tmp/vp.log 2>&1 &) ; sleep 3
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:4173/
W=$(ls dist/assets | grep -E '\.wasm$' | head -1)
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:4173/assets/$W
pkill -f "vite preview"
```

Expected: `200` für die Startseite, `200 application/wasm` für die WASM-Datei. Falls der Build am Worker oder an `manifold-3d` scheitert (z. B. Node-Module wie `fs`), in `vite.config.js` den Fehler per `build.rollupOptions.external` oder `resolve.alias` auf den Browser-Eintrag lösen und Build wiederholen.

- [ ] **Step 7: Alle Tests, Commit**

```bash
npx vitest run && git add -A && git commit -m "feat: Oberfläche mit 3D-Vorschau, Drag, Prüfungen und STL-Download"
```

---

### Task 9: Docker, nginx, GitHub-Actions und Repo auf GitHub

**Files:**
- Create: `Dockerfile`, `nginx.conf`, `.dockerignore`, `.github/workflows/build.yml`, `README.md`

**Interfaces:**
- Produces: Image `ghcr.io/marcherzig/doodledisk:latest`, das auf Port 80 die statische App ausliefert.

- [ ] **Step 1: Dateien anlegen**

`Dockerfile`:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

`nginx.conf`:

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;

  gzip on;
  gzip_min_length 1024;
  gzip_types text/css application/javascript application/wasm image/svg+xml;

  location ~ \.wasm$ {
    default_type application/wasm;
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  location / {
    try_files $uri /index.html;
    add_header Cache-Control "no-cache";
  }
}
```

`.dockerignore`:

```
node_modules
dist
.git
docs
tests
```

`.github/workflows/build.yml`:

```yaml
name: Build & Push Docker Image

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4
      - name: Set lowercase owner
        run: echo "OWNER=${GITHUB_REPOSITORY_OWNER,,}" >> $GITHUB_ENV
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ghcr.io/${{ env.OWNER }}/doodledisk:latest
```

`README.md`:

```markdown
# Doodle Disk

DXF hochladen, Schablonen-Scheibe mit Fase als STL exportieren. Alles läuft im Browser.

    npm install
    npm run dev
    npm test

Live: https://doodledisk.maegu.be · Design: `docs/superpowers/specs/`
```

- [ ] **Step 2: Image lokal bauen, falls Docker vorhanden**

```bash
command -v docker >/dev/null && docker build -t doodledisk:test . || echo "kein Docker lokal, Build übernimmt GitHub Actions"
```

Expected: Build erfolgreich oder der Hinweis. Mit Docker zusätzlich: `docker run --rm -d -p 8089:80 --name dd doodledisk:test; sleep 2; curl -sI http://localhost:8089/ | head -1; docker rm -f dd` → `HTTP/1.1 200 OK`.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: Dockerfile, nginx, GitHub-Actions-Build"
```

- [ ] **Step 4: Repo auf GitHub anlegen und pushen (vorher kurz bei Marc bestätigen lassen)**

Das veröffentlicht den Code (öffentliches Repo). Nach Bestätigung:

```bash
cd /mnt/c/Users/mherz/git/doodledisk
gh repo create MarcHerzig/doodledisk --public --source . --remote origin 2>&1 || echo "gh nicht verfügbar: Marc legt das leere Repo MarcHerzig/doodledisk auf GitHub an"
git remote -v
timeout 60 "/mnt/c/Program Files/Git/cmd/git.exe" push -u origin master:main
```

Hinweis: Die Linux-`git` hat keine GitHub-Zugangsdaten, daher über Windows-Git pushen. Der Branch muss `main` heissen, damit der Workflow läuft.

- [ ] **Step 5: Workflow und Paket prüfen**

```bash
gh run list --repo MarcHerzig/doodledisk --limit 1 2>&1 | head -3
```

Expected: Lauf `completed success`. Danach in GitHub unter *Profil → Packages → doodledisk → Package settings* die Sichtbarkeit auf **Public** stellen (ghcr-Pakete starten privat). Alternativ im Deployment (Task 10) `imagePullSecrets: [{name: ghcr-kavent-simplepage}]` ergänzen.

---

### Task 10: Cluster-Deployment, Cloudflare und Wiki

**Files (Repo `argo-homelab`, `/mnt/c/Users/mherz/git/argo-homelab`):**
- Create: `apps/doodledisk/deployment.yaml`, `apps/doodledisk/service.yaml`, `apps/doodledisk/ingress.yaml`, `apps/doodledisk/kustomization.yaml`, `bootstrap/applications/doodledisk.yaml`
- Modify: `bootstrap/kustomization.yaml` (Eintrag unter `# Apps`)
- Create/Modify (Repo `wiki-homelab`): Seite für den Dienst plus Nav-Eintrag

**Interfaces:**
- Consumes: Image aus Task 9, Muster von `apps/lm-motorsport`.
- Produces: `https://doodledisk.maegu.be` erreichbar.

- [ ] **Step 1: Manifeste in argo-homelab anlegen**

`apps/doodledisk/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: doodledisk
spec:
  replicas: 1
  selector:
    matchLabels:
      app: doodledisk
  template:
    metadata:
      labels:
        app: doodledisk
    spec:
      containers:
        - name: doodledisk
          image: ghcr.io/marcherzig/doodledisk:latest
          imagePullPolicy: Always
          ports:
            - containerPort: 80
          readinessProbe:
            httpGet:
              path: /
              port: 80
          resources:
            requests:
              cpu: 50m
              memory: 32Mi
            limits:
              cpu: 200m
              memory: 64Mi
```

`apps/doodledisk/service.yaml`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: doodledisk
spec:
  selector:
    app: doodledisk
  ports:
    - name: http
      port: 80
      targetPort: 80
```

`apps/doodledisk/ingress.yaml`:

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: doodledisk
spec:
  entryPoints:
    - websecure
  routes:
    - match: Host(`doodledisk.maegu.be`)
      kind: Rule
      services:
        - name: doodledisk
          port: 80
  tls:
    certResolver: letsencrypt-cloudflare
```

`apps/doodledisk/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: applications

resources:
  - deployment.yaml
  - service.yaml
  - ingress.yaml
```

`bootstrap/applications/doodledisk.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: doodledisk
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: https://github.com/MarcHerzig/argo-homelab.git
    targetRevision: main
    path: apps/doodledisk
  destination:
    server: https://kubernetes.default.svc
    namespace: applications
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

In `bootstrap/kustomization.yaml` direkt nach der Zeile `  - applications/lm-motorsport.yaml` einfügen: `  - applications/doodledisk.yaml`.

- [ ] **Step 2: Manifeste prüfen**

```bash
cd /mnt/c/Users/mherz/git/argo-homelab
kubectl kustomize apps/doodledisk | head -60
kubectl kustomize bootstrap >/dev/null && echo "bootstrap ok"
git diff -b --stat
```

Expected: gerenderte Manifeste ohne Fehler, `bootstrap ok`, im Diff nur die neuen Dateien und die eine Zeile in `bootstrap/kustomization.yaml` (CRLF-Rauschen ignorieren).

- [ ] **Step 3: Cloudflare — erst DNS-Record setzen (Token `cloudflare-maegu-dns.token`)**

```bash
ACC=487c7561b5af68b43f088422138b1c9d
TUN=ffe34161-1cab-4d3a-9530-dfd5a7d175b7
DNS=$(cat ~/.claude/.secrets/cloudflare-maegu-dns.token)
ZONE=$(curl -s -H "Authorization: Bearer $DNS" "https://api.cloudflare.com/client/v4/zones?name=maegu.be" | jq -r '.result[0].id')
curl -s -X POST -H "Authorization: Bearer $DNS" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" \
  --data "{\"type\":\"CNAME\",\"name\":\"doodledisk\",\"content\":\"$TUN.cfargotunnel.com\",\"proxied\":true}" | jq '{success, errors}'
```

Expected: `"success": true`. Den Namen `doodledisk.maegu.be` erst nach diesem Schritt abfragen (sonst cacht der Router 30 Min NXDOMAIN).

- [ ] **Step 4: Cloudflare — Tunnel-Route ergänzen (Token `cloudflare-maegu.token`)**

Nie die Konfiguration blind per PUT ersetzen. Erst sichern, dann nur einen Eintrag ergänzen.

```bash
TOK=$(cat ~/.claude/.secrets/cloudflare-maegu.token)
API="https://api.cloudflare.com/client/v4/accounts/$ACC/cfd_tunnel/$TUN/configurations"
B=/tmp/claude-1000/-mnt-c-Users-mherz/6c796dfe-d37d-46e6-9582-bfe229c858ab/scratchpad
curl -s -H "Authorization: Bearer $TOK" "$API" > $B/tunnel-backup.json
jq '.result.config.ingress | length' $B/tunnel-backup.json
jq '.result.config.ingress[] | select(.hostname=="lm-motorsport.maegu.be")' $B/tunnel-backup.json
```

Expected: eine Zahl > 1 und der Eintrag von `lm-motorsport.maegu.be`. Ist die Zahl `0` oder `null`, fehlen die Rechte: **abbrechen und melden**, nicht schreiben. Danach den neuen Eintrag als Kopie des lm-motorsport-Eintrags (nur Hostname getauscht, vor dem Catch-all) bauen:

```bash
jq '{config: (.result.config | .ingress = (.ingress[:-1] + [ (.ingress[] | select(.hostname=="lm-motorsport.maegu.be") | .hostname="doodledisk.maegu.be") ] + .ingress[-1:]))}' $B/tunnel-backup.json > $B/tunnel-new.json
diff <(jq -S '.result.config.ingress' $B/tunnel-backup.json) <(jq -S '.config.ingress' $B/tunnel-new.json)
```

Expected: der Diff zeigt genau einen hinzugefügten Eintrag `doodledisk.maegu.be`. Erst dann schreiben und gegenprüfen:

```bash
curl -s -X PUT -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" "$API" --data @$B/tunnel-new.json | jq '{success, errors}'
curl -s -H "Authorization: Bearer $TOK" "$API" | jq '.result.config.ingress | length'
```

Expected: `success: true`, Länge = vorherige Länge + 1.

- [ ] **Step 5: argo-homelab committen und pushen**

```bash
cd /mnt/c/Users/mherz/git/argo-homelab
git add apps/doodledisk bootstrap/applications/doodledisk.yaml bootstrap/kustomization.yaml
git commit -m "feat: doodledisk App (nginx, IngressRoute doodledisk.maegu.be)"
timeout 60 "/mnt/c/Program Files/Git/cmd/git.exe" push origin main
```

- [ ] **Step 6: Rollout prüfen**

```bash
kubectl get application doodledisk -n argocd
kubectl get pods -n applications -l app=doodledisk
curl -s -o /dev/null -w '%{http_code}\n' https://doodledisk.maegu.be/
```

Expected: Application `Synced/Healthy`, Pod `Running`, HTTP `200`. Falls das Image nicht gezogen werden kann (`ImagePullBackOff`), ist das ghcr-Paket noch privat: Paket auf Public stellen (Task 9, Step 5). Spätere Image-Updates: `latest` wird nur beim Pod-Start gezogen, also den Pod löschen (`kubectl delete pod -n applications -l app=doodledisk`), das ist ArgoCD-konform.

- [ ] **Step 7: Wiki-Eintrag**

```bash
cd /mnt/c/Users/mherz/git/wiki-homelab
grep -rn "lm-motorsport" docs mkdocs.yml | head
```

Danach nach demselben Muster wie der lm-motorsport-Eintrag eine Seite `docs/<passende-kategorie>/doodledisk.md` mit diesem Inhalt anlegen und in `mkdocs.yml` verlinken:

```markdown
# Doodle Disk

| | |
|---|---|
| URL | https://doodledisk.maegu.be |
| Zweck | DXF-Motiv hochladen, Schablonen-Scheibe mit Fase als STL für den 3D-Druck erzeugen |
| Aufbau | Statische App (Vite, `manifold-3d` im Browser), nginx-Pod, kein Backend, keine PVC |
| Namespace | applications |
| Image | `ghcr.io/marcherzig/doodledisk:latest` (GitHub Actions, Repo `MarcHerzig/doodledisk`) |
| ArgoCD | `argo-homelab/apps/doodledisk` |
| Cloudflare | CNAME `doodledisk` → Tunnel `homelab`, Route im Tunnel, kein Access |
| Update | Push auf `main` baut das Image, dann Pod löschen (`latest` wird beim Start gezogen) |
```

Committen und pushen (`git.exe`), das Wiki ist nach ca. 60 s live.

- [ ] **Step 8: Abschluss melden**

Marc melden: Link, Stand (Tests grün, Build ok, Dienst erreichbar) und dass die optische Prüfung der Vorschau mit einem echten DXF bei ihm liegt (kein Headless-Browser vorhanden).

---

## Self-Review

**Spec-Abdeckung:** DXF-Leser (T2), Verkettung, Lücken, Selbstüberschneidung (T3), Scheibe, Fase, Skalierung/Drehung/Offset, Einpassen 80 %, Insel via EvenOdd (T4), Steg-, Rand-, Fasen-Prüfungen (T5), STL (T6), Worker, grobe/feine Fase, Druckdauer (T7), Oberfläche mit Drop-Zone, Reglern, Maus-Drag, Ampel, Export, `localStorage` (T8), Image, nginx, CI (T9), Argo, Cloudflare, Wiki (T10). Zoll-Umrechnung in T2, Ignorierte Elemente in T2/T8.

**Abweichungen von der Spec, bewusst:** Aussenkontur/Inseln werden nicht einzeln klassifiziert, sondern über die EvenOdd-Füllregel richtig behandelt. Die Kennzahl „dünnster Steg“ entfällt, es gibt nur die Warnung mit Position. „Motiv ragt über den Rand“ ist `gelb` (Export bleibt möglich, Rand wird rot gezeichnet), nur Lücken und fehlende Konturen sind `rot`.

**Typkonsistenz:** `Polyline`, `buildContours`, `findIntersections`, `DEFAULTS`, `clampState`, `fitContours`, `transformContours`, `layerPlan`, `buildDisk`, `analyze`, `compute`, `estimateMinutes`, `stlBuffer`, `downloadStl`, `createStore`, `createPreview` heissen in allen Tasks gleich. Worker-Nachrichtenfelder `{id, version, fine, ok, positions, indices, warnings, stats}` stimmen in T7 und T8 überein.
