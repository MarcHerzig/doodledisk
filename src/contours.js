export const CLOSE_TOL = 0.01;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function buildContours(polylines, tol = CLOSE_TOL) {
  const contours = [];
  const gaps = [];
  const open = [];

  const pushClosed = (pts) => {
    const c = pts.slice();
    if (c.length > 1 && dist(c[0], c.at(-1)) <= tol) c.pop();
    if (c.length >= 3) contours.push(c);
  };

  for (const pl of polylines) {
    const pts = pl.points;
    if (pts.length < 2) continue;
    if (pl.closed || (pts.length >= 4 && dist(pts[0], pts.at(-1)) <= tol)) pushClosed(pts);
    else if (!(pts.length === 2 && dist(pts[0], pts[1]) <= tol)) open.push(pts.slice());
  }

  while (open.length) {
    let chain = open.pop();
    let grew = true;
    while (grew) {
      grew = false;
      if (chain.length >= 4 && dist(chain[0], chain.at(-1)) <= tol) break;
      for (let i = 0; i < open.length; i++) {
        const o = open[i];
        const head = chain[0];
        const tail = chain.at(-1);
        let merged = null;
        if (dist(tail, o[0]) <= tol) merged = chain.concat(o.slice(1));
        else if (dist(tail, o.at(-1)) <= tol) merged = chain.concat(o.slice(0, -1).reverse());
        else if (dist(head, o.at(-1)) <= tol) merged = o.concat(chain.slice(1));
        else if (dist(head, o[0]) <= tol) merged = o.slice().reverse().concat(chain.slice(1));
        if (merged) {
          chain = merged;
          open.splice(i, 1);
          grew = true;
          break;
        }
      }
    }
    if (chain.length >= 4 && dist(chain[0], chain.at(-1)) <= tol) pushClosed(chain);
    else gaps.push({ x: chain[0][0], y: chain[0][1] }, { x: chain.at(-1)[0], y: chain.at(-1)[1] });
  }

  return { contours, gaps };
}

function cross(p, q, r) {
  return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
}

function crossing(a, b, c, d) {
  const o1 = cross(a, b, c);
  const o2 = cross(a, b, d);
  const o3 = cross(c, d, a);
  const o4 = cross(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) {
    const s = o1 / (o1 - o2);
    return { x: c[0] + s * (d[0] - c[0]), y: c[1] + s * (d[1] - c[1]) };
  }
  return null;
}

export function findIntersections(contours, max = 10) {
  const segs = [];
  contours.forEach((c, ci) => {
    for (let i = 0; i < c.length; i++) {
      const a = c[i];
      const b = c[(i + 1) % c.length];
      segs.push({ a, b, ci, i, n: c.length, minX: Math.min(a[0], b[0]), maxX: Math.max(a[0], b[0]), minY: Math.min(a[1], b[1]), maxY: Math.max(a[1], b[1]) });
    }
  });
  const found = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i];
      const t = segs[j];
      if (s.maxX < t.minX || t.maxX < s.minX || s.maxY < t.minY || t.maxY < s.minY) continue;
      if (s.ci === t.ci) {
        const d = Math.abs(s.i - t.i);
        if (d === 1 || d === s.n - 1) continue;
      }
      const p = crossing(s.a, s.b, t.a, t.b);
      if (p) {
        found.push(p);
        if (found.length >= max) return found;
      }
    }
  }
  return found;
}

function segDist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// Douglas-Peucker auf einem geschlossenen Ring, iterativ (stacksicher), mindestens 3 Punkte.
function simplifyRing(ring, tol) {
  const n = ring.length;
  if (n <= 3) return ring;
  let far = 1;
  let fd = -1;
  for (let i = 1; i < n; i++) {
    const d = dist(ring[0], ring[i]);
    if (d > fd) {
      fd = d;
      far = i;
    }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[far] = 1;
  const stack = [[0, far], [far, n]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const a = ring[i];
    const b = ring[j % n];
    let md = -1;
    let mi = -1;
    for (let k = i + 1; k < j; k++) {
      const d = segDist(ring[k], a, b);
      if (d > md) {
        md = d;
        mi = k;
      }
    }
    if (mi >= 0 && md > tol) {
      keep[mi] = 1;
      stack.push([i, mi], [mi, j]);
    }
  }
  let count = 0;
  for (let i = 0; i < n; i++) count += keep[i];
  if (count < 3) {
    let best = -1;
    let bd = -1;
    for (let i = 1; i < n; i++) {
      if (keep[i]) continue;
      const d = segDist(ring[i], ring[0], ring[far]);
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) keep[best] = 1;
  }
  return ring.filter((_, i) => keep[i]);
}

export function simplifyContours(contours, tol = 0.01) {
  return contours.map((c) => simplifyRing(c, tol));
}
