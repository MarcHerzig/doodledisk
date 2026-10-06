import { describe, it, expect } from 'vitest';
import { sectorAngles, WIN_OVERLAP_DEG, BAND, KEY_W } from '../src/setparams.js';

describe('sectorAngles', () => {
  it('liefert alpha, Fensterhalbwinkel, psi und phi', () => {
    const a = sectorAngles(12);
    expect(a.alpha).toBe(30);
    expect(a.windowHalf).toBe(15 + WIN_OVERLAP_DEG);
    expect(a.psi(1)).toBe(90);
    expect(a.psi(4)).toBe(0);
    expect(a.phi(1)).toBe(90);
    expect(a.phi(4)).toBe(180);
  });
  it('begrenzt das Fenster bei N=2 auf höchstens 358 Grad', () => {
    expect(sectorAngles(2).windowHalf).toBeLessThanOrEqual(179);
    expect(sectorAngles(36).windowHalf).toBeCloseTo(6, 9);
  });
  it('exportiert Konstanten', () => {
    expect(BAND).toBe(12);
    expect(KEY_W).toBe(6.4);
  });
});
