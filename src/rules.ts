// Game levels — each level is a rule described by a boolean function.
// Exact port of rules.py

export type RuleFunc = (l: number[]) => boolean;

/** Run-length encode: groups consecutive identical elements into [value, count] pairs */
export function seqs(s: number[]): [number, number][] {
  const result: [number, number][] = [];
  if (s.length === 0) return result;
  let current = s[0];
  let count = 1;
  for (let i = 1; i < s.length; i++) {
    if (s[i] === current) {
      count++;
    } else {
      result.push([current, count]);
      current = s[i];
      count = 1;
    }
  }
  result.push([current, count]);
  return result;
}

// Palindrome
function f1(l: number[]): boolean {
  const rev = [...l].reverse();
  return l.length === rev.length && l.every((v, i) => v === rev[i]);
}

// Endpoints differ
function f2(l: number[]): boolean {
  return l[0] !== l[l.length - 1];
}

// Contains color 1
function f3(l: number[]): boolean {
  return l.includes(1);
}

// Not (contains 0 AND contains 3)
function f4(l: number[]): boolean {
  return !(l.includes(0) && l.includes(3));
}

// Exactly 3 distinct colors
function f5(l: number[]): boolean {
  return new Set(l).size === 3;
}

// Exactly 3 segments of color 0
function f6(l: number[]): boolean {
  return l.filter(x => x === 0).length === 3;
}

// Count of color 3 > count of color 2
function f7(l: number[]): boolean {
  return l.filter(x => x === 3).length > l.filter(x => x === 2).length;
}

// No 0-2 adjacency
function f8(l: number[]): boolean {
  const s = l.join('');
  return !s.includes('02') && !s.includes('20');
}

// count(0) + count(3) == 5
function f9(l: number[]): boolean {
  return l.filter(x => x === 0).length + l.filter(x => x === 3).length === 5;
}

// Min run length == 2
function f10(s: number[]): boolean {
  const runs = seqs(s);
  if (runs.length === 0) return false;
  return Math.min(...runs.map(r => r[1])) === 2;
}

// Exactly 4 runs
function f11(s: number[]): boolean {
  return seqs(s).length === 4;
}

// Color 1 appears in exactly 2 runs
function f12(s: number[]): boolean {
  return seqs(s).filter(([x]) => x === 1).length === 2;
}

// Exactly 2 runs of length 2
function f13(s: number[]): boolean {
  return seqs(s).filter(([, y]) => y === 2).length === 2;
}

// Max run length == 2
function f14(s: number[]): boolean {
  const runs = seqs(s);
  if (runs.length === 0) return false;
  return Math.max(...runs.map(r => r[1])) === 2;
}

// Monotonic run lengths (ascending or descending)
function f15(s: number[]): boolean {
  const lengths = seqs(s).map(r => r[1]);
  const sorted_asc = [...lengths].sort((a, b) => a - b);
  const sorted_desc = [...lengths].sort((a, b) => b - a);
  return (
    lengths.every((v, i) => v === sorted_asc[i]) ||
    lengths.every((v, i) => v === sorted_desc[i])
  );
}

// All colors appear same number of times
function f16(s: number[]): boolean {
  const colors = new Set(s);
  const counts = [...colors].map(c => s.filter(x => x === c).length);
  return new Set(counts).size === 1;
}

// Max run length appears exactly once
function f17(s: number[]): boolean {
  const lengths = seqs(s).map(([, y]) => y).sort((a, b) => a - b);
  return lengths.filter(x => x === lengths[lengths.length - 1]).length === 1;
}

// Exactly 3 unique run configurations
function f18(s: number[]): boolean {
  const runs = seqs(s);
  const unique = new Set(runs.map(r => `${r[0]},${r[1]}`));
  return unique.size === 3;
}

// Min run length appears exactly once
function f19(s: number[]): boolean {
  const lengths = seqs(s).map(([, y]) => y).sort((a, b) => a - b);
  return lengths.filter(x => x === lengths[0]).length === 1;
}

// All runs are unique (no duplicate run configurations)
function f20(s: number[]): boolean {
  const runs = seqs(s);
  const unique = new Set(runs.map(r => `${r[0]},${r[1]}`));
  return runs.length === unique.size;
}

export const rules: RuleFunc[] = [
  f1, f2, f3, f4, f5, f6, f7, f8, f9, f10,
  f11, f12, f13, f14, f15, f16, f17, f18, f19, f20,
];
