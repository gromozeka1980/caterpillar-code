// Procedural sound effects using Web Audio API — no external files needed

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function ensureResumed() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

export function playClick() {
  ensureResumed();
  const c = ctx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(800, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, c.currentTime + 0.06);
  gain.gain.setValueAtTime(0.15, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.06);
}

export function playPop() {
  ensureResumed();
  const c = ctx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.12);
  gain.gain.setValueAtTime(0.2, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.12);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.12);
}

export function playValid() {
  ensureResumed();
  const c = ctx();
  const t = c.currentTime;
  [523, 659, 784].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t + i * 0.08);
    gain.gain.linearRampToValueAtTime(0.12, t + i * 0.08 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.2);
    osc.connect(gain).connect(c.destination);
    osc.start(t + i * 0.08);
    osc.stop(t + i * 0.08 + 0.2);
  });
}

export function playInvalid() {
  ensureResumed();
  const c = ctx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(200, c.currentTime);
  osc.frequency.linearRampToValueAtTime(120, c.currentTime + 0.25);
  gain.gain.setValueAtTime(0.08, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.25);
}

export function playSuccess() {
  ensureResumed();
  const c = ctx();
  const t = c.currentTime;
  [523, 659, 784, 1047].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t + i * 0.12);
    gain.gain.linearRampToValueAtTime(0.15, t + i * 0.12 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.4);
    osc.connect(gain).connect(c.destination);
    osc.start(t + i * 0.12);
    osc.stop(t + i * 0.12 + 0.4);
  });
}

export function playWrong() {
  ensureResumed();
  const c = ctx();
  const t = c.currentTime;
  [300, 250].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, t + i * 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.2);
    osc.connect(gain).connect(c.destination);
    osc.start(t + i * 0.15);
    osc.stop(t + i * 0.15 + 0.2);
  });
}

export function playBackspace() {
  ensureResumed();
  const c = ctx();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(250, c.currentTime + 0.08);
  gain.gain.setValueAtTime(0.1, c.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08);
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + 0.08);
}
