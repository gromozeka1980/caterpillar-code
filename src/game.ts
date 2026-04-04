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

  const helpBtn = el('button', 'help-btn', 'How to play');
  helpBtn.addEventListener('click', () => { playClick(); showHelp(); });
  container.appendChild(helpBtn);

  app.appendChild(container);
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
  backBtn.addEventListener('click', () => { playClick(); goToChooser(); });
  topBar.appendChild(backBtn);
  const levelLabel = el('span', 'level-label', `Level ${state.currentLevel + 1}`);
  topBar.appendChild(levelLabel);

  // Tested counter
  const counter = el('span', 'tested-counter');
  counter.id = 'tested-counter';
  counter.textContent = `Tested: ${state.testedCount}`;
  topBar.appendChild(counter);

  container.appendChild(topBar);

  // History panels
  const historyArea = el('div', 'history-area');

  const validPanel = el('div', 'history-panel valid-panel');
  const validHeader = el('div', 'panel-header valid-header');
  validHeader.innerHTML = '<span class="header-icon">\u2714</span> Valid';
  validPanel.appendChild(validHeader);
  const validList = el('div', 'caterpillar-list');
  validList.id = 'valid-list';
  if (gameLayout.panelCols > 1) {
    validList.style.flexWrap = 'wrap';
    validList.style.flexDirection = 'column';
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
    invalidList.style.flexWrap = 'wrap';
    invalidList.style.flexDirection = 'column';
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

  if (state.mode === 'game') renderGameInput();
  else renderExam();
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

  const btnRow = el('div', 'input-buttons');
  for (let c = 0; c < 4; c++) {
    const btn = el('button', 'color-btn');
    btn.style.backgroundColor = toRGB(COLORS[c]);
    btn.addEventListener('click', () => { playClick(); addColor(c); });
    btnRow.appendChild(btn);
  }

  const bksp = el('button', 'action-btn backspace-btn', '\u232b');
  bksp.addEventListener('click', () => { playBackspace(); backspace(); });
  btnRow.appendChild(bksp);

  const okBtn = el('button', 'action-btn ok-btn', '+');
  okBtn.title = 'Add to samples';
  okBtn.addEventListener('click', () => submitChain());
  btnRow.appendChild(okBtn);

  bottom.appendChild(btnRow);

  const examBtn = el('button', 'exam-start-btn', '\u{1F9E0} I know the rule!');
  examBtn.addEventListener('click', () => { playClick(); startExam(); });
  bottom.appendChild(examBtn);
}

function updateInputPreview() {
  const wrapper = document.getElementById('input-preview');
  if (!wrapper) return;

  wrapper.innerHTML = '';

  let eyeDir: EyeDirection = 'right';
  let mood: Mood = 'sad';
  if (state.inputChain.length > 0 && state.currentRule && state.currentRule(state.inputChain)) {
    eyeDir = 'left';
    mood = 'happy';
  }

  if (state.inputChain.length > 0) {
    const anim = createAnimatedCaterpillar(state.inputChain, gameLayout.previewW, gameLayout.previewH, eyeDir, mood);
    wrapper.appendChild(anim.canvas);
    state.animatedInstances.push(anim);
  }
}

function addColor(c: number) {
  if (state.inputChain.length >= 7) return;
  state.inputChain = [...state.inputChain, c];
  updateInputPreview();
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
  state.mode = 'exam';
  state.examAttempts++;

  const validNum = Math.floor(Math.random() * 6) + 5;
  const invalidNum = 15 - validNum;

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

function renderExam() {
  const bottom = document.getElementById('bottom-section');
  if (!bottom) { renderLevel(); return; }
  bottom.innerHTML = '';

  if (state.examIndex >= state.examQuestions.length) {
    handleExamPass();
    return;
  }

  const q = state.examQuestions[state.examIndex];

  // Progress bar
  const progressWrap = el('div', 'exam-progress-wrap');
  const progressBar = el('div', 'exam-progress-bar');
  progressBar.style.width = `${(state.examIndex / state.examQuestions.length) * 100}%`;
  progressWrap.appendChild(progressBar);
  bottom.appendChild(progressWrap);

  const label = el('div', 'exam-label', `${state.examIndex} / ${state.examQuestions.length}`);
  bottom.appendChild(label);

  // Animated caterpillar for exam question
  const preview = el('div', 'exam-caterpillar');
  const anim = createAnimatedCaterpillar(q.seq, gameLayout.previewW, gameLayout.previewH);
  preview.appendChild(anim.canvas);
  state.animatedInstances.push(anim);
  bottom.appendChild(preview);

  const btnRow = el('div', 'exam-buttons');

  const validBtn = el('button', 'exam-btn valid-answer', '\u2714 Valid');
  validBtn.addEventListener('click', () => answerExam(true));
  btnRow.appendChild(validBtn);

  const invalidBtn = el('button', 'exam-btn invalid-answer', '\u2718 Invalid');
  invalidBtn.addEventListener('click', () => answerExam(false));
  btnRow.appendChild(invalidBtn);

  bottom.appendChild(btnRow);
}

function answerExam(answeredValid: boolean) {
  const q = state.examQuestions[state.examIndex];
  const isCorrect = q.isValid === answeredValid;

  if (isCorrect) {
    playValid();
    state.examIndex++;
    flashBottom('correct');
    setTimeout(() => renderExam(), 300);
  } else {
    // Only add mistakes to samples — this is the learning moment
    playWrong();
    flashBottom('wrong');
    if (state.currentRule!(q.seq)) {
      addToHistory(state.validHistory, q.seq, 'valid-list', 'left', 'happy');
    } else {
      addToHistory(state.invalidHistory, q.seq, 'invalid-list', 'right', 'sad');
    }
    setTimeout(() => handleExamFail(), 800);
  }
}

function flashBottom(type: 'correct' | 'wrong') {
  const bottom = document.getElementById('bottom-section');
  if (!bottom) return;
  bottom.classList.add(`flash-${type}`);
  setTimeout(() => bottom.classList.remove(`flash-${type}`), 400);
}

function handleExamPass() {
  // Stars: 3 = first attempt, 2 = second attempt, 1 = third+
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

  // Victory screen
  const bottom = document.getElementById('bottom-section')!;
  bottom.innerHTML = '';
  bottom.classList.add('victory');

  // Confetti
  const app = document.getElementById('app')!;
  launchConfetti(app, 3000);

  const starsEl = el('div', 'victory-stars');
  for (let s = 0; s < 3; s++) {
    const star = el('span', s < stars ? 'vstar filled' : 'vstar empty');
    star.textContent = '\u2605';
    star.style.animationDelay = `${s * 0.2}s`;
    starsEl.appendChild(star);
  }
  bottom.appendChild(starsEl);

  const msg = el('div', 'victory-text', 'Level Complete!');
  bottom.appendChild(msg);

  // Rule reveal
  const reveal = el('div', 'rule-reveal');
  const revealTitle = el('div', 'reveal-title', 'The rule was:');
  reveal.appendChild(revealTitle);
  const revealText = el('div', 'reveal-text', ruleDescriptions[state.currentLevel]);
  reveal.appendChild(revealText);
  bottom.appendChild(reveal);

  // Stats
  const stats = el('div', 'victory-stats');
  stats.innerHTML = `Caterpillars tested: <strong>${state.testedCount}</strong> &middot; Exam attempts: <strong>${state.examAttempts}</strong>`;
  bottom.appendChild(stats);

  const nextBtn = el('button', 'next-level-btn');
  if (state.currentLevel < 19) {
    nextBtn.textContent = 'Next Level \u2192';
    nextBtn.addEventListener('click', () => { playClick(); startLevel(state.currentLevel + 1); });
  } else {
    nextBtn.textContent = 'Back to Levels';
    nextBtn.addEventListener('click', () => { playClick(); goToChooser(); });
  }
  bottom.appendChild(nextBtn);
}

function handleExamFail() {
  state.mode = 'game';
  playWrong();

  const bottom = document.getElementById('bottom-section')!;
  bottom.innerHTML = '';

  const msg = el('div', 'exam-result fail');
  msg.innerHTML = '<div class="result-icon">\u{1F914}</div><div class="result-text">Not quite! Keep exploring.</div>';
  bottom.appendChild(msg);

  setTimeout(() => renderGameInput(), 1800);
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
