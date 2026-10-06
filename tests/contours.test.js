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
