import { describe, it, expect, beforeAll } from 'vitest';
import { loadManifold, scope, isOk } from '../src/wasm.js';
import { DEFAULTS } from '../src/disk.js';
import { buildHolder } from '../src/holder.js';
import { A4_W, A4_H, CLIP_T, KLEMM_SPIEL, RING_SPIEL, TAB_D } from '../src/setparams.js';

let wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const st = (o = {}) => ({ ...DEFAULTS, modus: 'set', contours: [], blockdicke: 4, ...o });
const RING_H = 3 + 2 + 0.6;

describe('buildHolder', () => {
  it('wasserdicht, ein Stück, Bounding-Box der Gebrauchslage', () => {
    const m = buildHolder(wasm, st({ seite: 'links' }));
    try {
      expect(isOk(m)).toBe(true);
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((p) => p.delete());
      const bb = m.boundingBox();
      expect(bb.min[0]).toBeCloseTo(-A4_W / 2 - CLIP_T, 6);
      expect(bb.min[2]).toBeCloseTo(-(4 + KLEMM_SPIEL) - CLIP_T, 6);
      expect(bb.max[2]).toBeCloseTo(RING_H, 6);
    } finally {
      m.delete();
    }
  });

  it('Seite unten: um 90 Grad gedrehte Lage (Klemme an der unteren Kante)', () => {
    const m = buildHolder(wasm, st({ seite: 'unten' }));
    try {
      expect(isOk(m)).toBe(true);
      const bb = m.boundingBox();
      expect(bb.min[1]).toBeCloseTo(-A4_H / 2 - CLIP_T, 6);
      expect(bb.min[0]).toBeGreaterThan(-70);
      expect(bb.max[2]).toBeCloseTo(RING_H, 6);
      expect(bb.min[2]).toBeCloseTo(-(4 + KLEMM_SPIEL) - CLIP_T, 6);
    } finally {
      m.delete();
    }
  });

  it('forPrint: z-Minimum 0, Ringoberkante unten', () => {
    const m = buildHolder(wasm, st(), { forPrint: true });
    try {
      expect(isOk(m)).toBe(true);
      const bb = m.boundingBox();
      expect(bb.min[2]).toBeCloseTo(0, 6);
      expect(bb.max[2]).toBeCloseTo(RING_H + 4 + KLEMM_SPIEL + CLIP_T, 6);
    } finally {
      m.delete();
    }
  });

  it('Ring innen frei bis auf die Passnase bei 90 Grad', () => {
    const m = buildHolder(wasm, st());
    const s = scope();
    try {
      const cs = s.t(m.slice(1));
      const Ri = 60 + RING_SPIEL;
      const inner = s.t(wasm.CrossSection.circle(Ri - TAB_D - 0.3, 128));
      expect(s.t(cs.intersect(inner)).area()).toBeCloseTo(0, 6);
      const tab = s.t(wasm.CrossSection.square([2, 0.5], true).translate(0, Ri - 0.6));
      expect(s.t(cs.intersect(tab)).area()).toBeCloseTo(1, 6);
      const free = s.t(wasm.CrossSection.square([2, 0.5], true).translate(0, -(Ri - 0.6)));
      expect(s.t(cs.intersect(free)).area()).toBeCloseTo(0, 6);
    } finally {
      m.delete();
      s.done();
    }
  });
});
