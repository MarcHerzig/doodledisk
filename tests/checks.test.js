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

  it('warnt vor einem losen Teil ohne Steg (Insel)', () => {
    const r = analyze(wasm, { ...DEFAULTS, fasenTiefe: 0, contours: [box(-20, -20, 20, 20), box(-5, -5, 5, 5)] });
    expect(texts(r)).toMatch(/fällt heraus/);
  });

  it('warnt vor einer Insel in einem Stern', () => {
    const star = Array.from({ length: 10 }, (_, i) => {
      const a = (Math.PI * i) / 5;
      const rr = i % 2 ? 12 : 28;
      return [rr * Math.cos(a), rr * Math.sin(a)];
    });
    const r = analyze(wasm, { ...DEFAULTS, fasenTiefe: 0, contours: [star, circle(5)] });
    expect(texts(r)).toMatch(/fällt heraus/);
  });

  it('warnt nicht, wenn die Insel über einen Steg-Schlitz verbunden ist', () => {
    // C-foermiger Ausschnitt: aeusseres Quadrat, innere Insel, Schlitz 2 mm breit bei y=0 nach rechts
    const c = [[20, -1], [20, -20], [-20, -20], [-20, 20], [20, 20], [20, 1], [5, 1], [5, 5], [-5, 5], [-5, -5], [5, -5], [5, -1]];
    const r = analyze(wasm, { ...DEFAULTS, fasenTiefe: 0, contours: [c] });
    expect(texts(r)).not.toMatch(/fällt heraus/);
  });
});
