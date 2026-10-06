import { describe, it, expect } from 'vitest';
import { readDxf } from '../src/dxf.js';
import { dxf, line, circle, arc, lwpoly, rect, spline, text } from './dxfText.js';

describe('readDxf', () => {
  it('liest eine LINE als offene Polylinie', () => {
    const { polylines } = readDxf(dxf([line(0, 0, 10, 0)]));
    expect(polylines).toEqual([{ points: [[0, 0], [10, 0]], closed: false }]);
  });

  it('liest einen CIRCLE als geschlossene Polylinie auf dem Radius', () => {
    const { polylines } = readDxf(dxf([circle(5, 5, 20)]));
    expect(polylines).toHaveLength(1);
    expect(polylines[0].closed).toBe(true);
    for (const [x, y] of polylines[0].points) expect(Math.hypot(x - 5, y - 5)).toBeCloseTo(20, 6);
    expect(polylines[0].points.length).toBeGreaterThan(30);
  });

  it('liest einen ARC von 0° bis 90°', () => {
    const { polylines } = readDxf(dxf([arc(0, 0, 10, 0, 90)]));
    const pts = polylines[0].points;
    expect(polylines[0].closed).toBe(false);
    expect(pts[0][0]).toBeCloseTo(10, 6);
    expect(pts[0][1]).toBeCloseTo(0, 6);
    expect(pts.at(-1)[0]).toBeCloseTo(0, 6);
    expect(pts.at(-1)[1]).toBeCloseTo(10, 6);
  });

  it('liest ein geschlossenes Rechteck (LWPOLYLINE) mit 4 Punkten', () => {
    const { polylines } = readDxf(dxf([rect(0, 0, 10, 5)]));
    expect(polylines[0].closed).toBe(true);
    expect(polylines[0].points).toHaveLength(4);
  });

  it('löst Bulge-Segmente zu einem Halbkreis auf', () => {
    const { polylines } = readDxf(dxf([lwpoly([[0, 0, 1], [10, 0]], false)]));
    const pts = polylines[0].points;
    expect(polylines[0].closed).toBe(false);
    expect(pts.length).toBeGreaterThan(10);
    for (const [x, y] of pts) expect(Math.hypot(x - 5, y)).toBeCloseTo(5, 6);
    expect(pts.some(([x, y]) => Math.abs(x - 5) < 0.3 && y < -4.9)).toBe(true);
  });

  it('tastet einen quadratischen B-Spline ab', () => {
    const { polylines } = readDxf(dxf([spline(2, [0, 0, 0, 1, 1, 1], [[0, 0], [10, 10], [20, 0]])]));
    const pts = polylines[0].points;
    expect(pts[0][0]).toBeCloseTo(0, 6);
    expect(pts.at(-1)[0]).toBeCloseTo(20, 3);
    expect(pts.some(([x, y]) => Math.abs(x - 10) < 0.2 && Math.abs(y - 5) < 0.1)).toBe(true);
  });

  it('zählt nicht unterstützte Elemente', () => {
    const { polylines, ignored } = readDxf(dxf([line(0, 0, 1, 0), text()]));
    expect(polylines).toHaveLength(1);
    expect(ignored).toEqual({ TEXT: 1 });
  });

  it('rechnet Zoll ($INSUNITS=1) in mm um', () => {
    const { polylines, unitFactor } = readDxf(dxf([line(0, 0, 1, 0)], { insunits: 1 }));
    expect(unitFactor).toBe(25.4);
    expect(polylines[0].points[1][0]).toBeCloseTo(25.4, 6);
  });

  it('wirft eine verständliche Meldung bei Müll-Dateien', () => {
    expect(() => readDxf('hallo das ist kein dxf')).toThrow(/DXF|unterstützt/);
    expect(() => readDxf(dxf([text()]))).toThrow(/unterstützt/);
  });

  it('hält die Bogenabweichung in mm auch bei Zoll-Zeichnungen ein', () => {
    const { polylines } = readDxf(dxf([circle(0, 0, 2)], { insunits: 1 }));
    const pts = polylines[0].points;
    const R = 50.8;
    for (const [x, y] of pts) expect(Math.hypot(x, y)).toBeCloseTo(R, 6);
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      const chord = Math.hypot(x1 - x0, y1 - y0);
      const sagitta = R - Math.sqrt(R * R - (chord / 2) ** 2);
      expect(sagitta).toBeLessThanOrEqual(0.02 + 1e-9);
    }
  });

  it('überspringt kaputte Elemente statt mit TypeError abzubrechen', () => {
    const brokenLine = '0\nLINE\n8\n0\n10\n0\n20\n0\n30\n0\n';
    const { polylines, ignored } = readDxf(dxf([line(0, 0, 1, 0), brokenLine]));
    expect(polylines).toHaveLength(1);
    expect(ignored).toEqual({ LINE: 1 });
    expect(() => readDxf(dxf([brokenLine]))).toThrow(/unterstützt/);
  });
});
