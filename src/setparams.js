// Konstanten und Winkel für das Doodle-Disk-Set (alle mm, Winkel in Grad, 12 Uhr = 90°).
export const T_C = 2;
export const BAND = 12;
export const FIT_P = 0.95;
export const RING_SPIEL = 0.5;
export const RING_WAND = 3;
export const ENGRAVE = 0.8;
export const WIN_OVERLAP_DEG = 1;
export const KEY_W = 6.4;
export const KEY_D = 1.6;
export const TAB_W = 5.6;
export const TAB_D = 1.2;
export const CLIP_W = 24;
export const CLIP_T = 2.4;
export const CLIP_BACK = 20;
export const KLEMM_SPIEL = 0.2;
export const A4_W = 210;
export const A4_H = 297;

// Ziffernschrift
export const GH = 6;
export const GW = 3.4;
export const GS = 0.9;
export const GG = 0.8;

// Zeigerpfeil und Verbreiterung im Halter
export const ARROW_BASE = 6;
export const ARROW_H = 5;
export const BUMP_W = 12;
export const BUMP_D = 8;

export const MAX_WINDOW_DEG = 358;

// Von der Scheibe abhängige Masse. D = Durchmesser, T_S = Schablonendicke.
export function dims(state) {
  const D = state.durchmesser;
  const T_S = state.dicke;
  return {
    D,
    T_S,
    R_P: D / 2 - BAND,
    COVER_D: D - 0.4,
    RING_IN: D / 2 + RING_SPIEL,
    RING_OUT: D / 2 + RING_SPIEL + RING_WAND,
    RING_H: T_S + T_C + 0.6,
    TAB_H: T_S,
  };
}

export function sectorAngles(N) {
  const alpha = 360 / N;
  const windowHalf = Math.min(alpha / 2 + WIN_OVERLAP_DEG, MAX_WINDOW_DEG / 2);
  return {
    alpha,
    windowHalf,
    psi: (k) => 90 - (k - 1) * alpha,
    phi: (k) => 90 + (k - 1) * alpha,
  };
}
