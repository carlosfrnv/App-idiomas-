import { describe, expect, it } from 'vitest';
import { scheduleLane, valueAt } from './automation';

const pts = [{ t: 1, v: 0 }, { t: 3, v: 1 }, { t: 4, v: 0.5 }];

describe('automatización', () => {
  it('interpola linealmente y mantiene extremos', () => {
    expect(valueAt(pts, 0)).toBe(0);
    expect(valueAt(pts, 2)).toBeCloseTo(0.5);
    expect(valueAt(pts, 3.5)).toBeCloseTo(0.75);
    expect(valueAt(pts, 10)).toBe(0.5);
    expect(valueAt([], 1)).toBeNaN();
  });
  it('programa el AudioParam desde la posición del segmento', () => {
    const calls: [string, number, number][] = [];
    const param = { setValueAtTime: (v: number, t: number) => calls.push(['set', v, t]), linearRampToValueAtTime: (v: number, t: number) => calls.push(['ramp', v, t]) } as unknown as AudioParam;
    scheduleLane(param, pts, 2, 100, Infinity);
    expect(calls).toEqual([['set', 0.5, 100], ['ramp', 1, 101], ['ramp', 0.5, 102]]);
    calls.length = 0;
    scheduleLane(param, pts, 0, 0, 2); // segmento de bucle que termina a mitad de rampa
    expect(calls).toEqual([['set', 0, 0], ['ramp', 0, 1], ['ramp', 0.5, 2]]);
  });
});
