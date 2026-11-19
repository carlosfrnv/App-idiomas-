import { describe, expect, it } from 'vitest';
import { countSyllables, lineSyllables, rhymeGroups, rhymeKey } from './spanishMeter';

describe('sílabas', () => {
  it.each([
    ['canción', 2], ['murciélago', 4], ['poesía', 4], ['cielo', 2], ['aeropuerto', 5], ['que', 1],
    ['guerra', 2], ['pingüino', 3], ['hoy', 1], ['ciudad', 2], ['corazón', 3], ['y', 1], ['flow', 1], ['real', 2],
  ])('%s → %i', (w, n) => expect(countSyllables(w)).toBe(n));
  it('sinalefa entre palabras', () => {
    expect(lineSyllables('mi alma')).toBe(2); // mial-ma
    expect(lineSyllables('la noche es larga')).toBe(5); // la-no-che_es-lar-ga
  });
});

describe('rima', () => {
  it('consonante y asonante', () => {
    expect(rhymeKey('corazón')!.consonant).toBe('on');
    expect(rhymeKey('canción')!.consonant).toBe('on');
    expect(rhymeKey('cielo')!.consonant).toBe('elo');
    expect(rhymeKey('suelo')!.consonant).toBe('elo');
    expect(rhymeKey('boca')!.assonant).toBe('oa');
    expect(rhymeKey('sola')!.assonant).toBe('oa');
    expect(rhymeKey('agua')!.assonant).toBe('aa');
  });
  it('agrupa líneas que riman', () => {
    const g = rhymeGroups(['Miro al cielo', 'pisando el suelo', 'tu boca', 'la noche está sola', '[Estribillo]', 'nada']);
    expect(g[0]).not.toBeNull();
    expect(g[0]).toBe(g[1]);
    expect(g[2]).toBe(g[3]);
    expect(g[2]).not.toBe(g[0]);
    expect(g[4]).toBeNull();
    expect(g[5]).toBeNull();
  });
});
