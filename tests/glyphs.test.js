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

  it('oben der Ziffer zeigt radial nach aussen (7: Segment a aussen, Fuss innen)', () => {
    for (const ang of [90, 0, 200]) {
      const s = scope();
      try {
        const r = 54;
        const cs = s.t(numberAt(wasm, s, 7, ang, r));
        const a = (ang * Math.PI) / 180;
        const ux = Math.cos(a), uy = Math.sin(a);
        const probe = (rad) => s.t(cs.intersect(s.t(wasm.CrossSection.circle(0.8, 16).translate(ux * rad, uy * rad)))).area();
        // Segment a liegt bei +GH/2 - GS/2 radial aussen; unten (nur Segment c rechts) keine Mitte
        expect(probe(r + GH / 2 - 0.45)).toBeGreaterThan(0.5);
        expect(probe(r - GH / 2 + 0.45)).toBeCloseTo(0, 6);
        // Fuss von 7 liegt tangential rechts (bei Drehung -90 relativ zu ang): unten Mitte leer
      } finally {
        s.done();
      }
    }
  });
});
