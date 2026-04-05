// Main game — redesigned with juice, path map, victory screen, sounds

import { rules, type RuleFunc } from './rules';
import { getValidInvalid, getN, type Sequence } from './utils';
import { createCaterpillarCanvas, createAnimatedCaterpillar, COLORS, type EyeDirection, type Mood } from './caterpillar';
import { ruleDescriptions } from './ruleDescriptions';
import { launchConfetti } from './confetti';
import { playClick, playPop, playValid, playInvalid, playSuccess, playWrong, playBackspace } from './sounds';
import { calcGameLayout, calcChooserLayout, type GameLayout } from './layout';

let gameLayout: GameLayout = calcGameLayout();

type Screen = 'chooser' | 'level' | 'help';

interface LevelProgress {
  passed: boolean;
  stars: number;       // 1-3
  attempts: number;    // exam attempts
  tested: number;      // caterpillars tested before passing
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
  mode: 'game' | 'exam';
  examQuestions: { seq: Sequence; isValid: boolean }[];
  examIndex: number;
  examAttempts: number;
  testedCount: number;
  animatedInstances: { destroy: () => void }[];
  isTutorial: boolean;
  tutorialStep: number;
  tutorialSeenValid: boolean;
  tutorialSeenInvalid: boolean;
}

const state: GameState = {
  screen: 'chooser',
  currentLevel: -1,
  currentRule: null,
  progress: loadProgress(),
  valids: [],
  invalids: [],
  validHistory: [],
  invalidHistory: [],
  inputChain: [],
  mode: 'game',
  examQuestions: [],
  examIndex: 0,
  examAttempts: 0,
  testedCount: 0,
  animatedInstances: [],
  isTutorial: false,
  tutorialStep: 0,
  tutorialSeenValid: false,
  tutorialSeenInvalid: false,
};

function loadProgress(): Map<number, LevelProgress> {
  try {
    const s = localStorage.getItem('caterpillar-progress-v2');
    if (s) {
      const arr: [number, LevelProgress][] = JSON.parse(s);
      return new Map(arr);
    }
    // Migrate from old format
    const old = localStorage.getItem('caterpillar-progress');
    if (old) {
      const ids: number[] = JSON.parse(old);
      const map = new Map<number, LevelProgress>();
      for (const id of ids) {
        map.set(id, { passed: true, stars: 1, attempts: 1, tested: 0 });
      }
      return map;
    }
  } catch { /* ignore */ }
  return new Map();
}

function saveProgress() {
  localStorage.setItem('caterpillar-progress-v2', JSON.stringify([...state.progress.entries()]));
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

function renderCaterpillarItem(chain: Sequence, eyeDir: EyeDirection = 'forward', mood: Mood = 'neutral'): HTMLElement {
  const wrapper = el('div', 'caterpillar-item');
  const canvas = createCaterpillarCanvas(chain, gameLayout.catW, gameLayout.catH, eyeDir, mood);
  wrapper.appendChild(canvas);
  return wrapper;
}


// ——— Caterpillar-Shaped Level Chooser ———

function segColorCSS(i: number): string {
  const c = COLORS[i % 4];
  return toRGB(c);
}

function segColorDimCSS(i: number): string {
  // Opaque dim: mix segment color at 25% with background (#0f0e17)
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
  // Horizontal connector: from center to center, thick like body
  const connW = gap + L.segW;
  const connH = L.segH; // full body height
  const connMargin = -Math.round(L.segW * 0.5);
  // Vertical bend: from center of upper seg to center of lower seg
  // bendH covers the gap between rows + half seg on each side
  // margin pulls it back into the segments by half segH
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
  // Vertical connectors: full body width, center-to-center height
  const vConnW = L.segW; // full body width
  const vConnH = gap + L.segH;
  const vConnMargin = -Math.round(L.segH * 0.5);
  // Horizontal bend: from center of left seg to center of right seg
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

function renderChooser() {
  clearScreen();
  const app = document.getElementById('app')!;
  const container = el('div', 'chooser-screen');

  const title = el('h1', 'game-title', 'Caterpillar Logic');
  container.appendChild(title);
  const subtitle = el('p', 'game-subtitle', 'An inductive reasoning puzzle game');
  container.appendChild(subtitle);

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

  const btnRow = el('div', 'chooser-buttons');
  const tutorialBtn = el('button', 'help-btn tutorial-btn', 'Tutorial');
  tutorialBtn.addEventListener('click', () => { playClick(); startTutorial(); });
  btnRow.appendChild(tutorialBtn);
  const helpBtn = el('button', 'help-btn', 'How to play');
  helpBtn.addEventListener('click', () => { playClick(); showHelp(); });
  btnRow.appendChild(helpBtn);
  container.appendChild(btnRow);

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
  // 3: Watch the face — hasNext becomes true dynamically once both expressions seen
  { text: 'Watch the caterpillar\u2019s face \u2014 it smiles if it matches the rule, frowns if it doesn\u2019t. Try both!' },
  // 4: Explain the + button
  { text: 'Press + to save a caterpillar to your board. This helps you compare and spot the pattern.', hasNext: true },
  // 5: Free exploration + exam hint
  { text: '', hasNext: true }, // dynamic text
  // 6: Exam in progress — no hint
  { text: '' },
];

function startTutorial() {
  state.isTutorial = true;
  state.tutorialStep = 0;
  state.tutorialSeenValid = false;
  state.tutorialSeenInvalid = false;
  state.currentLevel = -1;
  state.currentRule = TUTORIAL_RULE;
  state.mode = 'game';
  state.inputChain = [];
  state.examAttempts = 0;
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
  let showNext = def.hasNext ?? false;

  // Step 3: show Continue only after both expressions seen
  if (step === 3) {
    showNext = state.tutorialSeenValid && state.tutorialSeenInvalid;
  }
  // Step 5: dynamic text
  if (step === 5) {
    text = state.testedCount < 2
      ? 'Try saving a few more caterpillars to spot the pattern.'
      : 'Keep exploring, or take the exam when you\u2019re ready.';
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

  // Insert at top of bottom-section (inline, no fixed positioning)
  const bottom = document.getElementById('bottom-section');
  if (bottom) {
    bottom.prepend(hint);
  }
}

function advanceTutorial(action: 'addColor' | 'submit' | 'startExam') {
  if (!state.isTutorial) return;
  const step = state.tutorialStep;

  if (step === 1 && action === 'addColor') {
    state.tutorialStep = 2;
    renderTutorialHint();
  } else if (step === 2 && action === 'addColor' && state.inputChain.length >= 3) {
    state.tutorialStep = 3;
    renderTutorialHint();
  } else if (step === 5 && action === 'submit') {
    // Update dynamic text after additional saves
    renderTutorialHint();
  } else if ((step === 5 || step === 4) && action === 'startExam') {
    state.tutorialStep = 6;
    removeTutorialHint();
  }
}

function handleTutorialExamFail() {
  state.mode = 'game';
  playWrong();

  const overlay = getOrCreateOverlay();
  const msg = el('div', 'exam-result fail');
  msg.innerHTML = '<div class="result-icon">\u{1F914}</div><div class="result-text">Not quite \u2014 keep exploring!</div>';
  overlay.appendChild(msg);

  setTimeout(() => {
    removeOverlay();
    renderGameInput();
    state.tutorialStep = 5;
    renderTutorialHint();
  }, 1800);
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
  state.mode = 'game';
  state.inputChain = [];
  state.examAttempts = 0;
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
  clearScreen();
  const app = document.getElementById('app')!;
  const container = el('div', 'level-screen');

  // Top bar
  const topBar = el('div', 'top-bar');
  const backBtn = el('button', 'back-btn', '\u2190');
  backBtn.addEventListener('click', () => { playClick(); if (state.isTutorial) state.isTutorial = false; goToChooser(); });
  topBar.appendChild(backBtn);
  const levelLabel = el('span', 'level-label', state.isTutorial ? 'Tutorial' : `Level ${state.currentLevel + 1}`);
  topBar.appendChild(levelLabel);

  if (!state.isTutorial) {
    // Tested counter
    const counter = el('span', 'tested-counter');
    counter.id = 'tested-counter';
    counter.textContent = `Tested: ${state.testedCount}`;
    topBar.appendChild(counter);
  }

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
    validList.appendChild(renderCaterpillarItem(seq, 'left', 'happy'));
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
    invalidList.appendChild(renderCaterpillarItem(seq, 'right', 'sad'));
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
  if (state.mode === 'exam') renderExam();
}

// ——— Game Input ———

function renderGameInput() {
  const bottom = document.getElementById('bottom-section')!;
  bottom.innerHTML = '';

  const label = el('div', 'input-label', 'Test your hypothesis:');
  bottom.appendChild(label);

  const previewWrapper = el('div', 'input-preview');
  previewWrapper.id = 'input-preview';
  bottom.appendChild(previewWrapper);
  updateInputPreview();

  const controls = el('div', 'input-controls');

  // Color buttons group
  const colorGroup = el('div', 'btn-group color-group');
  for (let c = 0; c < 4; c++) {
    const btn = el('button', 'color-btn');
    btn.style.backgroundColor = toRGB(COLORS[c]);
    btn.addEventListener('click', () => { playClick(); addColor(c); });
    colorGroup.appendChild(btn);
  }
  controls.appendChild(colorGroup);

  // Action buttons group (backspace + add)
  const actionGroup = el('div', 'btn-group action-group');
  const bksp = el('button', 'action-btn backspace-btn', '\u232b');
  bksp.addEventListener('click', () => { playBackspace(); backspace(); });
  actionGroup.appendChild(bksp);
  const okBtn = el('button', 'action-btn ok-btn', '+');
  okBtn.title = 'Add to samples';
  okBtn.addEventListener('click', () => submitChain());
  actionGroup.appendChild(okBtn);
  controls.appendChild(actionGroup);

  // Exam button
  const examBtn = el('button', 'exam-start-btn', '\u{1F9E0} Take the exam');
  examBtn.addEventListener('click', () => { playClick(); startExam(); });
  controls.appendChild(examBtn);

  bottom.appendChild(controls);
}

let previewAnim: { destroy: () => void } | null = null;

function updateInputPreview() {
  const wrapper = document.getElementById('input-preview');
  if (!wrapper) return;

  // Destroy previous animation before creating new one
  if (previewAnim) {
    previewAnim.destroy();
    previewAnim = null;
  }
  wrapper.innerHTML = '';
  wrapper.classList.remove('preview-valid', 'preview-invalid');

  if (state.inputChain.length === 0) return;

  let eyeDir: EyeDirection = 'right';
  let mood: Mood = 'sad';
  const isValid = state.currentRule && state.currentRule(state.inputChain);
  if (isValid) {
    eyeDir = 'left';
    mood = 'happy';
  }

  wrapper.classList.add(isValid ? 'preview-valid' : 'preview-invalid');

  // Track seen expressions for tutorial
  if (state.isTutorial && state.tutorialStep === 3) {
    if (isValid) state.tutorialSeenValid = true;
    else state.tutorialSeenInvalid = true;
    // Show "Continue" once both expressions seen
    if (state.tutorialSeenValid && state.tutorialSeenInvalid) {
      renderTutorialHint();
    }
  }

  // Use static canvas for instant response, no animation overhead
  const canvas = createCaterpillarCanvas(state.inputChain, gameLayout.previewW, gameLayout.previewH, eyeDir, mood);
  wrapper.appendChild(canvas);
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
  const counterEl = document.getElementById('tested-counter');
  if (counterEl) counterEl.textContent = `Tested: ${state.testedCount}`;

  if (isValid) {
    playValid();
    addToHistory(state.validHistory, chain, 'valid-list', 'left', 'happy');
  } else {
    playInvalid();
    addToHistory(state.invalidHistory, chain, 'invalid-list', 'right', 'sad');
  }

  state.inputChain = [];
  updateInputPreview();
  advanceTutorial('submit');
}

const MAX_HISTORY = 10;

function addToHistory(history: Sequence[], seq: Sequence, listId: string, eyeDir: EyeDirection, mood: Mood) {
  const key = seqKey(seq);
  const idx = history.findIndex(s => seqKey(s) === key);
  if (idx !== -1) history.splice(idx, 1);
  history.unshift(seq);

  // Cap at MAX_HISTORY — oldest drops off
  while (history.length > MAX_HISTORY) history.pop();

  const listEl = document.getElementById(listId);
  if (!listEl) return;

  // Animate new item in
  const item = renderCaterpillarItem(seq, eyeDir, mood);
  item.classList.add('slide-in');
  listEl.prepend(item);

  // Remove excess DOM children
  while (listEl.children.length > history.length) {
    listEl.removeChild(listEl.lastChild!);
  }

  listEl.scrollTop = 0;
}

// ——— Exam: 15 perfect answers required ———

function startExam() {
  advanceTutorial('startExam');
  state.mode = 'exam';
  state.examAttempts++;

  const total = state.isTutorial ? 5 : 15;
  const validNum = state.isTutorial
    ? Math.floor(Math.random() * 2) + 2  // 2-3 valid out of 5
    : Math.floor(Math.random() * 6) + 5;
  const invalidNum = total - validNum;

  const validQs = getN(validNum, state.valids, state.validHistory).map(s => ({ seq: s, isValid: true }));
  const invalidQs = getN(invalidNum, state.invalids, state.invalidHistory).map(s => ({ seq: s, isValid: false }));
  const all = [...validQs, ...invalidQs];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }

  state.examQuestions = all;
  state.examIndex = 0;
  renderExam();
}

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

function renderExam() {
  const overlay = getOrCreateOverlay();

  if (state.examIndex >= state.examQuestions.length) {
    if (state.isTutorial) { handleTutorialPass(); return; }
    handleExamPass();
    return;
  }

  const q = state.examQuestions[state.examIndex];

  const progressWrap = el('div', 'exam-progress-wrap');
  const progressBar = el('div', 'exam-progress-bar');
  progressBar.style.width = `${(state.examIndex / state.examQuestions.length) * 100}%`;
  progressWrap.appendChild(progressBar);
  overlay.appendChild(progressWrap);

  const label = el('div', 'exam-label', `${state.examIndex} / ${state.examQuestions.length}`);
  overlay.appendChild(label);

  const preview = el('div', 'exam-caterpillar');
  const anim = createAnimatedCaterpillar(q.seq, gameLayout.previewW, gameLayout.previewH);
  preview.appendChild(anim.canvas);
  state.animatedInstances.push(anim);
  overlay.appendChild(preview);

  const btnRow = el('div', 'exam-buttons');

  const validBtn = el('button', 'exam-btn valid-answer', '\u2714 Valid');
  validBtn.addEventListener('click', () => answerExam(true));
  btnRow.appendChild(validBtn);

  const invalidBtn = el('button', 'exam-btn invalid-answer', '\u2718 Invalid');
  invalidBtn.addEventListener('click', () => answerExam(false));
  btnRow.appendChild(invalidBtn);

  overlay.appendChild(btnRow);
}

function answerExam(answeredValid: boolean) {
  const q = state.examQuestions[state.examIndex];
  const isCorrect = q.isValid === answeredValid;

  if (isCorrect) {
    playValid();
    state.examIndex++;
    flashOverlay('correct');
    setTimeout(() => renderExam(), 300);
  } else {
    // Only add mistakes to samples — this is the learning moment
    playWrong();
    flashOverlay('wrong');
    if (state.currentRule!(q.seq)) {
      addToHistory(state.validHistory, q.seq, 'valid-list', 'left', 'happy');
    } else {
      addToHistory(state.invalidHistory, q.seq, 'invalid-list', 'right', 'sad');
    }
    setTimeout(() => state.isTutorial ? handleTutorialExamFail() : handleExamFail(), 800);
  }
}

function flashOverlay(type: 'correct' | 'wrong') {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;
  overlay.classList.add(`flash-${type}`);
  setTimeout(() => overlay.classList.remove(`flash-${type}`), 400);
}

function handleExamPass() {
  let stars = 1;
  if (state.examAttempts <= 1) stars = 3;
  else if (state.examAttempts <= 2) stars = 2;

  const existing = state.progress.get(state.currentLevel);
  const bestStars = Math.max(existing?.stars ?? 0, stars);

  state.progress.set(state.currentLevel, {
    passed: true,
    stars: bestStars,
    attempts: state.examAttempts,
    tested: state.testedCount,
  });
  saveProgress();

  playSuccess();

  const overlay = getOrCreateOverlay();

  const app = document.getElementById('app')!;
  launchConfetti(app, 3000);

  const starsEl = el('div', 'victory-stars');
  for (let s = 0; s < 3; s++) {
    const star = el('span', s < stars ? 'vstar filled' : 'vstar empty');
    star.textContent = '\u2605';
    star.style.animationDelay = `${s * 0.2}s`;
    starsEl.appendChild(star);
  }
  overlay.appendChild(starsEl);

  const msg = el('div', 'victory-text', 'Level Complete!');
  overlay.appendChild(msg);

  const reveal = el('div', 'rule-reveal');
  const revealTitle = el('div', 'reveal-title', 'The rule was:');
  reveal.appendChild(revealTitle);
  const revealText = el('div', 'reveal-text', ruleDescriptions[state.currentLevel]);
  reveal.appendChild(revealText);
  overlay.appendChild(reveal);

  const stats = el('div', 'victory-stats');
  stats.innerHTML = `Caterpillars tested: <strong>${state.testedCount}</strong> &middot; Exam attempts: <strong>${state.examAttempts}</strong>`;
  overlay.appendChild(stats);

  const nextBtn = el('button', 'next-level-btn');
  if (state.currentLevel < 19) {
    nextBtn.textContent = 'Next Level \u2192';
    nextBtn.addEventListener('click', () => { removeOverlay(); playClick(); startLevel(state.currentLevel + 1); });
  } else {
    nextBtn.textContent = 'Back to Levels';
    nextBtn.addEventListener('click', () => { removeOverlay(); playClick(); goToChooser(); });
  }
  overlay.appendChild(nextBtn);
}

function handleExamFail() {
  state.mode = 'game';
  playWrong();

  const overlay = getOrCreateOverlay();

  const msg = el('div', 'exam-result fail');
  msg.innerHTML = '<div class="result-icon">\u{1F914}</div><div class="result-text">Not quite! Keep exploring.</div>';
  overlay.appendChild(msg);

  setTimeout(() => { removeOverlay(); renderGameInput(); }, 1800);
}

// ——— Help ———

function showHelp() {
  clearScreen();
  const app = document.getElementById('app')!;
  state.screen = 'help';

  const container = el('div', 'help-screen');

  const backBtn = el('button', 'back-btn', '\u2190 Back');
  backBtn.addEventListener('click', () => { playClick(); goToChooser(); });
  container.appendChild(backBtn);

  const title = el('h2', 'help-title', 'How to Play');
  container.appendChild(title);

  // Animated demo caterpillar
  const demo = el('div', 'help-demo');
  const anim = createAnimatedCaterpillar([0, 1, 2, 1, 0], 280, 56, 'left', 'happy');
  demo.appendChild(anim.canvas);
  state.animatedInstances.push(anim);
  container.appendChild(demo);

  const text = el('div', 'help-text');
  text.innerHTML = `
    <p>Each level hides a secret <strong>rule</strong> about caterpillar color patterns. Your goal: figure out the rule!</p>
    <p>You start with examples: caterpillars on the <span class="hl-valid">left are valid</span> (match the rule) and on the <span class="hl-invalid">right are invalid</span> (don't match).</p>
    <p>Build your own caterpillars to test hypotheses. Watch the eyes:</p>
    <ul>
      <li><strong>Looks left + smiles</strong> = valid</li>
      <li><strong>Looks right + frowns</strong> = invalid</li>
    </ul>
    <p>When you're confident, take the <strong>exam</strong> — classify 15 caterpillars correctly in a row. One mistake and you're back to exploring.</p>
    <p>After passing, the rule is <strong>revealed</strong>. Earn up to 3 stars based on how many attempts it takes!</p>
    <p class="help-inspired">Inspired by <em>Zendo</em> and <em>Eleusis</em> — classic inductive reasoning games.</p>
  `;
  container.appendChild(text);

  app.appendChild(container);
}

function goToChooser() {
  state.screen = 'chooser';
  state.mode = 'game';
  state.inputChain = [];
  state.isTutorial = false;
  removeTutorialHint();
  renderChooser();
}

// ——— Init ———

export function init() {
  renderChooser();

  // Re-render on orientation change
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (state.screen === 'chooser') renderChooser();
      else if (state.screen === 'level') renderLevel();
    }, 200);
  });
}
