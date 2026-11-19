import { describe, expect, it } from 'vitest';
import * as ops from './docOps';

function setup() {
  let d = ops.emptyDoc();
  const t = ops.makeTrack(d, { name: 'Voz' });
  d = ops.addTrack(d, t);
  const c = ops.makeClip({ trackId: t.id, assetId: 'a1', name: 'c', start: 2, duration: 4, offset: 1 });
  d = ops.addClip(d, c);
  return { d, t, c };
}

describe('docOps', () => {
  it('divide un clip conservando la continuidad del audio', () => {
    const { d, c } = setup();
    const r = ops.splitClip(d, c.id, 3.5);
    const left = r.doc.clips.find((x) => x.id === c.id)!;
    const right = r.doc.clips.find((x) => x.id === r.newId)!;
    expect(left).toMatchObject({ start: 2, duration: 1.5, offset: 1 });
    expect(right).toMatchObject({ start: 3.5, duration: 2.5, offset: 2.5 });
    expect(right.start + right.duration).toBeCloseTo(6);
  });
  it('no divide fuera del clip', () => {
    const { d, c } = setup();
    expect(ops.splitClip(d, c.id, 10).newId).toBeNull();
  });
  it('recorta el inicio manteniendo el final y respetando el audio disponible', () => {
    const { d, c } = setup();
    const a = ops.trimClip(d, c.id, 'start', 3, 10).clips[0];
    expect(a).toMatchObject({ start: 3, offset: 2, duration: 3 });
    const b = ops.trimClip(d, c.id, 'start', 0, 10).clips[0];
    expect(b).toMatchObject({ start: 1, offset: 0, duration: 5 }); // offset no puede ser negativo
  });
  it('recorta el final sin exceder la fuente', () => {
    const { d, c } = setup();
    expect(ops.trimClip(d, c.id, 'end', 100, 6).clips[0].duration).toBeCloseTo(5);
    expect(ops.trimClip(d, c.id, 'end', 1, 6).clips[0].duration).toBeCloseTo(ops.MIN_CLIP);
  });
  it('duplica clips a continuación', () => {
    const { d, c } = setup();
    const r = ops.duplicateClips(d, [c.id]);
    expect(r.doc.clips[1].start).toBe(6);
  });
  it('mute/solo determina la audibilidad', () => {
    let { d, t } = setup();
    const t2 = ops.makeTrack(d);
    d = ops.addTrack(d, t2);
    expect(ops.isTrackAudible(d, t)).toBe(true);
    d = ops.updateTrack(d, t2.id, { solo: true });
    expect(ops.isTrackAudible(d, d.tracks[0])).toBe(false);
    expect(ops.isTrackAudible(d, d.tracks[1])).toBe(true);
    d = ops.updateTrack(d, t2.id, { mute: true });
    expect(ops.isTrackAudible(d, d.tracks[1])).toBe(false);
  });
  it('elimina pista y sus clips; duplica pista y clips', () => {
    const { d, t } = setup();
    const dup = ops.duplicateTrack(d, t.id);
    expect(dup.doc.tracks).toHaveLength(2);
    expect(dup.doc.clips.filter((x) => x.trackId === dup.trackId)).toHaveLength(1);
    const rm = ops.removeTrack(dup.doc, t.id);
    expect(rm.tracks).toHaveLength(1);
    expect(rm.clips).toHaveLength(1);
  });
  it('reordena pistas', () => {
    let d = ops.emptyDoc();
    const a = ops.makeTrack(d, { name: 'A' }); d = ops.addTrack(d, a);
    const b = ops.makeTrack(d, { name: 'B' }); d = ops.addTrack(d, b);
    expect(ops.moveTrack(d, b.id, 0).tracks.map((t) => t.name)).toEqual(['B', 'A']);
  });
  it('projectEnd', () => {
    expect(ops.projectEnd(setup().d)).toBe(6);
  });
});
