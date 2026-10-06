import { describe, it, expect, beforeAll } from 'vitest';
import { loadManifold, scope, isOk, volumeOf } from '../src/wasm.js';
import { DEFAULTS } from '../src/disk.js';
import { buildCover } from '../src/cover.js';
import { numberAt } from '../src/glyphs.js';
import { sectorAngles, WIN_OVERLAP_DEG, ENGRAVE, T_C, BAND } from '../src/setparams.js';

let wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const R_P = 60 - BAND;
const st = (n) => ({ ...DEFAULTS, modus: 'set', zahlen: n, contours: [] });

describe('buildCover', () => {
  for (const n of [2, 12, 36]) {
    it(`N=${n}: wasserdicht, ein Stück, Volumen stimmt`, () => {
      const m = buildCover(wasm, st(n));
      try {
        expect(isOk(m)).toBe(true);
        const parts = m.decompose();
        expect(parts.length).toBe(1);
        parts.forEach((p) => p.delete());
        const { alpha } = sectorAngles(n);
        const disc = Math.PI * 59.8 * 59.8 * T_C;
        const win = ((alpha + 2 * WIN_OVERLAP_DEG) / 360) * Math.PI * R_P * R_P * T_C;
        const upper = disc - win;
        const v = volumeOf(m);
        expect(v).toBeLessThan(upper);
        // Gravuren nehmen höchstens ein paar Prozent weg
        expect(v).toBeGreaterThan(upper * 0.95);
        expect(Math.abs(v - upper) / upper).toBeLessThan(0.1);
        const bb = m.boundingBox();
        expect(bb.min[2]).toBeCloseTo(0, 6);
        expect(bb.max[2]).toBeCloseTo(T_C, 6);
      } finally {
        m.delete();
      }
    });
  }

  it('Volumen = Scheibe - Fenster - Gravuren innerhalb 1 %', () => {
    const n = 12;
    const m = buildCover(wasm, st(n));
    const s = scope();
    try {
      let engr = 0;
      for (let k = 1; k <= n; k++) engr += s.t(numberAt(wasm, s, k, sectorAngles(n).psi(k), R_P + BAND / 2)).area() * ENGRAVE;
      const { alpha } = sectorAngles(n);
      const R = 59.8;
      const disc = 0.5 * 128 * R * R * Math.sin((2 * Math.PI) / 128) * T_C;
      const win = ((alpha + 2 * WIN_OVERLAP_DEG) / 360) * Math.PI * R_P * R_P * T_C;
      const exp = disc - win - engr;
      expect(Math.abs(volumeOf(m) - exp) / exp).toBeLessThan(0.01);
    } finally {
      m.delete();
      s.done();
    }
  });

  it('Fenster bei 90 Grad offen, bei 270 Grad geschlossen', () => {
    const m = buildCover(wasm, st(12));
    const s = scope();
    try {
      const cs = s.t(m.slice(T_C / 2));
      const probe = (x, y) => s.t(cs.intersect(s.t(wasm.CrossSection.square([1, 1], true).translate(x, y)))).area();
      expect(probe(0, 30)).toBeCloseTo(0, 6);
      expect(probe(0, -30)).toBeCloseTo(1, 6);
    } finally {
      m.delete();
      s.done();
    }
  });

  it('Zahl k liegt auf psi_k (Gravur dort, nicht daneben)', () => {
    const n = 12;
    const m = buildCover(wasm, st(n));
    const s = scope();
    try {
      const cs = s.t(m.slice(T_C - ENGRAVE / 2));
      const full = s.t(m.slice(T_C / 2 - 0.1));
      const r = R_P + BAND / 2;
      for (const k of [1, 2, 5, 12]) {
        const psi = (sectorAngles(n).psi(k) * Math.PI) / 180;
        const disc = (a) => s.t(wasm.CrossSection.circle(4, 32)).translate(r * Math.cos(a), r * Math.sin(a));
        const near = s.t(disc(psi));
        const lost = s.t(s.t(full.intersect(near)).subtract(s.t(cs.intersect(near)))).area();
        expect(lost).toBeGreaterThan(1);
        // auf einem Winkel dazwischen keine Gravur
        const between = s.t(disc(psi + Math.PI / n));
        const lost2 = s.t(s.t(full.intersect(between)).subtract(s.t(cs.intersect(between)))).area();
        expect(lost2).toBeCloseTo(0, 6);
      }
    } finally {
      m.delete();
      s.done();
    }
  });
});
