// Reine Hilfsfunktionen für die Set-Oberfläche (ohne DOM, testbar).
import { dims, FIT_P } from './setparams.js';

export const PARTS = ['schablone', 'abdeckung', 'halter'];

// Nur die Schablone braucht eine geladene DXF-Kontur; im Einzelmodus gibt es nur sie.
export function needsContours(part, modus) {
  return modus !== 'set' || part === 'schablone';
}

// Dateiname des STL-Exports. s ist der geklemmte Zustand.
export function exportName(part, s, fileName) {
  const base = fileName || 'doodledisk';
  if (s.modus !== 'set') return `${base}-${s.durchmesser}x${s.dicke}.stl`;
  if (part === 'abdeckung') return `${base}-abdeckung-${s.zahlen}.stl`;
  if (part === 'halter') return `${base}-halter-${s.zahlen}.stl`;
  return `${base}-schablone-${s.durchmesser}x${s.dicke}.stl`;
}

// Grenzradius für das Einpassen eines Motivs; undefined = Standard (80 % von D/2).
export function fitLimit(s) {
  return s.modus === 'set' ? FIT_P * dims(s).R_P : undefined;
}

// Radius des roten Randrings in der Vorschau.
export function rimRadius(s) {
  return s.modus === 'set' ? dims(s).R_P : s.durchmesser / 2;
}

// Neue Skalierung, falls das Motiv den Grenzradius überschreitet; sonst unverändert (nie vergrössern).
export function shrinkSkalierung(contours, skalierung, limit) {
  if (limit === undefined || !contours.length) return skalierung;
  let maxR = 0;
  for (const c of contours) for (const [x, y] of c) maxR = Math.max(maxR, Math.hypot(x, y));
  if (maxR * skalierung > limit * (1 + 1e-9)) return limit / maxR;
  return skalierung;
}
