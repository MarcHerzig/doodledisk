import { describe, it, expect, beforeAll } from 'vitest';
import { loadManifold, scope } from '../src/wasm.js';
import { numberCrossSection, numberAt } from '../src/glyphs.js';
import { GH, GW, GG } from '../src/setparams.js';

let wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const areaOf = (str) => {
  const s = scope();
  try {
    return s.t(numberCrossSection(wasm, s, str)).area();
  } finally {
    s.done();
  }
};

describe('glyphs', () => {
  it('jede Ziffer ergibt eine nicht leere Fläche', () => {
    for (let d = 0; d <= 9; d++) expect(areaOf(String(d))).toBeGreaterThan(0);
  });
  it('8 hat die grösste Fläche, 1 ist kleiner als 8', () => {
    const a = Array.from({ length: 10 }, (_, d) => areaOf(String(d)));
    expect(a[8]).toBe(Math.max(...a));
    expect(a[1]).toBeLessThan(a[8]);
  });
  it('mehrstellige Zahl ist zentriert und hat die erwartete Breite', () => {
    const s = scope();
    try {
      const b = s.t(numberCrossSection(wasm, s, '88')).bounds();
      expect(b.min[0] + b.max[0]).toBeCloseTo(0, 5);
      expect(b.max[0] - b.min[0]).toBeCloseTo(2 * GW + GG, 5);
      expect(b.max[1] - b.min[1]).toBeCloseTo(GH, 5);
      expect(b.min[1] + b.max[1]).toBeCloseTo(0, 5);
    } finally {
      s.done();
    }
  });
  it('numberAt setzt die Zahl auf Polarposition, oben zeigt nach aussen', () => {
    const s = scope();
    try {
      const b = s.t(numberAt(wasm, s, 4, 0, 54)).bounds(); // psi=0: Mitte bei (54,0), Drehung -90
      expect((b.min[0] + b.max[0]) / 2).toBeCloseTo(54, 6);
      expect((b.min[1] + b.max[1]) / 2).toBeCloseTo(0, 6);
      expect(b.max[0] - b.min[0]).toBeCloseTo(GH, 6);
    } finally {
      s.done();
    }
  });
});
