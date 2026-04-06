// Precompute rule signatures — bitmask of valid/invalid for all possible caterpillars

import { generateCombinations } from './utils';
import { rules, type RuleFunc } from './rules';

/** All caterpillars of length 1–6 with 4 colors, in stable order */
export let ALL_SEQS: number[][] = [];

/** Base64-encoded bitmask signatures for each of the 20 rules */
export let SIGNATURES: string[] = [];

/** Build a base64 signature from an array of boolean results */
export function buildSignature(results: boolean[]): string {
  const bytes = new Uint8Array(Math.ceil(results.length / 8));
  for (let i = 0; i < results.length; i++) {
    if (results[i]) {
      bytes[i >> 3] |= 1 << (i & 7);
    }
  }
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Compare two base64 signatures for equality */
export function compareSignatures(a: string, b: string): boolean {
  return a === b;
}

/**
 * Find the index of the first caterpillar where results differ from the rule signature.
 * Returns -1 if they match.
 */
export function findFirstMismatch(playerResults: boolean[], ruleIndex: number): number {
  const ruleSignature = SIGNATURES[ruleIndex];
  const ruleBytes = Uint8Array.from(atob(ruleSignature), c => c.charCodeAt(0));
  for (let i = 0; i < playerResults.length; i++) {
    const ruleBit = (ruleBytes[i >> 3] >> (i & 7)) & 1;
    const playerBit = playerResults[i] ? 1 : 0;
    if (ruleBit !== playerBit) return i;
  }
  return -1;
}

/**
 * Check if player results are consistent with a set of known examples.
 * Returns true if the expression agrees with all provided examples.
 */
export function isConsistentWithExamples(
  playerResults: boolean[],
  validHistory: number[][],
  invalidHistory: number[][],
): boolean {
  const seqToIndex = new Map<string, number>();
  for (let i = 0; i < ALL_SEQS.length; i++) {
    seqToIndex.set(ALL_SEQS[i].join(','), i);
  }

  for (const seq of validHistory) {
    const idx = seqToIndex.get(seq.join(','));
    if (idx !== undefined && !playerResults[idx]) return false;
  }
  for (const seq of invalidHistory) {
    const idx = seqToIndex.get(seq.join(','));
    if (idx !== undefined && playerResults[idx]) return false;
  }
  return true;
}

/** Generate all 24 permutations of [0,1,2,3] */
function allColorPermutations(): number[][] {
  const perms: number[][] = [];
  const colors = [0, 1, 2, 3];
  function permute(arr: number[], start: number) {
    if (start === arr.length) { perms.push([...arr]); return; }
    for (let i = start; i < arr.length; i++) {
      [arr[start], arr[i]] = [arr[i], arr[start]];
      permute(arr, start + 1);
      [arr[start], arr[i]] = [arr[i], arr[start]];
    }
  }
  permute(colors, 0);
  return perms;
}

/**
 * Compute canonical signature — the lexicographically smallest signature
 * across all 24 color permutations. Two rules that differ only by renaming
 * colors will produce the same canonical signature.
 */
export function computeCanonicalSignature(results: boolean[]): string {
  const perms = allColorPermutations();
  let minSig = buildSignature(results); // identity permutation

  for (const perm of perms) {
    // For this permutation, build a mapping: original caterpillar index → permuted index
    // We need to evaluate: for each caterpillar, apply the color permutation,
    // find the result of the ORIGINAL rule on the permuted caterpillar
    // But we already have results for all caterpillars — we just need to
    // reorder them based on permuted caterpillar positions

    // Build index map: permuted_seq → original index
    const permutedResults: boolean[] = new Array(ALL_SEQS.length);
    for (let i = 0; i < ALL_SEQS.length; i++) {
      // Apply inverse permutation to find which original seq maps to this one
      const permutedSeq = ALL_SEQS[i].map(c => perm[c]);
      const key = permutedSeq.join(',');
      const origIdx = seqIndex.get(key);
      if (origIdx !== undefined) {
        permutedResults[i] = results[origIdx];
      }
    }

    const sig = buildSignature(permutedResults);
    if (sig < minSig) minSig = sig;
  }

  return minSig;
}

// Index for fast caterpillar lookup by key
let seqIndex: Map<string, number> = new Map();

/** Initialize ALL_SEQS and SIGNATURES. Call once at startup. */
export function initSignatures() {
  ALL_SEQS = [];
  for (const seq of generateCombinations(4, 6)) {
    ALL_SEQS.push(seq);
  }

  // Build index for fast lookup (used by computeCanonicalSignature)
  seqIndex = new Map();
  for (let i = 0; i < ALL_SEQS.length; i++) {
    seqIndex.set(ALL_SEQS[i].join(','), i);
  }

  SIGNATURES = rules.map((rule: RuleFunc) => {
    const results = ALL_SEQS.map(seq => rule(seq));
    return buildSignature(results);
  });
}
