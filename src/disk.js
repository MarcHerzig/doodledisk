import { scope } from './wasm.js';
import { KEY_W, KEY_D } from './setparams.js';

export const DEFAULTS = {
  durchmesser: 120,
  dicke: 3,
  fasenTiefe: 1,
  fasenAufweitung: 0.8,
  fasenOben: true,
  offsetX: 0,
  offsetY: 0,
  winkel: 0,
  skalierung: 1,
  modus: 'einzel',
  zahlen: 12,
  blockdicke: 4,
  seite: 'links',
};

export const LAYER = 0.2;
const OVERLAP = 0.01;
const FIT = 0.8;

const LIMITS = {
  durchmesser: [30, 250],
  dicke: [1, 20],
  fasenTiefe: [0, 20],
  fasenAufweitung: [0, 5],
  skalierung: [0.05, 5],
  winkel: [-360, 360],
  offsetX: [-200, 200],
  offsetY: [-200, 200],
};

export function clampState(s) {
  const out = { ...s };
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    const v = Number(s[k]);
    out[k] = Number.isFinite(v) && s[k] !== '' && s[k] !== null ? Math.min(hi, Math.max(lo, v)) : DEFAULTS[k];
  }
  out.fasenTiefe = Math.min(out.fasenTiefe, out.dicke);
  out.fasenOben = s.fasenOben !== false;
  out.modus = s.modus === 'set' ? 'set' : 'einzel';
  const z = Number(s.zahlen);
  out.zahlen = Number.isFinite(z) && s.zahlen !== '' && s.zahlen !== null ? Math.min(36, Math.max(2, Math.round(z))) : DEFAULTS.zahlen;
  const b = Number(s.blockdicke);
  out.blockdicke = Number.isFinite(b) && s.blockdicke !== '' && s.blockdicke !== null ? Math.min(30, Math.max(1, b)) : DEFAULTS.blockdicke;
  out.seite = s.seite === 'unten' ? 'unten' : 'links';
  out.contours = s.contours || [];
  return out;
}

export function fitContours(contours, durchmesser) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of contours) {
    for (const [x, y] of c) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (minX === Infinity) return { contours: [], skalierung: 1 };
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const centered = contours.map((c) => c.map(([x, y]) => [x - cx, y - cy]));
  let maxR = 0;
  for (const c of centered) for (const [x, y] of c) maxR = Math.max(maxR, Math.hypot(x, y));
  const limit = (FIT * durchmesser) / 2;
  return { contours: centered, skalierung: maxR > limit ? limit / maxR : 1 };
}

export function transformContours(contours, { skalierung, winkel, offsetX, offsetY }) {
  const a = (winkel * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return contours.map((ct) =>
    ct.map(([x, y]) => {
      const X = x * skalierung;
      const Y = y * skalierung;
      return [X * c - Y * s + offsetX, X * s + Y * c + offsetY];
    }),
  );
}

export function layerPlan(state, fine = true) {
  const { dicke, fasenTiefe, fasenAufweitung, fasenOben } = state;
  const D = Math.min(fasenTiefe, dicke);
  if (D <= 0 || fasenAufweitung <= 0) return [{ z0: 0, h: dicke, offset: 0 }];
  const full = Math.max(1, Math.round(D / LAYER));
  const n = fine ? full : Math.min(4, full);
  const hl = D / n;
  const base = dicke - D;
  const plan = [];
  if (base > 1e-9) plan.push({ z0: fasenOben ? 0 : D, h: base, offset: 0 });
  for (let i = 1; i <= n; i++) {
    const offset = (fasenAufweitung * i) / n;
    plan.push({ z0: fasenOben ? base + (i - 1) * hl : D - i * hl, h: hl, offset });
  }
  return plan;
}

export function buildDisk(wasm, rawState, { fine = true } = {}) {
  const { Manifold, CrossSection } = wasm;
  const state = clampState(rawState);
  const R = state.durchmesser / 2;
  let disk = Manifold.cylinder(state.dicke, R, R, 128);
  if (state.modus === 'set') {
    // Passkerbe bei 12 Uhr über die volle Dicke
    const key = Manifold.cube([KEY_W, KEY_D + 1, state.dicke + 2 * OVERLAP]).translate([-KEY_W / 2, R - KEY_D, -OVERLAP]);
    const notched = disk.subtract(key);
    disk.delete();
    key.delete();
    disk = notched;
  }
  if (!state.contours.length) return disk;

  const s = scope();
  try {
    const placed = transformContours(state.contours, state);
    const base = s.t(CrossSection.ofPolygons(placed, 'EvenOdd'));
    const cutters = layerPlan(state, fine).map((l) => {
      const cs = l.offset > 0 ? s.t(base.offset(l.offset, 'Round', 2, 24)) : base;
      const e = s.t(Manifold.extrude(cs, l.h + 2 * OVERLAP));
      return s.t(e.translate([0, 0, l.z0 - OVERLAP]));
    });
    const cutter = s.t(Manifold.union(cutters));
    const result = disk.subtract(cutter);
    return result;
  } finally {
    disk.delete();
    s.done();
  }
}
