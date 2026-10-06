import { describe, it, expect } from 'vitest';
import { needsContours, exportName, fitLimit, rimRadius, shrinkSkalierung, readFieldValue, formatFieldValue } from '../src/setui.js';
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
  it('Feldwerte: seite bleibt ein String', () => {
    expect(readFieldValue('seite', 'unten')).toBe('unten');
    expect(formatFieldValue('seite', 'unten')).toBe('unten');
    expect(formatFieldValue('seite', 'links')).toBe('links');
    expect(formatFieldValue('seite', 'quatsch')).toBe('links');
  });
  it('Feldwerte: Zahlen und fasenOben', () => {
    expect(readFieldValue('zahlen', '12')).toBe(12);
    expect(readFieldValue('blockdicke', '4.5')).toBe(4.5);
    expect(Number.isNaN(readFieldValue('durchmesser', ''))).toBe(true);
    expect(formatFieldValue('durchmesser', 12.3456)).toBe('12.35');
    expect(formatFieldValue('durchmesser', NaN)).toBe('');
    expect(readFieldValue('fasenOben', '1')).toBe(true);
    expect(readFieldValue('fasenOben', '0')).toBe(false);
    expect(formatFieldValue('fasenOben', false)).toBe('0');
  });
  it('Tippen 120 -> 12 -> 1 -> 15 -> 150 stellt die Skalierung wieder her', () => {
    const c = [[[0, 0], [30, 0], [30, 20]]]; // maxR ~ 36
    const base = 1;
    const eff = (d) => shrinkSkalierung(c, base, fitLimit({ modus: 'set', durchmesser: Math.max(30, d) }));
    expect(eff(120)).toBe(1);
    expect(eff(12)).toBeLessThan(0.1);
    expect(eff(1)).toBeLessThan(0.1);
    expect(eff(15)).toBeLessThan(0.1);
    expect(eff(150)).toBe(1);
  });
});
