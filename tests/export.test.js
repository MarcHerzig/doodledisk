import { describe, it, expect } from 'vitest';
import { stlBuffer } from '../src/export.js';

describe('stlBuffer', () => {
  it('schreibt Header, Dreieckszahl, Normale und Eckpunkte', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const buf = stlBuffer(positions, indices);
    expect(buf.byteLength).toBe(84 + 50);
    const dv = new DataView(buf);
    expect(dv.getUint32(80, true)).toBe(1);
    expect(dv.getFloat32(84, true)).toBeCloseTo(0, 6);
    expect(dv.getFloat32(88, true)).toBeCloseTo(0, 6);
    expect(dv.getFloat32(92, true)).toBeCloseTo(1, 6);
    expect(dv.getFloat32(96 + 12, true)).toBeCloseTo(1, 6);
  });
});
