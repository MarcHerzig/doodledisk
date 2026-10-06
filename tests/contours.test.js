import { describe, it, expect } from 'vitest';
import { buildContours, findIntersections } from '../src/contours.js';

const seg = (a, b) => ({ points: [a, b], closed: false });

describe('buildContours', () => {
  it('schliesst vier Linien zu einem Quadrat, auch unsortiert und umgedreht', () => {
    const { contours, gaps } = buildContours([
      seg([10, 10], [0, 10]),
      seg([0, 0], [10, 0]),
      seg([0, 10], [0, 0]),
      seg([10, 0], [10, 10]),
    ]);
    expect(gaps).toEqual([]);
    expect(contours).toHaveLength(1);
    expect(contours[0]).toHaveLength(4);
  });

  it('meldet Lücken mit Position', () => {
    const { contours, gaps } = buildContours([
      seg([0, 0], [10, 0]),
      seg([10, 0], [10, 10]),
      seg([10, 10], [0, 10]),
      seg([0, 9.5], [0, 0]),
    ]);
    expect(contours).toHaveLength(0);
    expect(gaps).toHaveLength(2);
    expect(gaps.some((g) => Math.abs(g.x) < 1e-9 && Math.abs(g.y - 10) < 1e-9)).toBe(true);
  });

  it('akzeptiert Lücken unter der Toleranz', () => {
    const { contours, gaps } = buildContours([
      seg([0, 0], [10, 0]),
      seg([10, 0], [10, 10]),
      seg([10, 10], [0, 10]),
      seg([0, 10.005], [0, 0]),
    ]);
    expect(gaps).toEqual([]);
    expect(contours).toHaveLength(1);
  });

  it('übernimmt geschlossene Polylinien direkt und entfernt den doppelten Schlusspunkt', () => {
    const { contours } = buildContours([
      { points: [[0, 0], [5, 0], [5, 5], [0, 0]], closed: false },
      { points: [[10, 10], [20, 10], [20, 20]], closed: true },
    ]);
    expect(contours.map((c) => c.length)).toEqual([3, 3]);
  });

  it('verkettet 2000 gemischte Segmente eines Kreises in unter 2 s', () => {
    const n = 2000;
    const segs = [];
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      const b = (2 * Math.PI * (i + 1)) / n;
      segs.push(seg([50 * Math.cos(a), 50 * Math.sin(a)], [50 * Math.cos(b), 50 * Math.sin(b)]));
    }
    segs.sort(() => Math.random() - 0.5);
    const t0 = performance.now();
    const { contours, gaps } = buildContours(segs);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(gaps).toEqual([]);
    expect(contours).toHaveLength(1);
    expect(contours[0]).toHaveLength(n);
  });
});

describe('findIntersections', () => {
  it('findet die Kreuzung einer Schleife', () => {
    const r = findIntersections([[[0, 0], [10, 10], [10, 0], [0, 10]]]);
    expect(r).toHaveLength(1);
    expect(r[0].x).toBeCloseTo(5, 6);
    expect(r[0].y).toBeCloseTo(5, 6);
  });

  it('findet keine bei einem sauberen Quadrat', () => {
    expect(findIntersections([[[0, 0], [10, 0], [10, 10], [0, 10]]])).toEqual([]);
  });
});

import { simplifyContours } from '../src/contours.js';

describe('simplifyContours', () => {
  it('reduziert einen 4000-Punkte-Kreis bei Abweichung <= tol', () => {
    const r = 40;
    const n = 4000;
    const c = Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)]);
    const [s] = simplifyContours([c], 0.01);
    expect(s.length).toBeLessThan(600);
    expect(s.length).toBeGreaterThanOrEqual(3);
    let maxDev = 0;
    for (const p of c) {
      let best = Infinity;
      for (let i = 0; i < s.length; i++) {
        const a = s[i];
        const b = s[(i + 1) % s.length];
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
        best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
      }
      maxDev = Math.max(maxDev, best);
    }
    expect(maxDev).toBeLessThanOrEqual(0.01 + 1e-9);
  });

  it('laesst ein Quadrat bei 4 Punkten', () => {
    const sq = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(simplifyContours([sq])[0]).toHaveLength(4);
  });

  it('faellt nie unter 3 Punkte', () => {
    const thin = [[0, 0], [5, 0.0001], [10, 0], [5, -0.0001]];
    expect(simplifyContours([thin])[0].length).toBeGreaterThanOrEqual(3);
    const line = [[0, 0], [1, 0], [2, 0], [3, 0]];
    expect(simplifyContours([line])[0].length).toBeGreaterThanOrEqual(3);
  });

  it('ueberlaeuft bei 200000 fast kollinearen Punkten nicht den Stack', () => {
    const n = 200000;
    const c = Array.from({ length: n }, (_, i) => [i * 0.001, (i % 2) * 1e-5]);
    const s = simplifyContours([c], 0.01)[0];
    expect(s.length).toBeGreaterThanOrEqual(3);
    expect(s.length).toBeLessThan(10);
  });
});
