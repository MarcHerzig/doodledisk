const pair = (code, value) => `${code}\n${value}\n`;

export function dxf(entities, { insunits } = {}) {
  let s = '';
  if (insunits !== undefined) {
    s += pair(0, 'SECTION') + pair(2, 'HEADER') + pair(9, '$INSUNITS') + pair(70, insunits) + pair(0, 'ENDSEC');
  }
  s += pair(0, 'SECTION') + pair(2, 'ENTITIES') + entities.join('') + pair(0, 'ENDSEC') + pair(0, 'EOF');
  return s;
}

export const line = (x1, y1, x2, y2) =>
  pair(0, 'LINE') + pair(8, '0') + pair(10, x1) + pair(20, y1) + pair(30, 0) + pair(11, x2) + pair(21, y2) + pair(31, 0);

export const circle = (x, y, r) =>
  pair(0, 'CIRCLE') + pair(8, '0') + pair(10, x) + pair(20, y) + pair(30, 0) + pair(40, r);

export const arc = (x, y, r, a0, a1) =>
  pair(0, 'ARC') + pair(8, '0') + pair(10, x) + pair(20, y) + pair(30, 0) + pair(40, r) + pair(50, a0) + pair(51, a1);

export const lwpoly = (pts, closed = true) =>
  pair(0, 'LWPOLYLINE') + pair(8, '0') + pair(90, pts.length) + pair(70, closed ? 1 : 0) +
  pts.map(([x, y, b]) => pair(10, x) + pair(20, y) + (b ? pair(42, b) : '')).join('');

export const rect = (x, y, w, h) => lwpoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);

export const spline = (degree, knots, cps) =>
  pair(0, 'SPLINE') + pair(8, '0') + pair(70, 8) + pair(71, degree) + pair(72, knots.length) + pair(73, cps.length) +
  pair(74, 0) + knots.map((k) => pair(40, k)).join('') +
  cps.map(([x, y]) => pair(10, x) + pair(20, y) + pair(30, 0)).join('');

export const text = () =>
  pair(0, 'TEXT') + pair(8, '0') + pair(10, 0) + pair(20, 0) + pair(30, 0) + pair(40, 2) + pair(1, 'hi');
