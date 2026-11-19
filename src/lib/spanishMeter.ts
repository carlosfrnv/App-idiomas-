/**
 * Métrica y rima en español (sin IA): sílabas fonológicas, sinalefa, acento y rima.
 * Heurísticas estándar de la gramática española; suficientes para medir el flow de una letra.
 */
const STRONG = new Set([...'aeoáéíóú']);
const WEAK = new Set([...'iuü']);
const ACCENTED = new Set([...'áéíóú']);
const isVowelChar = (c: string) => STRONG.has(c) || WEAK.has(c);
const strip = (s: string) => s.normalize('NFD').replace(/[̀-́̈]/g, '').normalize('NFC');

export function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-záéíóúüñ]/g, '');
}

interface Nucleus { start: number; end: number }

/** Núcleos vocálicos (cada uno = una sílaba). Trata la 'u' muda de que/qui/gue/gui. */
function nuclei(word: string): Nucleus[] {
  const w = normalizeWord(word);
  const vowel = (i: number) => {
    const c = w[i];
    if (c === 'u' && i > 0 && (w[i - 1] === 'q' || (w[i - 1] === 'g' && (w[i + 1] === 'e' || w[i + 1] === 'i' || w[i + 1] === 'é' || w[i + 1] === 'í')))) return false;
    if (c === 'y') return i === w.length - 1 && i > 0 && isVowelChar(w[i - 1]) ? true : w.length === 1;
    return isVowelChar(c);
  };
  const out: Nucleus[] = [];
  for (let i = 0; i < w.length; i++) {
    if (!vowel(i)) continue;
    const prev = out[out.length - 1];
    if (prev && prev.end === i - 1) {
      const a = w[i - 1] === 'y' ? 'i' : w[i - 1];
      const b = w[i] === 'y' ? 'i' : w[i];
      // hiato: dos vocales fuertes (las débiles acentuadas cuentan como fuertes)
      if (STRONG.has(a) && STRONG.has(b)) out.push({ start: i, end: i });
      else prev.end = i;
    } else out.push({ start: i, end: i });
  }
  return out;
}

export function countSyllables(word: string): number {
  return nuclei(word).length;
}

/** Sílabas de una línea con sinalefa (vocal final + vocal/h inicial se unen). */
export function lineSyllables(line: string): number {
  const words = line.split(/\s+/).map(normalizeWord).filter(Boolean);
  let total = 0;
  for (let i = 0; i < words.length; i++) {
    total += countSyllables(words[i]);
    const next = words[i + 1];
    if (next && /[aeiouáéíóúy]$/.test(words[i]) && /^h?[aeiouáéíóú]/.test(next) && countSyllables(words[i]) > 0) total--;
  }
  return Math.max(0, total);
}

/** Índice (en la palabra normalizada) de la vocal tónica. */
function stressedVowel(w: string): number {
  const n = nuclei(w);
  if (!n.length) return -1;
  for (let i = 0; i < w.length; i++) if (ACCENTED.has(w[i])) return i;
  const target = n.length === 1 ? n[0] : /[aeiouns]$/.test(w) ? n[n.length - 2] : n[n.length - 1];
  // en un diptongo, la tónica es la fuerte; si ambas son débiles (ui/iu), la segunda
  for (let i = target.start; i <= target.end; i++) if ('aeo'.includes(w[i])) return i;
  return target.end;
}

export interface RhymeKey { consonant: string; assonant: string }

/** Clave de rima de una palabra: desde la vocal tónica hasta el final. */
export function rhymeKey(word: string): RhymeKey | null {
  const w = normalizeWord(word);
  const s = stressedVowel(w);
  if (s < 0) return null;
  const tail = strip(w.slice(s)).replace(/^qu|^gu/, '');
  // asonante: sólo vocales, sin las débiles que forman diptongo
  let ason = '';
  for (let i = 0; i < tail.length; i++) {
    const c = tail[i];
    if (!'aeiou'.includes(c)) continue;
    const prevV = i > 0 && 'aeiou'.includes(tail[i - 1]);
    const nextV = i < tail.length - 1 && 'aeiou'.includes(tail[i + 1]);
    if ((c === 'i' || c === 'u') && i > 0 && (prevV || nextV)) continue;
    ason += c;
  }
  return { consonant: tail.replace(/y$/, 'i'), assonant: ason };
}

export interface LineInfo { syllables: number; key: RhymeKey | null; lastWord: string }

export function analyzeLine(line: string): LineInfo {
  const words = line.trim().split(/\s+/).filter((x) => normalizeWord(x));
  const last = words.length ? words[words.length - 1] : '';
  const isTag = /^\s*\[.*\]\s*$/.test(line);
  return { syllables: isTag ? 0 : lineSyllables(line), key: isTag || !last ? null : rhymeKey(last), lastWord: normalizeWord(last) };
}

/** Agrupa las líneas que riman (consonante primero, si no asonante). Devuelve un grupo por línea o null. */
export function rhymeGroups(lines: string[]): (number | null)[] {
  const infos = lines.map(analyzeLine);
  const count = (k: (i: LineInfo) => string | undefined) => {
    const m = new Map<string, number>();
    infos.forEach((i) => { const v = k(i); if (v) m.set(v, (m.get(v) ?? 0) + 1); });
    return m;
  };
  const cons = count((i) => i.key?.consonant);
  const ason = count((i) => i.key?.assonant);
  const ids = new Map<string, number>();
  return infos.map((i) => {
    if (!i.key) return null;
    const k = (cons.get(i.key.consonant) ?? 0) > 1 ? `c:${i.key.consonant}` : (ason.get(i.key.assonant) ?? 0) > 1 ? `a:${i.key.assonant}` : null;
    if (!k) return null;
    if (!ids.has(k)) ids.set(k, ids.size);
    return ids.get(k)!;
  });
}
