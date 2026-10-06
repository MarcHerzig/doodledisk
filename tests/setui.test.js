import { describe, it, expect } from 'vitest';
import { needsContours, exportName, fitLimit, rimRadius, shrinkSkalierung } from '../src/setui.js';
import { FIT_P } from '../src/setparams.js';

const set = { modus: 'set', durchmesser: 100, dicke: 3, zahlen: 12 };
const einzel = { ...set, modus: 'einzel' };

describe('setui', () => {
  it('needsContours', () => {
    expect(needsContours('schablone', 'set')).toBe(true);
    expect(needsContours('abdeckung', 'set')).toBe(false);
    expect(needsContours('halter', 'set')).toBe(false);
    expect(needsContours('abdeckung', 'einzel')).toBe(true);
  });
  it('Dateinamen', () => {
    expect(exportName('schablone', einzel, 'cat')).toBe('cat-100x3.stl');
    expect(exportName('schablone', set, 'cat')).toBe('cat-schablone-100x3.stl');
    expect(exportName('abdeckung', set, 'cat')).toBe('cat-abdeckung-12.stl');
    expect(exportName('halter', set, '')).toBe('doodledisk-halter-12.stl');
    expect(exportName('schablone', einzel, '')).toBe('doodledisk-100x3.stl');
  });
  it('fitLimit und rimRadius', () => {
    expect(fitLimit(einzel)).toBeUndefined();
    expect(fitLimit(set)).toBeCloseTo(FIT_P * 38, 9);
    expect(rimRadius(set)).toBe(38);
    expect(rimRadius(einzel)).toBe(50);
  });
  it('shrinkSkalierung verkleinert, vergrössert nie', () => {
    const c = [[[0, 0], [40, 0], [40, 10]]];
    expect(shrinkSkalierung(c, 1, undefined)).toBe(1);
    expect(shrinkSkalierung(c, 1, 20)).toBeCloseTo(20 / Math.hypot(40, 10), 9);
    expect(shrinkSkalierung(c, 0.2, 20)).toBe(0.2);
    expect(shrinkSkalierung([], 1, 20)).toBe(1);
  });
});
