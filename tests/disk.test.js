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

  it('leere Eingabe ergibt Skalierung 1', () => {
    expect(fitContours([], 120)).toEqual({ contours: [], skalierung: 1 });
  });

  it('verträgt 200000 Punkte ohne Stack-Überlauf', () => {
    const line = Array.from({ length: 200000 }, (_, i) => [i * 0.001, (i % 7) * 0.01]);
    expect(() => fitContours([line], 120)).not.toThrow();
  });

  it('skaliert, dreht und verschiebt', () => {
    const [[[x, y]]] = transformContours([[[1, 0]]], { skalierung: 2, winkel: 90, offsetX: 1, offsetY: 1 });
    expect(x).toBeCloseTo(1, 9);
    expect(y).toBeCloseTo(3, 9);
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

  it('Fehlerpfad: wirft bei NaN-Konturen, danach funktioniert buildDisk weiter', () => {
    const bad = [[[0, 0], [NaN, 1], [1, NaN]]];
    let threw = false;
    let r;
    try {
      r = buildDisk(wasm, { ...DEFAULTS, contours: bad });
    } catch {
      threw = true;
    }
    if (!threw) r.delete();
    const d = buildDisk(wasm, { ...DEFAULTS, contours: [square(20)] });
    expect(isOk(d)).toBe(true);
    d.delete();
  });
});
