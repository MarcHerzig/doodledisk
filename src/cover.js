import { scope } from './wasm.js';
import { clampState } from './disk.js';
import { numberAt } from './glyphs.js';
import { T_C, BAND, ENGRAVE, dims, sectorAngles } from './setparams.js';

const OVERLAP = 0.01;

// Tortenstück-Polygon von 90-half bis 90+half, Radius 0..r, Bogen in höchstens 1°-Schritten.
function wedge(half, r) {
  const steps = Math.max(1, Math.ceil((2 * half) / 1));
  const pts = [[0, 0]];
  for (let i = 0; i <= steps; i++) {
    const a = ((90 - half + (2 * half * i) / steps) * Math.PI) / 180;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

export function buildCover(wasm, rawState) {
  const { Manifold, CrossSection } = wasm;
  const state = clampState(rawState);
  const { COVER_D, R_P } = dims(state);
  const N = state.zahlen;
  const { windowHalf, psi } = sectorAngles(N);
  const s = scope();
  const disk = Manifold.cylinder(T_C, COVER_D / 2, COVER_D / 2, 128);
  try {
    const win = s.t(CrossSection.ofPolygons([wedge(windowHalf, R_P)], 'NonZero'));
    const winSolid = s.t(s.t(Manifold.extrude(win, T_C + 2 * OVERLAP)).translate([0, 0, -OVERLAP]));
    const nums = [];
    for (let k = 1; k <= N; k++) nums.push(numberAt(wasm, s, k, psi(k), R_P + BAND / 2));
    const all = s.t(CrossSection.union(nums));
    const engr = s.t(s.t(Manifold.extrude(all, ENGRAVE + OVERLAP)).translate([0, 0, T_C - ENGRAVE]));
    const cutter = s.t(Manifold.union([winSolid, engr]));
    return disk.subtract(cutter);
  } finally {
    disk.delete();
    s.done();
  }
}
