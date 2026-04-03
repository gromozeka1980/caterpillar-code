// Main game state and screen management

import { rules, type RuleFunc } from './rules';
import { getValidInvalid, getN, type Sequence } from './utils';
import { createCaterpillarCanvas, COLORS, type EyeDirection } from './caterpillar';

type Screen = 'chooser' | 'level' | 'help';

interface GameState {
  screen: Screen;
  currentLevel: number;
  currentRule: RuleFunc | null;
  progress: number[];
  valids: Sequence[];
  invalids: Sequence[];
  validHistory: Sequence[];
  invalidHistory: Sequence[];
  inputChain: number[];
  mode: 'game' | 'exam';
  examQuestions: { seq: Sequence; isValid: boolean }[];
  examIndex: number;
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
};

function loadProgress(): number[] {
  try {
    const s = localStorage.getItem('caterpillar-progress');
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

function saveProgress() {
  localStorage.setItem('caterpillar-progress', JSON.stringify(state.progress));
}

function seqKey(s: Sequence): string {
  return s.join(',');
}

// ——— Rendering Helpers ———

function clearScreen() {
  document.getElementById('app')!.innerHTML = '';
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function renderCaterpillarItem(chain: Sequence, eyeDir: EyeDirection = 'forward'): HTMLElement {
  const wrapper = el('div', 'caterpillar-item');
  const canvas = createCaterpillarCanvas(chain, 280, 44, eyeDir);
  wrapper.appendChild(canvas);
  return wrapper;
}

function toRGB(c: [number, number, number]): string {
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}

// ——— Screens ———

function renderChooser() {
  clearScreen();
  const app = document.getElementById('app')!;

  const container = el('div', 'chooser-screen');

  const title = el('h1', 'game-title', 'Caterpillar Logic');
  container.appendChild(title);

  const subtitle = el('p', 'game-subtitle', 'An inductive reasoning puzzle game');
  container.appendChild(subtitle);

  const grid = el('div', 'level-grid');
  for (let i = 0; i < 20; i++) {
    const btn = el('button', 'level-btn');
    btn.textContent = String(i + 1);
    if (state.progress.includes(i)) {
      btn.classList.add('completed');
    }
    btn.addEventListener('click', () => startLevel(i));
    grid.appendChild(btn);
  }
  container.appendChild(grid);

  const helpBtn = el('button', 'help-btn', 'What is it all about?');
  helpBtn.addEventListener('click', showHelp);
  container.appendChild(helpBtn);

  app.appendChild(container);
}

function startLevel(levelId: number) {
  state.currentLevel = levelId;
  state.currentRule = rules[levelId];
  state.mode = 'game';
  state.inputChain = [];

  const { valid, invalid } = getValidInvalid(state.currentRule);
  state.valids = valid;
  state.invalids = invalid;
  state.validHistory = getN(7, valid);
  state.invalidHistory = getN(7, invalid);

  state.screen = 'level';
  renderLevel();
}

function renderLevel() {
  clearScreen();
  const app = document.getElementById('app')!;

  const container = el('div', 'level-screen');

  // Top bar
  const topBar = el('div', 'top-bar');
  const backBtn = el('button', 'back-btn', '\u2190 Back');
  backBtn.addEventListener('click', goToChooser);
  topBar.appendChild(backBtn);
  const levelLabel = el('span', 'level-label', `Level ${state.currentLevel + 1}`);
  topBar.appendChild(levelLabel);
  container.appendChild(topBar);

  // History panels
  const historyArea = el('div', 'history-area');

  const validPanel = el('div', 'history-panel valid-panel');
  const validHeader = el('div', 'panel-header valid-header', 'Valid');
  validPanel.appendChild(validHeader);
  const validList = el('div', 'caterpillar-list');
  validList.id = 'valid-list';
  for (const seq of state.validHistory) {
    validList.appendChild(renderCaterpillarItem(seq));
  }
  validPanel.appendChild(validList);
  historyArea.appendChild(validPanel);

  const invalidPanel = el('div', 'history-panel invalid-panel');
  const invalidHeader = el('div', 'panel-header invalid-header', 'Invalid');
  invalidPanel.appendChild(invalidHeader);
  const invalidList = el('div', 'caterpillar-list');
  invalidList.id = 'invalid-list';
  for (const seq of state.invalidHistory) {
    invalidList.appendChild(renderCaterpillarItem(seq));
  }
  invalidPanel.appendChild(invalidList);
  historyArea.appendChild(invalidPanel);

  container.appendChild(historyArea);

  // Bottom section — input or exam
  const bottomSection = el('div', 'bottom-section');
  bottomSection.id = 'bottom-section';
  container.appendChild(bottomSection);

  app.appendChild(container);

  if (state.mode === 'game') {
    renderGameInput();
  } else {
    renderExam();
  }
}

function renderGameInput() {
  const bottom = document.getElementById('bottom-section')!;
  bottom.innerHTML = '';

  // Input label
  const label = el('div', 'input-label', 'Enter your sequence:');
  bottom.appendChild(label);

  // Preview caterpillar
  const previewWrapper = el('div', 'input-preview');
  previewWrapper.id = 'input-preview';
  updateInputPreview();
  bottom.appendChild(previewWrapper);

  // Color buttons row
  const btnRow = el('div', 'input-buttons');
  for (let c = 0; c < 4; c++) {
    const btn = el('button', 'color-btn');
    btn.style.backgroundColor = toRGB(COLORS[c]);
    btn.dataset.color = String(c);
    btn.addEventListener('click', () => addColor(c));
    btnRow.appendChild(btn);
  }

  const bksp = el('button', 'action-btn backspace-btn', '\u232b');
  bksp.addEventListener('click', backspace);
  btnRow.appendChild(bksp);

  const okBtn = el('button', 'action-btn ok-btn', 'OK');
  okBtn.addEventListener('click', submitChain);
  btnRow.appendChild(okBtn);

  bottom.appendChild(btnRow);

  // Exam button
  const examBtn = el('button', 'exam-start-btn', 'I know the rule and ready for test!');
  examBtn.addEventListener('click', startExam);
  bottom.appendChild(examBtn);
}

function updateInputPreview() {
  const wrapper = document.getElementById('input-preview');
  if (!wrapper) return;
  wrapper.innerHTML = '';

  let eyeDir: EyeDirection = 'right';
  if (state.inputChain.length > 0 && state.currentRule && state.currentRule(state.inputChain)) {
    eyeDir = 'left';
  }

  if (state.inputChain.length > 0) {
    const canvas = createCaterpillarCanvas(state.inputChain, 350, 54, eyeDir);
    wrapper.appendChild(canvas);
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
  const tuple = chain;

  if (state.currentRule!(chain)) {
    addToHistory(state.validHistory, tuple, 'valid-list');
  } else {
    addToHistory(state.invalidHistory, tuple, 'invalid-list');
  }

  state.inputChain = [];
  updateInputPreview();
}

function addToHistory(history: Sequence[], seq: Sequence, listId: string) {
  const key = seqKey(seq);
  const idx = history.findIndex(s => seqKey(s) === key);
  if (idx !== -1) history.splice(idx, 1);
  history.unshift(seq);

  // Re-render the list
  const listEl = document.getElementById(listId);
  if (!listEl) return;
  listEl.innerHTML = '';
  for (const s of history) {
    listEl.appendChild(renderCaterpillarItem(s));
  }
  listEl.scrollTop = 0;
}

// ——— Exam ———

function startExam() {
  state.mode = 'exam';
  const validNum = Math.floor(Math.random() * 6) + 5; // 5-10
  const invalidNum = 15 - validNum;

  const validQs: { seq: Sequence; isValid: boolean }[] =
    getN(validNum, state.valids, state.validHistory).map(s => ({ seq: s, isValid: true }));
  const invalidQs: { seq: Sequence; isValid: boolean }[] =
    getN(invalidNum, state.invalids, state.invalidHistory).map(s => ({ seq: s, isValid: false }));

  const all = [...validQs, ...invalidQs];
  // Shuffle
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
  if (!bottom) {
    // Full re-render needed
    renderLevel();
    return;
  }
  bottom.innerHTML = '';

  if (state.examIndex >= state.examQuestions.length) {
    // Passed!
    handleExamPass();
    return;
  }

  const q = state.examQuestions[state.examIndex];

  const label = el('div', 'exam-label', `Question ${state.examIndex + 1}/${state.examQuestions.length}`);
  bottom.appendChild(label);

  const preview = el('div', 'exam-caterpillar');
  const canvas = createCaterpillarCanvas(q.seq, 350, 54);
  preview.appendChild(canvas);
  bottom.appendChild(preview);

  const btnRow = el('div', 'exam-buttons');

  const validBtn = el('button', 'exam-btn valid-answer', 'Valid');
  validBtn.addEventListener('click', () => answerExam(true));
  btnRow.appendChild(validBtn);

  const invalidBtn = el('button', 'exam-btn invalid-answer', 'Invalid');
  invalidBtn.addEventListener('click', () => answerExam(false));
  btnRow.appendChild(invalidBtn);

  bottom.appendChild(btnRow);
}

function answerExam(answeredValid: boolean) {
  const q = state.examQuestions[state.examIndex];

  // Add to history (like original does)
  if (state.currentRule!(q.seq)) {
    addToHistory(state.validHistory, q.seq, 'valid-list');
  } else {
    addToHistory(state.invalidHistory, q.seq, 'invalid-list');
  }

  if (q.isValid === answeredValid) {
    state.examIndex++;
    renderExam();
  } else {
    handleExamFail();
  }
}

function handleExamPass() {
  if (!state.progress.includes(state.currentLevel)) {
    state.progress.push(state.currentLevel);
    saveProgress();
  }

  const bottom = document.getElementById('bottom-section')!;
  bottom.innerHTML = '';

  const msg = el('div', 'exam-result pass');
  msg.innerHTML = '<div class="result-icon">&#10004;</div><div class="result-text">Congratulations! You passed!</div>';
  bottom.appendChild(msg);

  const backBtn = el('button', 'back-to-levels', 'Back to Levels');
  backBtn.addEventListener('click', goToChooser);
  bottom.appendChild(backBtn);
}

function handleExamFail() {
  state.mode = 'game';

  const bottom = document.getElementById('bottom-section')!;
  bottom.innerHTML = '';

  const msg = el('div', 'exam-result fail');
  msg.innerHTML = '<div class="result-icon">&#10008;</div><div class="result-text">Wrong answer! Keep exploring.</div>';
  bottom.appendChild(msg);

  setTimeout(() => {
    renderGameInput();
  }, 1500);
}

// ——— Help ———

function showHelp() {
  clearScreen();
  const app = document.getElementById('app')!;
  state.screen = 'help';

  const container = el('div', 'help-screen');

  const backBtn = el('button', 'back-btn', '\u2190 Back');
  backBtn.addEventListener('click', goToChooser);
  container.appendChild(backBtn);

  const title = el('h2', '', 'How to Play');
  container.appendChild(title);

  const text = el('div', 'help-text');
  text.innerHTML = `
    <p>Most logic games are actually games of <strong>deductive reasoning</strong>. This one, however, is one of only a few games belonging to a relatively small selection that uses <strong>inductive reasoning</strong>.</p>
    <p>Inductive reasoning has its place in the scientific method. Scientists use it to form hypotheses and theories. Deductive reasoning allows them to apply the theories to specific situations.</p>
    <p>At each level of this game you are to guess the rule that describes a subset of sequences of multicolored segments (caterpillars).</p>
    <p>At the beginning of the game you get 14 caterpillars: 7 of them correspond to the rule, and 7 do not.</p>
    <p>Additionally, you can create a custom caterpillar and check whether it corresponds to the rule.</p>
    <p><strong>Hint:</strong> pay attention to the caterpillar's eyes! If it looks to the left \u2014 it's valid. If to the right \u2014 it's not.</p>
    <p>At the moment you feel that you've caught on to the pattern, you can take a test to check your guess.</p>
    <p>Inspired by <em>Zendo</em> and <em>Eleusis</em>.</p>
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
}
