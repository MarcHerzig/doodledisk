import DxfParser from 'dxf-parser';

const SAG = 0.02; // mm, max. Abweichung beim Abtasten von Bögen
const UNIT_FACTOR = { 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000 };

function steps(r, sweep, sag) {
  if (r <= sag) return 2;
  return Math.max(2, Math.ceil(Math.abs(sweep) / (2 * Math.acos(1 - sag / r))));
}

function arcPoints(cx, cy, r, a0, sweep, sag) {
  const n = steps(r, sweep, sag);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function bulgeInterior(p0, p1, bulge, sag) {
  const theta = 4 * Math.atan(bulge);
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const c = Math.hypot(dx, dy);
  if (c === 0) return [];
  const d = c / 2 / Math.tan(theta / 2);
  const cx = (p0.x + p1.x) / 2 - (dy / c) * d;
  const cy = (p0.y + p1.y) / 2 + (dx / c) * d;
  const r = Math.hypot(p0.x - cx, p0.y - cy);
  const a0 = Math.atan2(p0.y - cy, p0.x - cx);
  return arcPoints(cx, cy, r, a0, theta, sag).slice(1, -1);
}

function polylinePoints(vertices, closed, sag) {
  const out = [];
  const n = vertices.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = vertices[i];
    const p1 = vertices[(i + 1) % n];
    out.push([p0.x, p0.y]);
    if (p0.bulge) out.push(...bulgeInterior(p0, p1, p0.bulge, sag));
  }
  if (!closed) {
    const l = vertices[n - 1];
    out.push([l.x, l.y]);
  }
  return out;
}

function deBoor(cp, U, p, t) {
  const n = cp.length - 1;
  let k = p;
  for (let i = p; i <= n; i++) {
    if (t >= U[i] && t < U[i + 1]) {
      k = i;
      break;
    }
  }
  const d = [];
  for (let j = 0; j <= p; j++) d.push([cp[j + k - p].x, cp[j + k - p].y]);
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const den = U[j + 1 + k - r] - U[j + k - p];
      const a = den === 0 ? 0 : (t - U[j + k - p]) / den;
      d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1]];
    }
  }
  return d[p];
}

function splinePoints(e) {
  const cp = e.controlPoints || [];
  const p = e.degreeOfSplineCurve ?? e.degree;
  const U = e.knotValues;
  if (!U || cp.length < 2 || U.length !== cp.length + p + 1) {
    const fit = e.fitPoints && e.fitPoints.length >= 2 ? e.fitPoints : cp;
    return fit.map((v) => [v.x, v.y]);
  }
  const t0 = U[p];
  const t1 = U[cp.length];
  const N = Math.max(48, cp.length * 12);
  const out = [];
  for (let i = 0; i <= N; i++) {
    const t = i === N ? t1 - 1e-12 : t0 + ((t1 - t0) * i) / N;
    out.push(deBoor(cp, U, p, t));
  }
  return out;
}

function convert(e, sag, polylines) {
  switch (e.type) {
    case 'LINE':
      polylines.push({ points: [[e.vertices[0].x, e.vertices[0].y], [e.vertices[1].x, e.vertices[1].y]], closed: false });
      return;
    case 'CIRCLE': {
      const pts = arcPoints(e.center.x, e.center.y, e.radius, 0, 2 * Math.PI, sag);
      pts.pop();
      polylines.push({ points: pts, closed: true });
      return;
    }
    case 'ARC': {
      let sweep = e.endAngle - e.startAngle;
      if (sweep <= 0) sweep += 2 * Math.PI;
      polylines.push({ points: arcPoints(e.center.x, e.center.y, e.radius, e.startAngle, sweep, sag), closed: false });
      return;
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const closed = Boolean(e.shape || e.closed);
      if (e.vertices.length >= 2) polylines.push({ points: polylinePoints(e.vertices, closed, sag), closed });
      return;
    }
    case 'SPLINE': {
      const points = splinePoints(e);
      if (points.length >= 2) polylines.push({ points, closed: false });
      return;
    }
    default:
      throw new Error('unsupported');
  }
}

const SUPPORTED = new Set(['LINE', 'CIRCLE', 'ARC', 'LWPOLYLINE', 'POLYLINE', 'SPLINE']);

export function readDxf(text) {
  let parsed;
  try {
    parsed = new DxfParser().parseSync(text);
  } catch {
    throw new Error('Datei konnte nicht als DXF gelesen werden.');
  }
  const entities = (parsed && parsed.entities) || [];
  const unitFactor = UNIT_FACTOR[Number(parsed?.header?.$INSUNITS)] ?? 1;
  const sag = SAG / unitFactor; // Abweichung von 0.02 mm gilt in mm, nicht in Zeichnungseinheiten
  const polylines = [];
  const ignored = {};

  for (const e of entities) {
    if (!SUPPORTED.has(e.type)) {
      ignored[e.type] = (ignored[e.type] || 0) + 1;
      continue;
    }
    try {
      convert(e, sag, polylines);
    } catch {
      ignored[e.type] = (ignored[e.type] || 0) + 1; // kaputtes Element überspringen
    }
  }

  if (!polylines.length) {
    throw new Error('Keine unterstützten Zeichenelemente gefunden (LINE, ARC, CIRCLE, POLYLINE, SPLINE).');
  }

  if (unitFactor !== 1) {
    for (const pl of polylines) pl.points = pl.points.map(([x, y]) => [x * unitFactor, y * unitFactor]);
  }
  return { polylines, ignored, unitFactor };
}
