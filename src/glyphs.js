import { GH, GW, GS, GG } from './setparams.js';

const SEGMENTS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg',
  5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};

const hw = GW / 2;
const hh = GH / 2;
// [x0, y0, x1, y1] relativ zur Ziffernmitte; Segmente überlappen an den Ecken.
const RECT = {
  a: [-hw, hh - GS, hw, hh],
  b: [hw - GS, 0, hw, hh],
  c: [hw - GS, -hh, hw, 0],
  d: [-hw, -hh, hw, -hh + GS],
  e: [-hw, -hh, -hw + GS, 0],
  f: [-hw, 0, -hw + GS, hh],
  g: [-hw, -GS / 2, hw, GS / 2],
};

// Rechteck-Polygone (gegen den Uhrzeigersinn) einer Zahl, Block zentriert im Ursprung.
export function glyphPolygons(str) {
  const chars = String(str).split('').filter((c) => c in SEGMENTS);
  const total = chars.length * GW + Math.max(0, chars.length - 1) * GG;
  const polys = [];
  chars.forEach((c, i) => {
    const cx = -total / 2 + GW / 2 + i * (GW + GG);
    for (const seg of SEGMENTS[c]) {
      const [x0, y0, x1, y1] = RECT[seg];
      polys.push([[cx + x0, y0], [cx + x1, y0], [cx + x1, y1], [cx + x0, y1]]);
    }
  });
  return polys;
}

// Gibt eine CrossSection zurück, die über s.t() freigegeben wird.
export function numberCrossSection(wasm, s, str) {
  return s.t(wasm.CrossSection.ofPolygons(glyphPolygons(str), 'NonZero'));
}

// Zahl k auf Polarposition (angleDeg, radius), lokal gedreht um angleDeg - 90.
export function numberAt(wasm, s, k, angleDeg, radius) {
  const base = numberCrossSection(wasm, s, String(k));
  const rot = s.t(base.rotate(angleDeg - 90));
  const a = (angleDeg * Math.PI) / 180;
  return s.t(rot.translate(radius * Math.cos(a), radius * Math.sin(a)));
}
