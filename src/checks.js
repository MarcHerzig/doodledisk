import { scope } from './wasm.js';
import { clampState, transformContours } from './disk.js';
import { findIntersections } from './contours.js';

export const MIN_WALL = 1;
const THIN_AREA = 0.2; // mm², kleinere Reste sind Rundungsartefakte an Ecken
const RIM_AREA = 0.01;

const fmt = (v) => v.toFixed(1);

function pieces(s, cs) {
  return cs.decompose().map((p) => s.t(p));
}

function thinSpot(s, material) {
  const r = MIN_WALL / 2;
  const opened = s.t(s.t(material.offset(-r, 'Round', 2, 16)).offset(r, 'Round', 2, 16));
  const thin = s.t(material.subtract(opened));
  const big = pieces(s, thin).filter((p) => p.area() > THIN_AREA);
  if (!big.length) return null;
  big.sort((a, b) => b.area() - a.area());
  const b = big[0].bounds();
  return { x: (b.min[0] + b.max[0]) / 2, y: (b.min[1] + b.max[1]) / 2 };
}

export function analyze(wasm, rawState) {
  const { CrossSection } = wasm;
  const state = clampState(rawState);
  const warnings = [];
  if (!state.contours.length) {
    return { warnings: [{ level: 'rot', text: 'Keine Konturen vorhanden.' }], stats: { ausschnitte: 0 } };
  }

  const s = scope();
  try {
    const placed = transformContours(state.contours, state);
    const cut = s.t(CrossSection.ofPolygons(placed, 'EvenOdd'));
    const disc = s.t(CrossSection.circle(state.durchmesser / 2, 128));
    const count = pieces(s, cut).length;

    for (const p of findIntersections(state.contours, 3)) {
      warnings.push({ level: 'gelb', text: `Eine Kontur schneidet sich selbst bei x=${fmt(p.x)}, y=${fmt(p.y)}.` });
    }

    if (s.t(cut.subtract(disc)).area() > RIM_AREA) {
      warnings.push({ level: 'gelb', rim: true, text: 'Das Motiv ragt über den Scheibenrand.' });
    }

    const thin = thinSpot(s, s.t(disc.subtract(cut)));
    if (thin) {
      warnings.push({ level: 'gelb', text: `Steg unter ${MIN_WALL} mm bei x=${fmt(thin.x)}, y=${fmt(thin.y)}.` });
    }

    if (state.fasenTiefe > 0 && state.fasenAufweitung > 0) {
      const widened = s.t(cut.offset(state.fasenAufweitung, 'Round', 2, 24));
      if (pieces(s, widened).length < count) {
        warnings.push({ level: 'gelb', text: 'Die Fase lässt Ausschnitte verschmelzen. Aufweitung verkleinern oder Motiv auseinanderziehen.' });
      } else if (!thin) {
        const t2 = thinSpot(s, s.t(disc.subtract(widened)));
        if (t2) {
          warnings.push({ level: 'gelb', text: `Steg unter ${MIN_WALL} mm durch die Fase bei x=${fmt(t2.x)}, y=${fmt(t2.y)}.` });
        }
      }
    }

    return { warnings, stats: { ausschnitte: count } };
  } finally {
    s.done();
  }
}
