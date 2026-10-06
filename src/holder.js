import { scope } from './wasm.js';
import { clampState } from './disk.js';
import {
  A4_W, A4_H, CLIP_W, CLIP_T, CLIP_BACK, KLEMM_SPIEL, TAB_W, TAB_D, ENGRAVE,
  ARROW_BASE, ARROW_H, BUMP_W, BUMP_D, dims,
} from './setparams.js';

const EPS = 0.5;

// Quader per Eckpunkten [x0,y0,z0]..[x1,y1,z1].
function box(wasm, s, x0, y0, z0, x1, y1, z1) {
  return s.t(s.t(wasm.Manifold.cube([x1 - x0, y1 - y0, z1 - z0])).translate([x0, y0, z0]));
}

export function buildHolder(wasm, rawState, { forPrint = false } = {}) {
  const { Manifold, CrossSection } = wasm;
  const state = clampState(rawState);
  const { RING_IN, RING_OUT, RING_H, TAB_H } = dims(state);
  const gap = state.blockdicke + KLEMM_SPIEL;
  // Abstand der Blattkante von der Ringmitte: links = halbe Blattbreite, unten = halbe Blatthöhe.
  const edge = (state.seite === 'unten' ? A4_H : A4_W) / 2;
  if (RING_OUT - 1.5 >= edge) throw new Error('Der Ring passt nicht auf das A4-Blatt (Durchmesser zu gross).');
  const cw = CLIP_W / 2;
  const s = scope();
  try {
    const outer = s.t(Manifold.cylinder(RING_H, RING_OUT, RING_OUT, 128));
    const inner = s.t(Manifold.cylinder(RING_H + 2, RING_IN, RING_IN, 128));
    const ring = s.t(outer.subtract(s.t(inner.translate([0, 0, -1]))));

    const tab = box(wasm, s, -TAB_W / 2, RING_IN - TAB_D, 0, TAB_W / 2, RING_IN + EPS, TAB_H);
    const bump = box(wasm, s, -BUMP_W / 2, RING_OUT - 1, 0, BUMP_W / 2, RING_OUT + BUMP_D, RING_H);

    // Klemme in "links"-Lage, Blattkante bei x = -edge
    const bridge = box(wasm, s, -edge - CLIP_T, -cw, 0, -(RING_OUT - 1.5), cw, CLIP_T);
    const back = box(wasm, s, -edge - CLIP_T, -cw, -gap - CLIP_T, -edge, cw, CLIP_T);
    const lower = box(wasm, s, -edge - CLIP_T, -cw, -gap - CLIP_T, -edge + CLIP_BACK, cw, -gap);
    const clip = s.t(s.t(Manifold.union([bridge, back, lower])).rotate([0, 0, state.seite === 'unten' ? 90 : 0]));

    const body = s.t(Manifold.union([ring, tab, bump, clip]));

    // Pfeil: Spitze nach innen bei Radius RING_OUT, Basis weiter aussen, auf der Oberkante graviert.
    const tri = s.t(CrossSection.ofPolygons([[[0, RING_OUT], [ARROW_BASE / 2, RING_OUT + ARROW_H], [-ARROW_BASE / 2, RING_OUT + ARROW_H]]], 'NonZero'));
    const arrow = s.t(s.t(Manifold.extrude(tri, ENGRAVE + 1)).translate([0, 0, RING_H - ENGRAVE]));
    const done = s.t(body.subtract(arrow));

    if (!forPrint) return done.translate([0, 0, 0]);
    const flipped = s.t(done.rotate([180, 0, 0]));
    const minZ = flipped.boundingBox().min[2];
    return flipped.translate([0, 0, -minZ]);
  } finally {
    s.done();
  }
}
