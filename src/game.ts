// Caterpillar Code — write Python one-liners to capture hidden rules

import { rules, type RuleFunc } from './rules';
import { getValidInvalid, getN, type Sequence } from './utils';
import { createAnimatedCaterpillar, createIdleCaterpillar, createCaterpillarCanvas, COLORS, type EyeDirection, type Mood } from './caterpillar';
import { ruleDescriptions } from './ruleDescriptions';
import { launchConfetti } from './confetti';
import { playClick, playPop, playValid, playInvalid, playSuccess, playWrong, playBackspace } from './sounds';
import { calcGameLayout, calcChooserLayout, type GameLayout } from './layout';
import { initSignatures, ALL_SEQS, buildSignature, compareSignatures, isConsistentWithExamples } from './signatures';
import { evaluateExpression, isPyodideReady } from './pyodide';
import { getStars, MAX_CODE_LENGTH, STAR_THRESHOLDS } from './starThresholds';
import { initAuth, getUser, isSignedIn, signInWithGitHub, signInWithGoogle, signOut, type CommunityLevel } from './supabase';
import { computeCanonicalSignature } from './signatures';
import * as api from './api';

let gameLayout: GameLayout = calcGameLayout();

type Screen = 'menu' | 'chooser' | 'level' | 'help' | 'community' | 'create-level' | 'leaderboard' | 'profile';

interface LevelProgress {
  passed: boolean;
  stars: number;       // 1-3
  bestLength: number;  // shortest passing expression length
  bestExpression?: string; // shortest passing expression
}

interface GameState {
  screen: Screen;
  currentLevel: number;
  currentRule: RuleFunc | null;
  progress: Map<number, LevelProgress>;
  valids: Sequence[];
  invalids: Sequence[];
  validHistory: Sequence[];
  invalidHistory: Sequence[];
  inputChain: number[];
  codeInput: string;
  codeError: string | null;
  codeSubmitting: boolean;
  testedCount: number;
  animatedInstances: { destroy: () => void }[];
  isTutorial: boolean;
  tutorialStep: number;
  tutorialSeenValid: boolean;
  tutorialSeenInvalid: boolean;
  cheatSheetOpen: boolean;
  communityLevel: CommunityLevel | null;
}

const state: GameState = {
  screen: 'menu',
  currentLevel: -1,
  currentRule: null,
  progress: loadProgress(),
  valids: [],
  invalids: [],
  validHistory: [],
  invalidHistory: [],
  inputChain: [],
  codeInput: '',
  codeError: null,
  codeSubmitting: false,
  testedCount: 0,
  animatedInstances: [],
  isTutorial: false,
  tutorialStep: 0,
  tutorialSeenValid: false,
  tutorialSeenInvalid: false,
  cheatSheetOpen: false,
  communityLevel: null,
};

function loadProgress(): Map<number, LevelProgress> {
  try {
    const s = localStorage.getItem('caterpillar-code-progress');
    if (s) {
      const arr: [number, LevelProgress][] = JSON.parse(s);
      return new Map(arr);
    }
  } catch { /* ignore */ }
  return new Map();
}

function saveProgress() {
  localStorage.setItem('caterpillar-code-progress', JSON.stringify([...state.progress.entries()]));
}

function seqKey(s: Sequence): string {
  return s.join(',');
}

function destroyAnimations() {
  for (const a of state.animatedInstances) a.destroy();
  state.animatedInstances = [];
}

// ——— Helpers ———

function clearScreen() {
  destroyAnimations();
  document.getElementById('app')!.innerHTML = '';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function toRGB(c: [number, number, number]): string {
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}

let idleStaggerCounter = 0;

function renderCaterpillarItem(chain: Sequence, eyeDir: EyeDirection = 'forward', mood: Mood = 'neutral', id?: string): HTMLElement {
  const wrapper = el('div', 'caterpillar-item');
  if (id) wrapper.id = id;
  const idle = createIdleCaterpillar(chain, gameLayout.catW, gameLayout.catH, eyeDir, mood, idleStaggerCounter++);
  wrapper.appendChild(idle.canvas);
  state.animatedInstances.push(idle);
  return wrapper;
}


// ——— Caterpillar-Shaped Level Chooser ———

function segColorCSS(i: number): string {
  const c = COLORS[i % 4];
  return toRGB(c);
}

function segColorDimCSS(i: number): string {
  const c = COLORS[i % 4];
  const bg: [number, number, number] = [0.059, 0.055, 0.09];
  const r = Math.round((c[0] * 0.25 + bg[0] * 0.75) * 255);
  const g = Math.round((c[1] * 0.25 + bg[1] * 0.75) * 255);
  const b = Math.round((c[2] * 0.25 + bg[2] * 0.75) * 255);
  return `rgb(${r}, ${g}, ${b})`;
}

function buildSegEl(i: number, segW: number, segH: number): HTMLElement {
  const prog = state.progress.get(i);
  const passed = prog?.passed ?? false;
  const stars = prog?.stars ?? 0;
  const unlocked = i === 0 || (state.progress.get(i - 1)?.passed ?? false);
  const isHead = i === 0;
  const isTail = i === 19;

  const seg = el('div', `seg ${passed ? 'seg-passed' : ''} ${unlocked ? '' : 'seg-locked'} ${isHead ? 'seg-head' : ''} ${isTail ? 'seg-tail' : ''}`);
  seg.style.width = `${segW}px`;
  seg.style.height = `${segH}px`;
  seg.style.backgroundColor = unlocked ? segColorCSS(i) : segColorDimCSS(i);

  if (isHead) {
    const eyes = el('div', 'seg-eyes');
    eyes.innerHTML = '<span class="seg-eye"></span><span class="seg-eye"></span>';
    seg.appendChild(eyes);
  }

  const num = el('div', 'seg-num', String(i + 1));
  seg.appendChild(num);

  if (stars > 0) {
    const starsEl = el('div', 'seg-stars');
    for (let s = 0; s < 3; s++) {
      const star = el('span', s < stars ? 'star filled' : 'star empty');
      star.textContent = '\u2605';
      starsEl.appendChild(star);
    }
    seg.appendChild(starsEl);
  }

  if (unlocked) {
    seg.addEventListener('click', () => { playClick(); startLevel(i); });
  }

  return seg;
}

function connColorFor(i: number): string {
  const unlocked = i === 0 || (state.progress.get(i - 1)?.passed ?? false);
  return unlocked ? segColorCSS(i) : segColorDimCSS(i);
}

// Portrait: rows of 4, flow left→right then right→left, vertical bends
function renderChooserPortrait(path: HTMLElement, L: { segW: number; segH: number }) {
  const COLS = 4;
  const groups: number[][] = [];
  for (let i = 0; i < 20; i += COLS) {
    groups.push(Array.from({ length: Math.min(COLS, 20 - i) }, (_, j) => i + j));
  }

  const gap = Math.round(L.segW * 0.05);
  const colTemplate = Array.from({ length: COLS }, () => `${L.segW}px`).join(` ${gap}px `);
  const connW = gap + L.segW;
  const connH = L.segH;
  const connMargin = -Math.round(L.segW * 0.5);
  const bendH = Math.round(L.segH * 2.0);
  const bendMargin = -Math.round(L.segH * 0.5);

  groups.forEach((group, gi) => {
    const rowEl = el('div', 'path-row');
    rowEl.style.gridTemplateColumns = colTemplate;
    const display = gi % 2 === 1 ? [...group].reverse() : group;

    for (let di = 0; di < display.length; di++) {
      if (di > 0) {
        const connI = gi % 2 === 0 ? display[di - 1] : display[di];
        const conn = el('div', 'seg-conn');
        conn.style.backgroundColor = connColorFor(connI);
        conn.style.width = `${connW}px`;
        conn.style.height = `${connH}px`;
        conn.style.margin = `0 ${connMargin}px`;
        rowEl.appendChild(conn);
      }
      rowEl.appendChild(buildSegEl(display[di], L.segW, L.segH));
    }
    path.appendChild(rowEl);

    if (gi < groups.length - 1) {
      const bendI = group[COLS - 1];
      const bendRow = el('div', 'path-row bend-row');
      bendRow.style.gridTemplateColumns = colTemplate;
      bendRow.style.height = `${bendH}px`;
      bendRow.style.margin = `${bendMargin}px 0`;
      const gridCol = gi % 2 === 0 ? (COLS * 2 - 1) : 1;
      const bar = el('div', 'bend-bar');
      bar.style.backgroundColor = connColorFor(bendI);
      bar.style.width = `${L.segW}px`;
      bar.style.gridColumn = String(gridCol);
      bendRow.appendChild(bar);
      path.appendChild(bendRow);
    }
  });
}

// Landscape: columns of 3, flow down→up→down, horizontal bends
function renderChooserLandscape(path: HTMLElement, L: { segW: number; segH: number }) {
  path.classList.add('path-map-landscape');
  const ROWS = 3;
  const cols: number[][] = [];
  for (let i = 0; i < 20; i += ROWS) {
    cols.push(Array.from({ length: Math.min(ROWS, 20 - i) }, (_, j) => i + j));
  }

  const gap = Math.round(L.segH * 0.05);
  const rowTemplate = Array.from({ length: ROWS }, () => `${L.segH}px`).join(` ${gap}px `);
  const vConnW = L.segW;
  const vConnH = gap + L.segH;
  const vConnMargin = -Math.round(L.segH * 0.5);
  const hBendW = Math.round(L.segW * 2.0);
  const hBendMargin = -Math.round(L.segW * 0.5);

  for (let ci = 0; ci < cols.length; ci++) {
    const group = cols[ci];
    const display = ci % 2 === 1 ? [...group].reverse() : group;

    const colEl = el('div', 'path-col');
    colEl.style.gridTemplateRows = rowTemplate;

    for (let di = 0; di < display.length; di++) {
      if (di > 0) {
        const connI = ci % 2 === 0 ? display[di - 1] : display[di];
        const conn = el('div', 'seg-conn-v');
        conn.style.backgroundColor = connColorFor(connI);
        conn.style.width = `${vConnW}px`;
        conn.style.height = `${vConnH}px`;
        conn.style.margin = `${vConnMargin}px 0`;
        colEl.appendChild(conn);
      }
      colEl.appendChild(buildSegEl(display[di], L.segW, L.segH));
    }
    path.appendChild(colEl);

    if (ci < cols.length - 1) {
      const bendI = group[group.length - 1];
      const bendCol = el('div', 'path-col bend-col');
      bendCol.style.gridTemplateRows = rowTemplate;
      bendCol.style.width = `${hBendW}px`;
      bendCol.style.margin = `0 ${hBendMargin}px`;
      const gridRow = ci % 2 === 0 ? (group.length * 2 - 1) : 1;
      const bar = el('div', 'bend-bar-h');
      bar.style.backgroundColor = connColorFor(bendI);
      bar.style.gridRow = String(gridRow);
      bar.style.height = `${L.segH}px`;
      bendCol.appendChild(bar);
      path.appendChild(bendCol);
    }
  }
}

// ——— Main Menu ———

function renderMenu() {
  clearScreen();
  const app = document.getElementById('app')!;
  const container = el('div', 'menu-screen');

  const title = el('h1', 'game-title', 'Caterpillar Code');
  container.appendChild(title);
  const subtitle = el('p', 'game-subtitle', 'Write Python one-liners to crack the rules');
  container.appendChild(subtitle);

  // Animated demo caterpillar
  const demo = el('div', 'menu-demo');
  const anim = createAnimatedCaterpillar([0, 1, 2, 1, 0], 260, 52, 'forward', 'happy');
  demo.appendChild(anim.canvas);
  state.animatedInstances.push(anim);
  container.appendChild(demo);

  const btnCol = el('div', 'menu-buttons');

  const playBtn = el('button', 'menu-btn menu-btn-primary', '\u25b6 Play');
  playBtn.addEventListener('click', () => { playClick(); goToChooser(); });
  btnCol.appendChild(playBtn);

  const communityBtn = el('button', 'menu-btn', '\ud83c\udf10 Community Levels');
  communityBtn.addEventListener('click', () => { playClick(); showCommunityBrowser(); });
  btnCol.appendChild(communityBtn);

  const helpBtn = el('button', 'menu-btn', '\u2753 How to play');
  helpBtn.addEventListener('click', () => { playClick(); showHelp(); });
  btnCol.appendChild(helpBtn);

  container.appendChild(btnCol);

  // Auth section
  const authSection = el('div', 'auth-section');
  if (isSignedIn()) {
    const user = getUser()!;
    const avatar = user.user_metadata?.avatar_url;
    const name = user.user_metadata?.user_name || user.user_metadata?.name || user.email || 'User';

    const userRow = el('div', 'auth-user-row');
    if (avatar) {
      const img = document.createElement('img');
      img.src = avatar;
      img.className = 'auth-avatar';
      img.alt = name;
      userRow.appendChild(img);
    }
    const nameEl = el('span', 'auth-username', name);
    userRow.appendChild(nameEl);
    authSection.appendChild(userRow);

    const btnRow = el('div', 'auth-btn-row');
    const profileBtn = el('button', 'auth-link', 'Profile');
    profileBtn.addEventListener('click', () => { playClick(); showProfile(); });
    btnRow.appendChild(profileBtn);
    const lbBtn = el('button', 'auth-link', 'Leaderboard');
    lbBtn.addEventListener('click', () => { playClick(); showLeaderboard(); });
    btnRow.appendChild(lbBtn);
    const outBtn = el('button', 'auth-link', 'Sign out');
    outBtn.addEventListener('click', async () => { await signOut(); renderMenu(); });
    btnRow.appendChild(outBtn);
    authSection.appendChild(btnRow);
  } else {
    const signInLabel = el('div', 'auth-label', 'Sign in to create & rate levels');
    authSection.appendChild(signInLabel);
    const btnRow = el('div', 'auth-btn-row');
    const ghBtn = el('button', 'auth-btn-oauth', '\uf09b GitHub');
    ghBtn.style.fontFamily = 'system-ui, sans-serif';
    ghBtn.addEventListener('click', () => signInWithGitHub());
    btnRow.appendChild(ghBtn);
    const gBtn = el('button', 'auth-btn-oauth', 'Google');
    gBtn.addEventListener('click', () => signInWithGoogle());
    btnRow.appendChild(gBtn);
    authSection.appendChild(btnRow);
  }
  container.appendChild(authSection);

  app.appendChild(container);
}

// ——— Share Progress ———

function shareProgress(btn: HTMLElement) {
  if (!isSignedIn()) return;
  const userId = getUser()!.id;
  const base = window.location.href.split('?')[0].split('#')[0];
  const url = `${base}?user=${userId}`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      btn.textContent = '\u2705 Link copied!';
      setTimeout(() => { btn.textContent = '\ud83d\udcca Share progress'; }, 2000);
    });
  } else {
    prompt('Copy this link to share your progress:', url);
  }
}

// ——— Sync localStorage progress to Supabase ———

async function syncProgressToServer() {
  if (!isSignedIn()) return;
  const completions: { level_index: number; stars: number; best_length: number; expression?: string }[] = [];
  for (const [level, prog] of state.progress) {
    if (prog.passed) {
      completions.push({
        level_index: level,
        stars: prog.stars,
        best_length: prog.bestLength ?? 0,
        expression: prog.bestExpression,
      });
    }
  }
  if (completions.length > 0) {
    await api.syncBuiltinProgress(completions).catch(() => {});
  }
}

function renderChooser() {
  clearScreen();
  const app = document.getElementById('app')!;
  const container = el('div', 'chooser-screen');

  // Top bar with back button
  const topBar = el('div', 'top-bar');
  const backBtn = el('button', 'back-btn', '\u2190');
  backBtn.addEventListener('click', () => { playClick(); state.screen = 'menu'; renderMenu(); });
  topBar.appendChild(backBtn);
  const levelLabel = el('span', 'level-label', 'Choose a level');
  topBar.appendChild(levelLabel);
  container.appendChild(topBar);

  const L = calcChooserLayout();

  const pathWrap = el('div', 'path-wrap');
  const path = el('div', 'path-map');

  if (!L.portrait) {
    renderChooserLandscape(path, L);
  } else {
    renderChooserPortrait(path, L);
  }

  pathWrap.appendChild(path);
  container.appendChild(pathWrap);

  // Share button (only for signed-in users with progress)
  if (isSignedIn() && state.progress.size > 0) {
    const shareBtn = el('button', 'share-btn', '\ud83d\udcca Share progress');
    shareBtn.addEventListener('click', () => { playClick(); shareProgress(shareBtn); });
    container.appendChild(shareBtn);
  }

  app.appendChild(container);
}

// ——— Tutorial ———

const TUTORIAL_RULE: RuleFunc = (seq: Sequence) => new Set(seq).size === 1;

const TUTORIAL_VALID: Sequence[] = [[0,0,0], [1,1,1,1], [2,2], [3,3,3], [0,0,0,0,0], [1,1], [2,2,2,2], [3,3,3,3,3]];
const TUTORIAL_INVALID: Sequence[] = [[0,1,0], [1,2,3], [0,0,1], [3,2,3], [1,0,1,0], [2,3,2], [0,1,2,3], [1,1,0]];

interface TutorialHintDef {
  text: string;
  hasNext?: boolean;
}

const TUTORIAL_HINTS: TutorialHintDef[] = [
  // 0: Look at examples
  { text: 'These caterpillars follow a secret rule. The left ones are valid, the right ones are not. Can you spot the difference?', hasNext: true },
  // 1: Pick a color
  { text: 'Pick a color to start building a caterpillar.' },
  // 2: Add more segments
  { text: 'Add a few more segments.' },
  // 3: Watch the face
  { text: 'Watch the caterpillar\u2019s face \u2014 it smiles if it\u2019s valid, frowns if it\u2019s not. Try both!' },
  // 4: Explain the + button (auto-advances on submit)
  { text: 'Press + to save a caterpillar to your board. This helps you compare and spot the pattern.' },
  // 5: Free exploration + code hint + cheat-sheet mention
  { text: '' },
  // 6: Code submission in progress — no hint
  { text: '' },
];

function startTutorial() {
  state.isTutorial = true;
  state.tutorialStep = 0;
  state.tutorialSeenValid = false;
  state.tutorialSeenInvalid = false;
  state.currentLevel = -1;
  state.currentRule = TUTORIAL_RULE;
  state.inputChain = [];
  state.codeInput = '';
  state.codeError = null;
  state.testedCount = 0;

  state.valids = TUTORIAL_VALID;
  state.invalids = TUTORIAL_INVALID;
  state.validHistory = TUTORIAL_VALID.slice(0, 3);
  state.invalidHistory = TUTORIAL_INVALID.slice(0, 3);

  state.screen = 'level';
  renderLevel();
  renderTutorialHint();
}

function removeTutorialHint() {
  document.getElementById('tutorial-hint')?.remove();
}

function renderTutorialHint() {
  removeTutorialHint();
  if (!state.isTutorial) return;
  const step = state.tutorialStep;
  if (step >= TUTORIAL_HINTS.length) return;
  const def = TUTORIAL_HINTS[step];

  let text = def.text;
  const showNext = def.hasNext ?? false;

  // Step 5: dynamic text
  if (step === 5) {
    text = state.testedCount < 2
      ? 'Try saving a few more caterpillars to spot the pattern.'
      : 'When you think you know the rule, write a Python expression below. Hit \u24d8 for a quick reference on the available variables.';
  }
  if (!text) return;

  const hint = el('div', 'tutorial-hint');
  hint.id = 'tutorial-hint';

  const textEl = el('div', 'tutorial-hint-text', text);
  hint.appendChild(textEl);

  if (showNext) {
    const nextBtn = el('button', 'tutorial-next-btn', step === 0 ? 'Got it' : 'Continue');
    nextBtn.addEventListener('click', () => {
      playClick();
      state.tutorialStep++;
      renderTutorialHint();
    });
    hint.appendChild(nextBtn);
  }

  const bottom = document.getElementById('bottom-section');
  if (bottom) {
    bottom.prepend(hint);
  }
}

function advanceTutorial(action: 'addColor' | 'submit' | 'startCode') {
  if (!state.isTutorial) return;
  const step = state.tutorialStep;

  if (step === 1 && action === 'addColor') {
    state.tutorialStep = 2;
    renderTutorialHint();
  } else if (step === 2 && action === 'addColor' && state.inputChain.length >= 3) {
    state.tutorialStep = 3;
    renderTutorialHint();
  } else if (step === 4 && action === 'submit') {
    state.tutorialStep = 5;
    renderTutorialHint();
  } else if (step === 5 && action === 'submit') {
    renderTutorialHint();
  } else if ((step === 4 || step === 5) && action === 'startCode') {
    state.tutorialStep = 6;
    removeTutorialHint();
  }
}

function handleTutorialPass() {
  playSuccess();

  const overlay = getOrCreateOverlay();
  const app = document.getElementById('app')!;
  launchConfetti(app, 3000);

  const msg = el('div', 'victory-text', 'You got it!');
  overlay.appendChild(msg);

  const reveal = el('div', 'rule-reveal');
  const revealTitle = el('div', 'reveal-title', 'The rule was:');
  reveal.appendChild(revealTitle);
  const revealText = el('div', 'reveal-text', 'All segments must be the same color.');
  reveal.appendChild(revealText);
  overlay.appendChild(reveal);

  const codeReveal = el('div', 'code-reveal', `Your solution: ${state.codeInput}`);
  overlay.appendChild(codeReveal);

  const readyMsg = el('div', 'tutorial-ready-msg', "You're ready for the real puzzles!");
  overlay.appendChild(readyMsg);

  const startBtn = el('button', 'next-level-btn', 'Start playing \u2192');
  startBtn.addEventListener('click', () => {
    removeOverlay();
    playClick();
    state.isTutorial = false;
    goToChooser();
  });
  overlay.appendChild(startBtn);
}

// ——— Level ———

function startLevel(levelId: number) {
  state.currentLevel = levelId;
  state.currentRule = rules[levelId];
  state.communityLevel = null;
  state.inputChain = [];
  // Pre-fill with last successful solution if available
  const prevProgress = state.progress.get(levelId);
  state.codeInput = prevProgress?.bestExpression ?? '';
  state.codeError = null;
  state.codeSubmitting = false;
  state.testedCount = 0;

  const { valid, invalid } = getValidInvalid(state.currentRule);
  state.valids = valid;
  state.invalids = invalid;
  state.validHistory = getN(7, valid);
  state.invalidHistory = getN(7, invalid);

  state.screen = 'level';
  renderLevel();
}

function renderLevel() {
  gameLayout = calcGameLayout();
  idleStaggerCounter = 0;
  clearScreen();
  const app = document.getElementById('app')!;
  const container = el('div', 'level-screen');

  // Top bar
  const topBar = el('div', 'top-bar');
  const backBtn = el('button', 'back-btn', '\u2190');
  backBtn.addEventListener('click', () => {
    playClick();
    if (state.isTutorial) {
      state.isTutorial = false;
      state.screen = 'menu';
      renderMenu();
    } else if (state.communityLevel) {
      state.communityLevel = null;
      showCommunityBrowser();
    } else {
      goToChooser();
    }
  });
  topBar.appendChild(backBtn);
  const levelLabel = el('span', 'level-label',
    state.isTutorial ? 'Tutorial'
    : state.communityLevel ? state.communityLevel.title
    : `Level ${state.currentLevel + 1}`
  );
  topBar.appendChild(levelLabel);

  container.appendChild(topBar);

  // Show rule button for passed levels
  const prog = state.progress.get(state.currentLevel);
  if (prog?.passed) {
    const ruleBtn = el('button', 'rule-toggle-btn', 'Show rule');
    ruleBtn.addEventListener('click', () => {
      if (ruleBtn.classList.contains('revealed')) {
        ruleBtn.classList.remove('revealed');
        ruleBtn.textContent = 'Show rule';
      } else {
        ruleBtn.classList.add('revealed');
        ruleBtn.textContent = ruleDescriptions[state.currentLevel];
      }
    });
    container.appendChild(ruleBtn);
  }

  // History panels
  const historyArea = el('div', 'history-area');

  const validPanel = el('div', 'history-panel valid-panel');
  const validHeader = el('div', 'panel-header valid-header');
  validHeader.innerHTML = '<span class="header-icon">\u2714</span> Valid';
  validPanel.appendChild(validHeader);
  const validList = el('div', 'caterpillar-list');
  validList.id = 'valid-list';
  if (gameLayout.panelCols > 1) {
    validList.style.display = 'grid';
    validList.style.gridTemplateColumns = 'repeat(2, 1fr)';
    validList.style.alignContent = 'space-evenly';
  }
  for (const seq of state.validHistory) {
    validList.appendChild(renderCaterpillarItem(seq, 'forward', 'happy'));
  }
  validPanel.appendChild(validList);
  historyArea.appendChild(validPanel);

  const invalidPanel = el('div', 'history-panel invalid-panel');
  const invalidHeader = el('div', 'panel-header invalid-header');
  invalidHeader.innerHTML = '<span class="header-icon">\u2718</span> Invalid';
  invalidPanel.appendChild(invalidHeader);
  const invalidList = el('div', 'caterpillar-list');
  invalidList.id = 'invalid-list';
  if (gameLayout.panelCols > 1) {
    invalidList.style.display = 'grid';
    invalidList.style.gridTemplateColumns = 'repeat(2, 1fr)';
    invalidList.style.alignContent = 'space-evenly';
  }
  for (const seq of state.invalidHistory) {
    invalidList.appendChild(renderCaterpillarItem(seq, 'forward', 'sad'));
  }
  invalidPanel.appendChild(invalidList);
  historyArea.appendChild(invalidPanel);

  container.appendChild(historyArea);

  // Bottom section
  const bottomSection = el('div', 'bottom-section');
  bottomSection.id = 'bottom-section';

  container.appendChild(bottomSection);

  app.appendChild(container);

  renderGameInput();
}

// ——— Game Input ———


function renderGameInput() {
  const bottom = document.getElementById('bottom-section')!;
  bottom.innerHTML = '';

  // Single row: preview + color buttons + action buttons
  const builderRow = el('div', 'builder-row');

  const previewWrapper = el('div', 'input-preview');
  previewWrapper.id = 'input-preview';
  builderRow.appendChild(previewWrapper);
  updateInputPreview();

  const colorGroup = el('div', 'btn-group color-group');
  for (let c = 0; c < 4; c++) {
    const btn = el('button', 'color-btn');
    btn.style.backgroundColor = toRGB(COLORS[c]);
    btn.addEventListener('click', () => { playClick(); addColor(c); });
    colorGroup.appendChild(btn);
  }
  builderRow.appendChild(colorGroup);

  const actionGroup = el('div', 'btn-group action-group');
  const bksp = el('button', 'action-btn backspace-btn', '\u232b');
  bksp.addEventListener('click', () => { playBackspace(); backspace(); });
  actionGroup.appendChild(bksp);
  const okBtn = el('button', 'action-btn ok-btn', '+');
  okBtn.title = 'Add to samples';
  okBtn.addEventListener('click', () => submitChain());
  actionGroup.appendChild(okBtn);
  builderRow.appendChild(actionGroup);

  bottom.appendChild(builderRow);

  // ——— Code editor section ———
  const codeSection = el('div', 'code-section');

  const codeLabelRow = el('div', 'code-label-row');
  const codeLabel = el('span', 'code-label', 'Python expression:');
  codeLabelRow.appendChild(codeLabel);

  // Cheat-sheet toggle
  const cheatBtn = el('button', 'cheat-toggle-btn', '?');
  cheatBtn.title = 'Show reference';
  cheatBtn.addEventListener('click', () => {
    state.cheatSheetOpen = !state.cheatSheetOpen;
    const sheet = document.getElementById('cheat-sheet');
    if (sheet) sheet.style.display = state.cheatSheetOpen ? 'block' : 'none';
    cheatBtn.classList.toggle('active', state.cheatSheetOpen);
  });
  codeLabelRow.appendChild(cheatBtn);
  codeSection.appendChild(codeLabelRow);

  // Cheat-sheet panel
  const cheatSheet = el('div', 'cheat-sheet');
  cheatSheet.id = 'cheat-sheet';
  cheatSheet.style.display = state.cheatSheetOpen ? 'block' : 'none';
  // Color legend
  const colorsRow = el('div', 'cheat-colors');
  for (let ci = 0; ci < 4; ci++) {
    const swatch = el('span', 'cheat-color');
    swatch.style.background = toRGB(COLORS[ci]);
    if (ci === 2) swatch.style.color = '#fff';
    swatch.textContent = String(ci);
    colorsRow.appendChild(swatch);
  }
  cheatSheet.appendChild(colorsRow);

  const catW = 120;
  const catH = 22;

  const varsDiv = el('div', 'cheat-vars');

  // c — color list: all 4 distinct colors, easy to read off
  const cSeq = [0, 1, 2, 3];
  const cRow = el('div', 'cheat-var-row');
  cRow.innerHTML = '<code>c</code> \u2014 color list <span class="cheat-ex">[0, 1, 2, 3]</span>';
  cRow.appendChild(createCaterpillarCanvas(cSeq, catW, catH, 'forward', 'neutral'));
  varsDiv.appendChild(cRow);

  // f — frequencies: repeated colors make counting obvious
  const fSeq = [0, 0, 0, 1, 3];
  const fRow = el('div', 'cheat-var-row');
  fRow.innerHTML = '<code>f</code> \u2014 frequencies <span class="cheat-ex">{0:3, 1:1, 2:0, 3:1}</span>';
  fRow.appendChild(createCaterpillarCanvas(fSeq, catW, catH, 'forward', 'neutral'));
  varsDiv.appendChild(fRow);

  // s — segments: clear runs of same color
  const sSeq = [1, 1, 2, 2, 2, 3];
  const sRow = el('div', 'cheat-var-row');
  sRow.innerHTML = '<code>s</code> \u2014 segments <span class="cheat-ex">[(1,2),(2,3),(3,1)]</span>';
  sRow.appendChild(createCaterpillarCanvas(sSeq, catW, catH, 'forward', 'neutral'));
  varsDiv.appendChild(sRow);

  cheatSheet.appendChild(varsDiv);

  // Example expression with a matching caterpillar
  const exampleDiv = el('div', 'cheat-example-row');
  const exampleCatSeq = [0, 1, 2, 1, 0]; // 3 distinct colors — matches len(set(c))==3
  exampleDiv.innerHTML = 'Example: <code>len(set(c))==3</code> <span class="cheat-ex">\u2014 exactly 3 distinct colors</span>';
  exampleDiv.appendChild(createCaterpillarCanvas(exampleCatSeq, catW, catH, 'forward', 'happy'));
  cheatSheet.appendChild(exampleDiv);

  codeSection.appendChild(cheatSheet);

  // Code input row
  const codeInputRow = el('div', 'code-input-row');
  const codeInput = el('textarea', 'code-input') as HTMLTextAreaElement;
  codeInput.rows = 1;
  codeInput.placeholder = 'e.g. f[0] > f[1]';
  codeInput.maxLength = MAX_CODE_LENGTH;
  codeInput.value = state.codeInput;
  codeInput.spellcheck = false;
  codeInput.autocomplete = 'off';
  codeInput.wrap = 'soft';

  const autoResize = () => {
    codeInput.style.height = 'auto';
    codeInput.style.height = codeInput.scrollHeight + 'px';
  };

  codeInput.addEventListener('input', () => {
    // Strip newlines — keep it a one-liner
    const clean = codeInput.value.replace(/\n/g, '');
    if (clean !== codeInput.value) codeInput.value = clean;
    state.codeInput = codeInput.value;
    state.codeError = null;
    updateCharCounter();
    updateErrorDisplay();
    autoResize();
  });
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!state.codeSubmitting) submitCode();
    }
  });
  codeInput.addEventListener('focus', () => {
    setTimeout(() => {
      codeInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);
  });
  codeInputRow.appendChild(codeInput);

  const charCounter = el('span', 'char-counter');
  charCounter.id = 'char-counter';
  codeInputRow.appendChild(charCounter);
  codeSection.appendChild(codeInputRow);

  // Error display
  const errorDisplay = el('div', 'code-error');
  errorDisplay.id = 'code-error';
  codeSection.appendChild(errorDisplay);

  // Submit button
  const submitBtn = el('button', 'code-submit-btn', '\u25b6 Check solution');
  submitBtn.id = 'code-submit-btn';
  submitBtn.addEventListener('click', () => submitCode());
  codeSection.appendChild(submitBtn);

  bottom.appendChild(codeSection);

  updateCharCounter();
  updateErrorDisplay();
}

function updateCharCounter() {
  const counter = document.getElementById('char-counter');
  if (!counter) return;
  const len = state.codeInput.length;
  counter.textContent = `${len} / ${MAX_CODE_LENGTH}`;
  counter.classList.toggle('near-limit', len > MAX_CODE_LENGTH * 0.85);
  counter.classList.toggle('at-limit', len >= MAX_CODE_LENGTH);
}

function updateErrorDisplay() {
  const errEl = document.getElementById('code-error');
  if (!errEl) return;
  if (state.codeError) {
    errEl.innerHTML = '';
    errEl.textContent = state.codeError;
    errEl.style.display = 'flex';
  } else {
    errEl.innerHTML = '';
    errEl.style.display = 'none';
  }
}

// ——— Toast notification ———

function showToast(text: string, duration = 2000) {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = el('div', 'toast', text);
  toast.id = 'toast';
  document.getElementById('app')!.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-visible'), 10);
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ——— Code Submission ———

async function submitCode() {
  if (state.codeSubmitting) return;
  const expr = state.codeInput.trim();
  if (!expr) {
    state.codeError = 'Enter a Python expression';
    updateErrorDisplay();
    return;
  }
  if (expr.length > MAX_CODE_LENGTH) {
    state.codeError = `Expression too long (${expr.length} > ${MAX_CODE_LENGTH})`;
    updateErrorDisplay();
    return;
  }

  state.codeSubmitting = true;
  state.codeError = null;
  updateErrorDisplay();

  const submitBtn = document.getElementById('code-submit-btn');
  if (submitBtn) {
    submitBtn.textContent = isPyodideReady() ? '\u23f3 Checking...' : '\u23f3 Loading Python...';
    submitBtn.classList.add('submitting');
  }

  try {
    // Determine which sequences to evaluate against
    let seqs: number[][];
    let ruleResults: boolean[];

    if (state.isTutorial) {
      // Tutorial: evaluate against tutorial valid+invalid sets
      seqs = [...TUTORIAL_VALID, ...TUTORIAL_INVALID];
      ruleResults = seqs.map(s => TUTORIAL_RULE(s));
    } else {
      // Real level: evaluate against ALL sequences
      seqs = ALL_SEQS;
      ruleResults = ALL_SEQS.map(s => state.currentRule!(s));
    }

    const evalResult = await evaluateExpression(expr, seqs);

    // If ALL caterpillars threw exceptions — show error
    if (evalResult.errorCount === seqs.length) {
      const msg = evalResult.errorMessage || 'Runtime error';
      showErrorWithCaterpillar(
        msg,
        seqs[evalResult.firstErrorIndex],
      );
      playWrong();
      return;
    }

    // If SOME caterpillars threw exceptions — show where
    if (evalResult.errorCount > 0) {
      const errSeq = seqs[evalResult.firstErrorIndex];
      const msg = evalResult.errorMessage || 'Runtime error';
      showErrorWithCaterpillar(
        `${msg} (on ${evalResult.errorCount} caterpillar${evalResult.errorCount > 1 ? 's' : ''})`,
        errSeq,
      );
      playWrong();
      return;
    }

    const playerResults = evalResult.results as boolean[];

    // Warn if expression is trivially always-true or always-false
    const allTrue = playerResults.every(r => r);
    const allFalse = playerResults.every(r => !r);
    if (allTrue || allFalse) {
      state.codeError = allTrue
        ? 'Your expression is True for every caterpillar — probably a logic error (e.g. missing c== before a list?)'
        : 'Your expression is False for every caterpillar — check your logic';
      updateErrorDisplay();
      playWrong();
      return;
    }

    const playerSig = buildSignature(playerResults);
    const ruleSig = buildSignature(ruleResults);

    if (compareSignatures(playerSig, ruleSig)) {
      // Correct!
      state.codeSubmitting = false;
      if (state.isTutorial) {
        handleTutorialPass();
      } else {
        handlePass();
      }
      return; // Don't run finally — screen has changed
    } else {
      // Wrong — provide feedback
      handleWrongSubmission(playerResults, ruleResults, seqs);
    }
  } catch (err: unknown) {
    // Extract last line of traceback (e.g. "SyntaxError: invalid syntax")
    const raw = err instanceof Error ? err.message : String(err);
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const lastLine = lines[lines.length - 1] || 'Syntax error';
    // Keep only "ErrorType: message", strip module paths
    const match = lastLine.match(/^(\w+Error):\s*(.*)/);
    state.codeError = match ? `${match[1]}: ${match[2]}` : 'Syntax error';
    updateErrorDisplay();
    playWrong();
  }
  state.codeSubmitting = false;
  const btn = document.getElementById('code-submit-btn');
  if (btn) {
    btn.textContent = '\u25b6 Check solution';
    btn.classList.remove('submitting');
  }
}

function handleWrongSubmission(playerResults: boolean[], ruleResults: boolean[], seqs: number[][]) {
  // Check if consistent with visible examples first
  const consistent = isConsistentWithExamples(playerResults, state.validHistory, state.invalidHistory);

  if (consistent) {
    showToast('Nice hypothesis!');
    playPop();
  } else {
    playWrong();
  }

  // Find first mismatch
  let mismatchIdx = -1;
  for (let i = 0; i < playerResults.length; i++) {
    if (playerResults[i] !== ruleResults[i]) {
      mismatchIdx = i;
      break;
    }
  }

  if (mismatchIdx === -1) return; // shouldn't happen

  const counterexample = seqs[mismatchIdx];
  const isValid = ruleResults[mismatchIdx]; // what the rule says
  const key = seqKey(counterexample);

  // Check if already in history
  const historyList = isValid ? state.validHistory : state.invalidHistory;
  const listId = isValid ? 'valid-list' : 'invalid-list';
  const existingIdx = historyList.findIndex(s => seqKey(s) === key);

  if (existingIdx !== -1) {
    // Already visible — highlight it
    const listEl = document.getElementById(listId);
    if (listEl) {
      const items = listEl.querySelectorAll('.caterpillar-item');
      const item = items[existingIdx] as HTMLElement | undefined;
      if (item) {
        item.classList.add('highlight-flash');
        setTimeout(() => item.classList.remove('highlight-flash'), 1500);
      }
    }
  } else {
    // Not in history — add it
    if (isValid) {
      addToHistory(state.validHistory, counterexample, 'valid-list', 'forward', 'happy');
    } else {
      addToHistory(state.invalidHistory, counterexample, 'invalid-list', 'forward', 'sad');
    }
  }

  // Show counterexample inline in error area
  const playerSays = playerResults[mismatchIdx] ? 'valid' : 'invalid';
  const actualIs = isValid ? 'valid' : 'invalid';
  showErrorWithCaterpillar(
    `Your code says "${playerSays}" \u2014 but it's ${actualIs}`,
    counterexample,
    isValid ? 'happy' : 'sad',
  );
}

/** Show an error message with an inline caterpillar rendered next to it */
function showErrorWithCaterpillar(message: string, seq: number[], mood: Mood = 'neutral') {
  const errEl = document.getElementById('code-error');
  if (!errEl) return;

  errEl.innerHTML = '';
  errEl.style.display = 'flex';

  const textSpan = el('span', undefined, message);
  errEl.appendChild(textSpan);

  const canvas = createCaterpillarCanvas(seq, 100, 20, 'forward', mood);
  canvas.classList.add('error-caterpillar');
  errEl.appendChild(canvas);
}

function handlePass() {
  const codeLen = state.codeInput.trim().length;
  const isCommunity = state.communityLevel !== null;

  // Save progress for built-in levels
  if (!isCommunity) {
    const stars = getStars(state.currentLevel, codeLen);
    const existing = state.progress.get(state.currentLevel);
    const bestStars = Math.max(existing?.stars ?? 0, stars);
    const bestLength = Math.min(existing?.bestLength ?? Infinity, codeLen);

    const bestExpr = codeLen <= (existing?.bestLength ?? Infinity)
      ? state.codeInput.trim()
      : existing?.bestExpression;
    state.progress.set(state.currentLevel, {
      passed: true,
      stars: bestStars,
      bestLength,
      bestExpression: bestExpr,
    });
    saveProgress();
    // Sync to server
    if (isSignedIn()) {
      api.syncBuiltinProgress([{
        level_index: state.currentLevel,
        stars: bestStars,
        best_length: bestLength,
        expression: bestExpr,
      }]).catch(() => {});
    }
  }

  // Submit solution for community levels
  if (isCommunity && isSignedIn()) {
    api.submitSolution(state.communityLevel!.id, state.codeInput.trim(), codeLen).catch(() => {});
  }

  playSuccess();

  const overlay = getOrCreateOverlay();
  const app = document.getElementById('app')!;
  launchConfetti(app, 3000);

  if (!isCommunity) {
    const stars = getStars(state.currentLevel, codeLen);
    const starsEl = el('div', 'victory-stars');
    for (let s = 0; s < 3; s++) {
      const star = el('span', s < stars ? 'vstar filled' : 'vstar empty');
      star.textContent = '\u2605';
      star.style.animationDelay = `${s * 0.2}s`;
      starsEl.appendChild(star);
    }
    overlay.appendChild(starsEl);
  }

  const msg = el('div', 'victory-text', 'Level Complete!');
  overlay.appendChild(msg);

  // Rule reveal
  const reveal = el('div', 'rule-reveal');
  const revealTitle = el('div', 'reveal-title', 'The rule was:');
  reveal.appendChild(revealTitle);
  const revealText = el('div', 'reveal-text');
  revealText.textContent = isCommunity
    ? state.communityLevel!.expression
    : ruleDescriptions[state.currentLevel];
  reveal.appendChild(revealText);
  overlay.appendChild(reveal);

  const codeReveal = el('div', 'code-reveal');
  codeReveal.innerHTML = `Your solution: <code>${state.codeInput.trim()}</code> <span class="code-length">(${codeLen} chars)</span>`;
  overlay.appendChild(codeReveal);

  if (!isCommunity) {
    const [threeMax, twoMax] = STAR_THRESHOLDS[state.currentLevel];
    const thresholdHint = el('div', 'threshold-hint');
    thresholdHint.innerHTML = `\u2605\u2605\u2605 \u2264 ${threeMax} chars &nbsp;\u00b7&nbsp; \u2605\u2605 \u2264 ${twoMax} chars`;
    overlay.appendChild(thresholdHint);
  }

  // Rating buttons for community levels
  if (isCommunity && isSignedIn()) {
    const ratingRow = el('div', 'rating-row');
    ratingRow.appendChild(el('span', 'rating-label', 'Rate this level:'));
    const upBtn = el('button', 'rating-btn rating-up', '\u25b2');
    upBtn.addEventListener('click', () => {
      api.rateLevel(state.communityLevel!.id, 1).catch(() => {});
      upBtn.classList.add('rating-selected');
      downBtn.classList.remove('rating-selected');
    });
    ratingRow.appendChild(upBtn);
    const downBtn = el('button', 'rating-btn rating-down', '\u25bc');
    downBtn.addEventListener('click', () => {
      api.rateLevel(state.communityLevel!.id, -1).catch(() => {});
      downBtn.classList.add('rating-selected');
      upBtn.classList.remove('rating-selected');
    });
    ratingRow.appendChild(downBtn);
    overlay.appendChild(ratingRow);
  }

  const btnRow = el('div', 'victory-buttons');

  if (!isCommunity) {
    const stars = getStars(state.currentLevel, codeLen);
    if (stars < 3) {
      const retryBtn = el('button', 'next-level-btn victory-retry-btn', '\u21bb Try again');
      retryBtn.addEventListener('click', () => { removeOverlay(); playClick(); startLevel(state.currentLevel); });
      btnRow.appendChild(retryBtn);
    }
  }

  const nextBtn = el('button', 'next-level-btn');
  if (isCommunity) {
    nextBtn.textContent = 'Back to Levels';
    nextBtn.addEventListener('click', () => { removeOverlay(); playClick(); state.communityLevel = null; showCommunityBrowser(); });
  } else if (state.currentLevel < 19) {
    nextBtn.textContent = 'Next Level \u2192';
    nextBtn.addEventListener('click', () => { removeOverlay(); playClick(); startLevel(state.currentLevel + 1); });
  } else {
    nextBtn.textContent = 'Back to Levels';
    nextBtn.addEventListener('click', () => { removeOverlay(); playClick(); goToChooser(); });
  }
  btnRow.appendChild(nextBtn);

  overlay.appendChild(btnRow);
}

let previewAnim: { destroy: () => void } | null = null;

function updateInputPreview() {
  const wrapper = document.getElementById('input-preview');
  if (!wrapper) return;

  if (previewAnim) {
    previewAnim.destroy();
    previewAnim = null;
  }
  wrapper.innerHTML = '';
  wrapper.classList.remove('preview-valid', 'preview-invalid');

  if (state.inputChain.length === 0) return;

  let mood: Mood = 'sad';
  const isValid = state.currentRule && state.currentRule(state.inputChain);
  if (isValid) {
    mood = 'happy';
  }

  wrapper.classList.add(isValid ? 'preview-valid' : 'preview-invalid');

  // Track seen expressions for tutorial
  if (state.isTutorial && state.tutorialStep === 3) {
    if (isValid) state.tutorialSeenValid = true;
    else state.tutorialSeenInvalid = true;
    if (state.tutorialSeenValid && state.tutorialSeenInvalid) {
      state.tutorialStep = 4;
      renderTutorialHint();
    }
  }

  const anim = createAnimatedCaterpillar(state.inputChain, gameLayout.previewW, gameLayout.previewH, 'forward', mood);
  previewAnim = anim;
  wrapper.appendChild(anim.canvas);
}


function addColor(c: number) {
  if (state.inputChain.length >= 7) return;
  state.inputChain = [...state.inputChain, c];
  updateInputPreview();
  advanceTutorial('addColor');
}

function backspace() {
  state.inputChain = state.inputChain.slice(0, -1);
  updateInputPreview();
}

function submitChain() {
  if (state.inputChain.length === 0) return;
  const chain = [...state.inputChain];
  const key = seqKey(chain);
  const isValid = state.currentRule!(chain);

  // Don't add duplicates
  const history = isValid ? state.validHistory : state.invalidHistory;
  if (history.some(s => seqKey(s) === key)) {
    state.inputChain = [];
    updateInputPreview();
    return;
  }

  playPop();
  state.testedCount++;

  if (isValid) {
    playValid();
    addToHistory(state.validHistory, chain, 'valid-list', 'forward', 'happy');
  } else {
    playInvalid();
    addToHistory(state.invalidHistory, chain, 'invalid-list', 'forward', 'sad');
  }

  state.inputChain = [];
  updateInputPreview();
  advanceTutorial('submit');
}

function addToHistory(history: Sequence[], seq: Sequence, listId: string, eyeDir: EyeDirection, mood: Mood) {
  const key = seqKey(seq);
  const idx = history.findIndex(s => seqKey(s) === key);
  if (idx !== -1) history.splice(idx, 1);
  history.unshift(seq);

  // No cap — history grows without limit

  const listEl = document.getElementById(listId);
  if (!listEl) return;

  const item = renderCaterpillarItem(seq, eyeDir, mood);
  item.classList.add('slide-in');
  listEl.prepend(item);

  // Remove excess DOM children if history was deduplicated
  while (listEl.children.length > history.length) {
    listEl.removeChild(listEl.lastChild!);
  }

  listEl.scrollTop = 0;
}

// ——— Overlay helpers ———

function getOrCreateOverlay(): HTMLElement {
  let overlay = document.getElementById('overlay');
  if (!overlay) {
    overlay = el('div', 'overlay');
    overlay.id = 'overlay';
    document.getElementById('app')!.appendChild(overlay);
  }
  overlay.innerHTML = '';
  overlay.style.display = 'flex';
  return overlay;
}

function removeOverlay() {
  const overlay = document.getElementById('overlay');
  if (overlay) { overlay.style.display = 'none'; overlay.innerHTML = ''; }
}

// ——— Help ———

function showHelp() {
  clearScreen();
  const app = document.getElementById('app')!;
  state.screen = 'help';

  const container = el('div', 'help-screen');

  const backBtn = el('button', 'back-btn', '\u2190 Back');
  backBtn.addEventListener('click', () => { playClick(); state.screen = 'menu'; renderMenu(); });
  container.appendChild(backBtn);

  const title = el('h2', 'help-title', 'How to Play');
  container.appendChild(title);

  // Animated demo caterpillar
  const demo = el('div', 'help-demo');
  const anim = createAnimatedCaterpillar([0, 1, 2, 1, 0], 280, 56, 'forward', 'happy');
  demo.appendChild(anim.canvas);
  state.animatedInstances.push(anim);
  container.appendChild(demo);

  const text = el('div', 'help-text');
  text.innerHTML = `
    <p>Each level hides a secret <strong>rule</strong> about caterpillar color patterns. Your goal: figure out the rule and express it in Python!</p>
    <p>You start with examples: caterpillars on the <span class="hl-valid">left are valid</span> (match the rule) and on the <span class="hl-invalid">right are invalid</span> (don't match).</p>
    <p>Build your own caterpillars to test hypotheses. Watch the face:</p>
    <ul>
      <li><strong>Smiles</strong> = valid</li>
      <li><strong>Frowns</strong> = invalid</li>
    </ul>
    <p>Press <strong>+</strong> to save a caterpillar to your board for comparison.</p>
    <p>When you're confident, write a <strong>Python boolean expression</strong> that captures the rule. You have three variables:</p>
    <ul>
      <li><code>c</code> \u2014 color list, e.g. <code>[0, 1, 1, 2, 3]</code></li>
      <li><code>f</code> \u2014 color frequencies, e.g. <code>{0:1, 1:2, 2:1, 3:1}</code></li>
      <li><code>s</code> \u2014 run-length segments, e.g. <code>[(0,1),(1,2),(2,1),(3,1)]</code></li>
    </ul>
    <p>Your expression must return <code>True</code> for valid caterpillars and <code>False</code> for invalid ones.</p>
    <p>Earn up to <strong>3 stars</strong> based on how short your expression is \u2014 the shorter, the better!</p>
  `;
  container.appendChild(text);

  // Worked example
  const exampleSection = el('div', 'help-example');
  const exTitle = el('div', 'help-example-title', 'Example');
  exampleSection.appendChild(exTitle);

  const exText = el('div', 'help-example-text');
  exText.innerHTML = 'Suppose the rule is <em>"exactly 3 distinct colors"</em>. These caterpillars would be <span class="hl-valid">valid</span>:';
  exampleSection.appendChild(exText);

  const validRow = el('div', 'help-example-cats');
  validRow.appendChild(createCaterpillarCanvas([0, 1, 2], 110, 22, 'forward', 'happy'));
  validRow.appendChild(createCaterpillarCanvas([3, 0, 3, 1, 0], 110, 22, 'forward', 'happy'));
  exampleSection.appendChild(validRow);

  const exText2 = el('div', 'help-example-text');
  exText2.innerHTML = 'And these would be <span class="hl-invalid">invalid</span>:';
  exampleSection.appendChild(exText2);

  const invalidRow = el('div', 'help-example-cats');
  invalidRow.appendChild(createCaterpillarCanvas([0, 0, 1], 110, 22, 'forward', 'sad'));
  invalidRow.appendChild(createCaterpillarCanvas([0, 1, 2, 3], 110, 22, 'forward', 'sad'));
  exampleSection.appendChild(invalidRow);

  const exSolution = el('div', 'help-example-text');
  exSolution.innerHTML = 'The winning expression: <code>len(set(c))==3</code>';
  exampleSection.appendChild(exSolution);

  container.appendChild(exampleSection);

  const inspired = el('p', 'help-inspired');
  inspired.innerHTML = 'Inspired by <em>Zendo</em> and <em>Eleusis</em> \u2014 classic inductive reasoning games.';
  container.appendChild(inspired);

  const tryBtn = el('button', 'menu-btn menu-btn-primary help-try-btn', '\ud83c\udf93 Try the tutorial');
  tryBtn.addEventListener('click', () => { playClick(); startTutorial(); });
  container.appendChild(tryBtn);

  app.appendChild(container);
}

// ——— Community Browser ———

async function showCommunityBrowser(sort: api.LevelSort = 'newest') {
  clearScreen();
  state.screen = 'community';
  const app = document.getElementById('app')!;
  const container = el('div', 'community-screen');

  const topBar = el('div', 'top-bar');
  const backBtn = el('button', 'back-btn', '\u2190');
  backBtn.addEventListener('click', () => { playClick(); state.screen = 'menu'; renderMenu(); });
  topBar.appendChild(backBtn);
  const titleEl = el('span', 'level-label', 'Community Levels');
  topBar.appendChild(titleEl);

  if (isSignedIn()) {
    const createBtn = el('button', 'create-level-top-btn', '+ Create');
    createBtn.addEventListener('click', () => { playClick(); showCreateLevel(); });
    topBar.appendChild(createBtn);
  }
  container.appendChild(topBar);

  // Sort tabs
  const tabs = el('div', 'sort-tabs');
  const sorts: { key: api.LevelSort; label: string }[] = [
    { key: 'newest', label: 'Newest' },
    { key: 'top', label: 'Top Rated' },
    { key: 'popular', label: 'Most Played' },
  ];
  for (const s of sorts) {
    const tab = el('button', `sort-tab ${s.key === sort ? 'sort-tab-active' : ''}`, s.label);
    tab.addEventListener('click', () => { playClick(); showCommunityBrowser(s.key); });
    tabs.appendChild(tab);
  }
  container.appendChild(tabs);

  // Level list
  const listEl = el('div', 'level-list');
  const loading = el('div', 'loading-text', 'Loading...');
  listEl.appendChild(loading);
  container.appendChild(listEl);
  app.appendChild(container);

  try {
    const levels = await api.fetchLevels(sort);
    listEl.innerHTML = '';
    if (levels.length === 0) {
      listEl.appendChild(el('div', 'empty-text', 'No levels yet. Be the first to create one!'));
      return;
    }
    for (const level of levels) {
      const card = el('div', 'level-card');
      card.addEventListener('click', () => { playClick(); startCommunityLevel(level); });

      const titleRow = el('div', 'level-card-title', level.title);
      card.appendChild(titleRow);

      const metaRow = el('div', 'level-card-meta');
      const author = (level.author as any)?.username || 'unknown';
      metaRow.innerHTML = `by ${author} &middot; \u25b2${level.upvotes} &middot; \u25b6${level.play_count} plays &middot; ${level.solve_count} solved`;
      card.appendChild(metaRow);

      listEl.appendChild(card);
    }
  } catch {
    listEl.innerHTML = '';
    listEl.appendChild(el('div', 'empty-text', 'Failed to load levels'));
  }
}

// ——— Create Level ———

async function showCreateLevel() {
  if (!isSignedIn()) { renderMenu(); return; }
  clearScreen();
  state.screen = 'create-level';
  const app = document.getElementById('app')!;
  const container = el('div', 'create-level-screen');

  const topBar = el('div', 'top-bar');
  const backBtn = el('button', 'back-btn', '\u2190');
  backBtn.addEventListener('click', () => { playClick(); showCommunityBrowser(); });
  topBar.appendChild(backBtn);
  topBar.appendChild(el('span', 'level-label', 'Create Level'));
  container.appendChild(topBar);

  const form = el('div', 'create-form');

  // Expression (the rule)
  const exprLabel = el('div', 'create-label', 'Rule expression (c, f, s)');
  form.appendChild(exprLabel);
  const exprInput = el('textarea', 'code-input create-expr') as HTMLTextAreaElement;
  exprInput.rows = 1;
  exprInput.placeholder = 'e.g. f[0] + f[3] == 5';
  exprInput.maxLength = MAX_CODE_LENGTH;
  exprInput.spellcheck = false;
  exprInput.wrap = 'soft';
  exprInput.addEventListener('input', () => {
    exprInput.value = exprInput.value.replace(/\n/g, '');
    const autoResize = () => { exprInput.style.height = 'auto'; exprInput.style.height = exprInput.scrollHeight + 'px'; };
    autoResize();
  });
  form.appendChild(exprInput);

  // Preview area
  const previewArea = el('div', 'create-preview');
  previewArea.id = 'create-preview';
  form.appendChild(previewArea);

  // Error
  const errorEl = el('div', 'code-error');
  errorEl.id = 'create-error';
  form.appendChild(errorEl);

  // Buttons
  const btnRow = el('div', 'create-btn-row');
  const previewBtn = el('button', 'menu-btn', '\ud83d\udd0d Preview');
  previewBtn.addEventListener('click', async () => {
    const expr = exprInput.value.trim();
    const preview = document.getElementById('create-preview')!;
    const error = document.getElementById('create-error')!;
    error.style.display = 'none';
    preview.innerHTML = '<div class="loading-text">Evaluating...</div>';

    try {
      const evalResult = await evaluateExpression(expr, ALL_SEQS);
      if (evalResult.errorCount === ALL_SEQS.length) {
        error.textContent = evalResult.errorMessage || 'Expression errors on all caterpillars';
        error.style.display = 'flex';
        preview.innerHTML = '';
        return;
      }
      if (evalResult.errorCount > 0) {
        error.textContent = `Expression errors on ${evalResult.errorCount} caterpillars: ${evalResult.errorMessage}`;
        error.style.display = 'flex';
        preview.innerHTML = '';
        return;
      }
      const results = evalResult.results as boolean[];
      const validCount = results.filter(r => r).length;
      const ratio = validCount / ALL_SEQS.length;
      if (ratio < 0.05 || ratio > 0.95) {
        error.textContent = `Too ${ratio < 0.05 ? 'few' : 'many'} valid caterpillars (${validCount}/${ALL_SEQS.length}). Make the rule more balanced.`;
        error.style.display = 'flex';
        preview.innerHTML = '';
        return;
      }

      preview.innerHTML = `<div class="create-stats">${validCount} valid / ${ALL_SEQS.length - validCount} invalid</div>`;

      // Store results for submission
      (previewBtn as any)._results = results;
      (previewBtn as any)._validCount = validCount;
      publishBtn.style.display = 'block';
    } catch {
      error.textContent = 'Syntax error';
      error.style.display = 'flex';
      preview.innerHTML = '';
    }
  });
  btnRow.appendChild(previewBtn);

  const publishBtn = el('button', 'menu-btn menu-btn-primary', '\ud83d\ude80 Publish');
  publishBtn.style.display = 'none';
  publishBtn.addEventListener('click', async () => {
    const expr = exprInput.value.trim();
    const error = document.getElementById('create-error')!;

    const results = (previewBtn as any)._results as boolean[];
    const validCount = (previewBtn as any)._validCount as number;
    if (!results) {
      error.textContent = 'Preview the rule first';
      error.style.display = 'flex';
      return;
    }

    const signature = buildSignature(results);
    const canonicalSig = computeCanonicalSignature(results);

    // Check duplicate
    const dup = await api.checkDuplicate(canonicalSig);
    if (dup) {
      error.textContent = 'A level with this rule already exists';
      error.style.display = 'flex';
      return;
    }

    publishBtn.textContent = 'Publishing...';
    publishBtn.classList.add('submitting');

    try {
      // Auto-generate title from username
      const user = getUser();
      const username = user?.user_metadata?.user_name || user?.user_metadata?.name || 'anon';
      const levelNum = (await api.fetchMyLevelCount()) + 1;
      const title = `${username} #${levelNum}`;

      await api.createLevel({
        title,
        expression: expr,
        signature,
        canonical_signature: canonicalSig,
        valid_count: validCount,
        author_best_length: expr.length, // author's expression is also a solution
      });
      showCommunityBrowser();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to publish';
      error.textContent = msg;
      error.style.display = 'flex';
      publishBtn.textContent = '\ud83d\ude80 Publish';
      publishBtn.classList.remove('submitting');
    }
  });
  btnRow.appendChild(publishBtn);

  form.appendChild(btnRow);
  container.appendChild(form);
  app.appendChild(container);
}

// ——— Community Level Play ———

async function startCommunityLevel(level: CommunityLevel) {
  // Show loading screen immediately
  clearScreen();
  const app = document.getElementById('app')!;
  const loadingScreen = el('div', 'menu-screen');
  loadingScreen.appendChild(el('div', 'loading-text', 'Loading level...'));
  app.appendChild(loadingScreen);

  state.communityLevel = level;
  state.currentLevel = -1;
  state.inputChain = [];
  state.codeError = null;

  // Pre-fill with previous solution if available
  let prevExpr = '';
  if (isSignedIn()) {
    try {
      const prevSolution = await api.fetchMySolution(level.id);
      if (prevSolution) prevExpr = prevSolution.expression;
    } catch { /* ignore */ }
  }
  state.codeInput = prevExpr;
  state.codeSubmitting = false;
  state.testedCount = 0;

  // Evaluate the level's expression to get the rule
  const evalResult = await evaluateExpression(level.expression, ALL_SEQS);
  const resultMap = new Map<string, boolean>();
  ALL_SEQS.forEach((seq, i) => {
    resultMap.set(seq.join(','), evalResult.results[i] ?? false);
  });

  state.currentRule = (seq: number[]) => resultMap.get(seq.join(',')) ?? false;

  const { valid, invalid } = getValidInvalid(state.currentRule);
  state.valids = valid;
  state.invalids = invalid;
  state.validHistory = getN(7, valid);
  state.invalidHistory = getN(7, invalid);

  // Increment play count
  api.incrementPlayCount(level.id).catch(() => {});

  state.screen = 'level';
  renderLevel();
}

// ——— Profile ———

async function showProfile() {
  if (!isSignedIn()) { renderMenu(); return; }
  clearScreen();
  state.screen = 'profile';
  const app = document.getElementById('app')!;
  const container = el('div', 'profile-screen');

  const topBar = el('div', 'top-bar');
  const backBtn = el('button', 'back-btn', '\u2190');
  backBtn.addEventListener('click', () => { playClick(); state.screen = 'menu'; renderMenu(); });
  topBar.appendChild(backBtn);
  topBar.appendChild(el('span', 'level-label', 'Profile'));
  container.appendChild(topBar);

  const content = el('div', 'profile-content');
  content.appendChild(el('div', 'loading-text', 'Loading...'));
  container.appendChild(content);
  app.appendChild(container);

  try {
    const user = getUser()!;
    const profile = await api.fetchProfile(user.id);
    content.innerHTML = '';

    if (!profile) {
      content.appendChild(el('div', 'empty-text', 'Profile not found'));
      return;
    }

    const header = el('div', 'profile-header');
    if (profile.avatar_url) {
      const img = document.createElement('img');
      img.src = profile.avatar_url;
      img.className = 'profile-avatar';
      header.appendChild(img);
    }
    header.appendChild(el('div', 'profile-name', profile.username));
    content.appendChild(header);

    const stats = el('div', 'profile-stats');
    stats.innerHTML = `
      <div class="stat-item"><div class="stat-value">${profile.builtin_solved}</div><div class="stat-label">Built-in solved</div></div>
      <div class="stat-item"><div class="stat-value">${profile.builtin_stars} \u2605</div><div class="stat-label">Stars</div></div>
      <div class="stat-item"><div class="stat-value">${profile.community_solved}</div><div class="stat-label">Community solved</div></div>
      <div class="stat-item"><div class="stat-value">${profile.levels_created}</div><div class="stat-label">Levels created</div></div>
    `;
    content.appendChild(stats);
  } catch {
    content.innerHTML = '';
    content.appendChild(el('div', 'empty-text', 'Failed to load profile'));
  }
}

// ——— Leaderboard ———

async function showLeaderboard() {
  clearScreen();
  state.screen = 'leaderboard';
  const app = document.getElementById('app')!;
  const container = el('div', 'leaderboard-screen');

  const topBar = el('div', 'top-bar');
  const backBtn = el('button', 'back-btn', '\u2190');
  backBtn.addEventListener('click', () => { playClick(); state.screen = 'menu'; renderMenu(); });
  topBar.appendChild(backBtn);
  topBar.appendChild(el('span', 'level-label', 'Leaderboard'));
  container.appendChild(topBar);

  const content = el('div', 'leaderboard-content');
  content.appendChild(el('div', 'loading-text', 'Loading...'));
  container.appendChild(content);
  app.appendChild(container);

  try {
    const players = await api.fetchLeaderboard();
    content.innerHTML = '';

    if (players.length === 0) {
      content.appendChild(el('div', 'empty-text', 'No players yet'));
      return;
    }

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const row = el('div', 'lb-row');

      const rank = el('span', 'lb-rank', `#${i + 1}`);
      row.appendChild(rank);

      if (p.avatar_url) {
        const img = document.createElement('img');
        img.src = p.avatar_url;
        img.className = 'lb-avatar';
        row.appendChild(img);
      }

      const name = el('span', 'lb-name', p.username);
      row.appendChild(name);

      const stars = el('span', 'lb-stars', `${p.builtin_stars} \u2605`);
      row.appendChild(stars);

      const community = el('span', 'lb-community', `${p.community_solved} solved`);
      row.appendChild(community);

      content.appendChild(row);
    }
  } catch {
    content.innerHTML = '';
    content.appendChild(el('div', 'empty-text', 'Failed to load leaderboard'));
  }
}

function goToChooser() {
  state.screen = 'chooser';
  state.inputChain = [];
  state.codeInput = '';
  state.codeError = null;
  state.isTutorial = false;
  removeTutorialHint();
  renderChooser();
}

// ——— Init ———

function tryShowSharedProgress(): boolean {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get('user');
  if (!userId) return false;
  renderSharedProgress(userId);
  return true;
}

async function renderSharedProgress(userId: string) {
  clearScreen();
  const app = document.getElementById('app')!;
  const container = el('div', 'chooser-screen');

  const topBar = el('div', 'top-bar');
  const backBtn = el('button', 'back-btn', '\u2190');
  backBtn.addEventListener('click', () => {
    window.history.replaceState(null, '', window.location.pathname);
    state.screen = 'menu';
    renderMenu();
  });
  topBar.appendChild(backBtn);
  const label = el('span', 'level-label', 'Loading...');
  topBar.appendChild(label);
  container.appendChild(topBar);
  app.appendChild(container);

  // Fetch profile and completions
  const [profile, completions] = await Promise.all([
    api.fetchProfile(userId),
    api.fetchBuiltinCompletions(userId),
  ]);

  label.textContent = profile ? `${profile.username}'s progress` : 'Shared progress';

  // Build temporary progress map for rendering
  const savedProgress = state.progress;
  const sharedProgress = new Map<number, LevelProgress>();
  for (const c of completions) {
    sharedProgress.set(c.level_index, { passed: true, stars: c.stars, bestLength: c.best_length });
  }
  state.progress = sharedProgress;

  const L = calcChooserLayout();
  const pathWrap = el('div', 'path-wrap');
  const path = el('div', 'path-map');

  if (!L.portrait) {
    renderChooserLandscape(path, L);
  } else {
    renderChooserPortrait(path, L);
  }

  // Disable all clicks (read-only)
  path.querySelectorAll('.seg').forEach(seg => {
    (seg as HTMLElement).style.pointerEvents = 'none';
    (seg as HTMLElement).style.cursor = 'default';
  });

  pathWrap.appendChild(path);
  container.appendChild(pathWrap);

  // Stats
  const passed = sharedProgress.size;
  const totalStars = [...sharedProgress.values()].reduce((a, p) => a + p.stars, 0);
  const stats = el('div', 'shared-stats');
  stats.innerHTML = `${passed}/20 levels \u00b7 ${totalStars} \u2605`;
  container.appendChild(stats);

  // Restore own progress
  state.progress = savedProgress;
}

export async function init() {
  initSignatures();
  await initAuth();

  // Sync localStorage progress to server on sign-in
  if (isSignedIn() && state.progress.size > 0) {
    syncProgressToServer();
  }

  if (!tryShowSharedProgress()) {
    renderMenu();
  }

  // Re-render on orientation change
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      // Don't re-render while code input is focused (mobile keyboard)
      if (document.activeElement?.classList.contains('code-input')) return;
      if (state.screen === 'menu') renderMenu();
      else if (state.screen === 'chooser') renderChooser();
      else if (state.screen === 'level') renderLevel();
    }, 200);
  });
}
