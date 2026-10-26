import { mulberry32, shuffle } from '../../shared/lib/rng.ts';

/** FNV-1a: a stable 32-bit hash of a string. */
function hashText(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The display order of a question's options: stable for the question (so it doesn't jump on re-render or between
 * languages, as it is seeded by the English text), and spread evenly, since the data always lists the right answer first.
 */
export function optionOrder(text: string, k: number, n: number): number[] {
  return shuffle([...Array(n).keys()], mulberry32(hashText(text) ^ Math.imul(k + 1, 0x9e3779b1)));
}

/** 0 … n−1 in a stable shuffled order that is never the identity (for n > 1): order and match questions. */
export function shuffled(n: number, text: string, salt: number): number[] {
  const idx = shuffle([...Array(n).keys()], mulberry32(hashText(text) ^ Math.imul(salt + 1, 0x85ebca6b)));
  if (n > 1 && idx.every((v, j) => v === j)) idx.push(idx.shift()!);
  return idx;
}
