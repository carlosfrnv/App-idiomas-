import { describe, expect, it } from 'vitest';
import { clipWindow, fadeFactor } from './scheduleClips';
import { makeClip } from '@/state/docOps';
import { computeLevels } from './meter';
import { alignRecording } from '@/audio/recording/Recorder';

const clip = makeClip({ trackId: 't', assetId: 'a', name: 'c', start: 4, duration: 6, offset: 2 });

describe('sincronización de clips', () => {
  it('clip que empieza después del cabezal', () => {
    expect(clipWindow(clip, 0, 100, Infinity)).toEqual({ playFrom: 4, when: 104, offset: 2, duration: 6 });
  });
  it('cabezal dentro del clip: offset ajustado', () => {
    expect(clipWindow(clip, 7, 50, Infinity)).toEqual({ playFrom: 7, when: 50, offset: 5, duration: 3 });
  });
  it('segmento de bucle corta el final', () => {
    expect(clipWindow(clip, 0, 0, 6)).toMatchObject({ duration: 2 });
  });
  it('clip fuera de rango', () => {
    expect(clipWindow(clip, 11, 0, Infinity)).toBeNull();
    expect(clipWindow(clip, 0, 0, 3)).toBeNull();
  });
  it('fundidos', () => {
    const c = { ...clip, fadeIn: 1, fadeOut: 2 };
    expect(fadeFactor(c, 0)).toBe(0);
    expect(fadeFactor(c, 0.5)).toBe(0.5);
    expect(fadeFactor(c, 3)).toBe(1);
    expect(fadeFactor(c, 5)).toBe(0.5);
  });
});

describe('medición', () => {
  it('pico, RMS y saturación', () => {
    const l = computeLevels(Float32Array.from([0.5, -0.5, 0.5, -0.5]));
    expect(l.peak).toBe(0.5);
    expect(l.rms).toBeCloseTo(0.5);
    expect(l.clipped).toBe(false);
    expect(computeLevels(Float32Array.from([1, 0])).clipped).toBe(true);
  });
});

describe('alineación de grabación', () => {
  it('resta la latencia', () => {
    expect(alignRecording(5, 0.1)).toEqual({ start: 4.9, trimHead: 0 });
  });
  it('recorta la cabeza si quedaría antes de 0', () => {
    const r = alignRecording(0.02, 0.1);
    expect(r.start).toBe(0);
    expect(r.trimHead).toBeCloseTo(0.08);
  });
});
