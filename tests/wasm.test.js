import { describe, it, expect } from 'vitest';
import { loadManifold, isOk, volumeOf } from '../src/wasm.js';

describe('manifold WASM', () => {
  it('lädt und baut einen Zylinder mit plausiblem Volumen', async () => {
    const { Manifold } = await loadManifold();
    const c = Manifold.cylinder(3, 60, 60, 256);
    expect(isOk(c)).toBe(true);
    const expected = Math.PI * 60 * 60 * 3;
    expect(volumeOf(c)).toBeGreaterThan(expected * 0.99);
    expect(volumeOf(c)).toBeLessThan(expected * 1.001);
    c.delete();
  });
});
