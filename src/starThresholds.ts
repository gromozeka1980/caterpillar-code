// Per-level star thresholds based on expression length (characters)
// [3-star max, 2-star max] — any passing expression gets 1 star
// Optimal solutions range from 6 to 40 chars

export const STAR_THRESHOLDS: [number, number][] = [
  [15, 30],  // 1:  Palindrome — c==c[::-1] (10)
  [16, 30],  // 2:  Endpoints differ — c[0]!=c[-1] (11)
  [10, 20],  // 3:  Contains color 1 — 1 in c (6)
  [18, 32],  // 4:  Not (pink AND sage) — f[0]*f[3]<1 (11)
  [20, 34],  // 5:  Exactly 3 distinct — len(set(c))==3 (14)
  [12, 24],  // 6:  Exactly 3 of color 0 — f[0]==3 (7)
  [14, 26],  // 7:  More sage than dark — f[3]>f[2] (9)
  [46, 55],  // 8:  No 0-2 adjacency — all({x,y}!={0,2}for x,y in zip(c,c[1:])) (40)
  [18, 32],  // 9:  count(0)+count(3)==5 — f[0]+f[3]==5 (12)
  [28, 42],  // 10: Min run length == 2 — min(b for _,b in s)==2 (22)
  [14, 26],  // 11: Exactly 4 runs — len(s)==4 (9)
  [30, 44],  // 12: Color 1 in exactly 2 runs — sum(a==1for a,b in s)==2 (24)
  [30, 44],  // 13: Exactly 2 runs of length 2 — sum(b==2for a,b in s)==2 (24)
  [28, 42],  // 14: Max run length == 2 — max(b for _,b in s)==2 (22)
  [46, 55],  // 15: Monotonic run lengths — sorted(l:=[b for _,b in s])in(l,l[::-1]) (40)
  [34, 48],  // 16: All colors same count — len({f[i]for i in set(c)})<2 (27)
  [44, 55],  // 17: Max run length unique — (l:=[b for _,b in s]).count(max(l))==1 (38)
  [20, 34],  // 18: Exactly 3 unique run configs — len(set(s))==3 (14)
  [44, 55],  // 19: Min run length unique — (l:=[b for _,b in s]).count(min(l))==1 (38)
  [26, 40],  // 20: All runs unique — len(set(s))==len(s) (19)
];

export function getStars(levelIndex: number, codeLength: number): number {
  const [three, two] = STAR_THRESHOLDS[levelIndex];
  if (codeLength <= three) return 3;
  if (codeLength <= two) return 2;
  return 1;
}

export const MAX_CODE_LENGTH = 60;
