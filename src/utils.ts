// Exact port of utils.py — sequence generation and sampling

import type { RuleFunc } from './rules';

function nextNum(l: number[], base: number): number[] {
  if (l.length === 0) return [-1];
  if (l[l.length - 1] === base - 1) return [...nextNum(l.slice(0, -1), base), 0];
  return [...l.slice(0, -1), l[l.length - 1] + 1];
}

function* nDigGen(n: number, base: number): Generator<number[]> {
  let l = new Array(n).fill(0);
  while (l[0] !== -1) {
    yield [...l];
    l = nextNum(l, base);
  }
}

export function* generateCombinations(base: number, n: number): Generator<number[]> {
  for (let i = 1; i <= n; i++) {
    for (const x of nDigGen(i, base)) {
      yield x;
    }
  }
}

export type Sequence = number[];

export function getValidInvalid(func: RuleFunc): { valid: Sequence[]; invalid: Sequence[] } {
  const valid: Sequence[] = [];
  const invalid: Sequence[] = [];
  for (const c of generateCombinations(4, 6)) {
    if (func(c)) {
      valid.push([...c]);
    } else {
      invalid.push([...c]);
    }
  }
  return { valid, invalid };
}

/** Round-robin sampling from lists grouped by length */
function f1Lists(lists: Sequence[][], n: number): Sequence[] {
  const result: Sequence[] = [];
  while (lists.length > 0) {
    for (const lst of lists) {
      result.push(lst[0]);
      if (result.length === n) return result;
    }
    lists = lists.map(lst => lst.slice(1)).filter(lst => lst.length > 0);
  }
  return result;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Key function for sequence deduplication and set operations */
function seqKey(s: Sequence): string {
  return s.join(',');
}

export function getN(n: number, sequence: Sequence[], forbidden: Sequence[] = []): Sequence[] {
  const forbiddenSet = new Set(forbidden.map(seqKey));
  const filtered = sequence.filter(s => !forbiddenSet.has(seqKey(s)));

  // Remove duplicates
  const seen = new Set<string>();
  const unique: Sequence[] = [];
  for (const s of filtered) {
    const key = seqKey(s);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
  }

  // Sort by length, then group by length
  unique.sort((a, b) => a.length - b.length);
  const groups: Map<number, Sequence[]> = new Map();
  for (const s of unique) {
    const len = s.length;
    if (!groups.has(len)) groups.set(len, []);
    groups.get(len)!.push(s);
  }

  // Shuffle within each group
  const lists: Sequence[][] = [];
  for (const [, group] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    lists.push(shuffle(group));
  }

  // Round-robin sample, then sort by length
  return f1Lists(lists, n).sort((a, b) => a.length - b.length);
}
