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
