import { describe, it, expect, beforeAll } from 'vitest';
import { loadManifold, scope, isOk } from '../src/wasm.js';
import { DEFAULTS } from '../src/disk.js';
import { buildHolder } from '../src/holder.js';
import { A4_W, A4_H, CLIP_T, KLEMM_SPIEL, RING_SPIEL, TAB_D, ENGRAVE } from '../src/setparams.js';

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

  it('Pfeil ist auf der Oberkante graviert (Bump bei 90 Grad)', () => {
    const m = buildHolder(wasm, st());
    const s = scope();
    try {
      const Ro = 60 + RING_SPIEL + 3;
      // Pfeilmitte: Spitze bei Ro, Basis bei Ro+5; Probe nahe der Basis-Mitte
      const probe = s.t(wasm.CrossSection.square([1, 1], true).translate(0, Ro + 3));
      const top = s.t(m.slice(RING_H - ENGRAVE / 2));
      const deeper = s.t(m.slice(RING_H - 2 * ENGRAVE));
      expect(s.t(top.intersect(probe)).area()).toBeCloseTo(0, 6);
      expect(s.t(deeper.intersect(probe)).area()).toBeCloseTo(1, 6);
      // neben dem Pfeil bleibt der Bump oben voll
      const beside = s.t(wasm.CrossSection.square([1, 1], true).translate(5, Ro + 3));
      expect(s.t(top.intersect(beside)).area()).toBeCloseTo(1, 6);
    } finally {
      m.delete();
      s.done();
    }
  });

  it('Klemmspalt: im Spalt nur die Rückwand, kein Armmaterial', () => {
    const m = buildHolder(wasm, st());
    const s = scope();
    try {
      const cs = s.t(m.slice(-(4 + KLEMM_SPIEL) / 2));
      const b = cs.bounds();
      expect(b.min[0]).toBeCloseTo(-A4_W / 2 - CLIP_T, 4);
      expect(b.max[0]).toBeCloseTo(-A4_W / 2, 4);
    } finally {
      m.delete();
      s.done();
    }
  });

  it('D=200 ist für beide Seiten wasserdicht, Set-Modus klemmt D=250 auf 200', () => {
    for (const seite of ['links', 'unten']) {
      const m = buildHolder(wasm, st({ durchmesser: 200, seite }));
      expect(isOk(m)).toBe(true);
      m.delete();
    }
    const m = buildHolder(wasm, st({ durchmesser: 250 }));
    expect(isOk(m)).toBe(true);
    m.delete();
  });
});
