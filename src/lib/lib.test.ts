import { describe, expect, it } from 'vitest';
import { dbToGain, faderPosToGain, gainToDb, gainToFaderPos } from './audioMath';
import { formatBars, formatClock, snapTime, secondsPerBar } from './time';
import { sanitizeFileName } from './format';

describe('audioMath', () => {
  it('dB ↔ ganancia', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(gainToDb(1)).toBe(0);
    expect(gainToDb(0)).toBe(-Infinity);
  });
  it('curva del fader es reversible y 0.75 = 0 dB', () => {
    expect(faderPosToGain(0.75)).toBeCloseTo(1);
    expect(faderPosToGain(1)).toBeCloseTo(dbToGain(6));
    expect(faderPosToGain(0)).toBe(0);
    for (const p of [0.1, 0.3, 0.5, 0.75, 0.9]) expect(gainToFaderPos(faderPosToGain(p))).toBeCloseTo(p, 4);
  });
});

describe('tiempo', () => {
  it('formatos', () => {
    expect(formatClock(65.25)).toBe('01:05.250');
    expect(formatBars(0, 120, [4, 4])).toBe('1.1.000');
    expect(formatBars(2, 120, [4, 4])).toBe('2.1.000');
    expect(secondsPerBar(120, [4, 4])).toBe(2);
  });
  it('snap a la rejilla', () => {
    expect(snapTime(0.26, 120, [4, 4], 1)).toBe(0.5);
    expect(snapTime(0.1, 120, [4, 4], 0.25)).toBe(0.125);
  });
});

describe('format', () => {
  it('sanea nombres de archivo', () => {
    expect(sanitizeFileName('a/b:c*?.wav')).toBe('a_b_c_.wav');
    expect(sanitizeFileName('   ')).toBe('sonora');
  });
});
