// Caterpillar canvas renderer with character: antennae, legs, expressions, blinking

export type EyeDirection = 'forward' | 'left' | 'right';
export type Mood = 'neutral' | 'happy' | 'sad';

export const COLORS: Record<number, [number, number, number]> = {
  0: [0.9921, 0.3882, 0.4118],  // Pink/Red
  1: [0.6627, 0.8942, 0.21569], // Green
  2: [0.20784, 0.27056, 0.3921], // Dark Blue
  3: [0.7098, 0.8, 0.6941],     // Light Green/Sage
};

function toCSS(rgb: [number, number, number], alpha = 1): string {
  return `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, ${alpha})`;
}

function darken(rgb: [number, number, number], amount = 0.3): [number, number, number] {
  return [rgb[0] * (1 - amount), rgb[1] * (1 - amount), rgb[2] * (1 - amount)];
}

function lighten(rgb: [number, number, number], amount = 0.3): [number, number, number] {
  return [
    rgb[0] + (1 - rgb[0]) * amount,
    rgb[1] + (1 - rgb[1]) * amount,
    rgb[2] + (1 - rgb[2]) * amount,
  ];
}

function drawEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  eyeDirection: EyeDirection,
  ex: number, ey: number, ew: number, eh: number,
  blinkPhase = 0 // 0 = open, 1 = closed
) {
  const squish = 1 - blinkPhase * 0.9;

  // White of the eye
  ctx.fillStyle = '#fff';
  const adjustedEh = eh * squish;
  const adjustedEy = ey + (eh - adjustedEh) / 2;
  drawEllipse(ctx, ex, adjustedEy, ew, adjustedEh);

  if (blinkPhase < 0.7) {
    // Pupil
    let px = ex;
    const py = adjustedEy + adjustedEh * 0.25;
    if (eyeDirection === 'forward') px = ex + ew * 0.25;
    else if (eyeDirection === 'left') px = ex;
    else if (eyeDirection === 'right') px = ex + ew * 0.5;

    ctx.fillStyle = '#1a1a2e';
    drawEllipse(ctx, px, py, ew * 0.5, adjustedEh * 0.5);

    // Tiny highlight
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    drawEllipse(ctx, px + ew * 0.08, py + adjustedEh * 0.05, ew * 0.15, adjustedEh * 0.15);
  }
}

function drawSegment(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: [number, number, number],
  first: boolean, last: boolean,
  breatheScale = 1
) {
  const bh = h * breatheScale;
  const by = y + (h - bh) / 2;

  // Shadow
  ctx.fillStyle = toCSS(darken(color, 0.4), 0.3);
  drawEllipse(ctx, x, by + bh * 0.1, w, bh);

  ctx.fillStyle = toCSS(color);
  drawEllipse(ctx, x, by, w, bh);

  // Connectors
  if (!first) ctx.fillRect(x, by, w / 2, bh);
  if (!last) {
    ctx.fillRect(x + w / 2, by, w / 2, bh);
    ctx.strokeStyle = toCSS(darken(color, 0.2), 0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w, by);
    ctx.lineTo(x + w, by + bh);
    ctx.stroke();
  }

  // Highlight (specular)
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  drawEllipse(ctx, x + w * 0.15, by + bh * 0.1, w * 0.7, bh * 0.3);
}

function drawLegs(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: [number, number, number],
  time: number, index: number
) {
  // Adaptive color: lighten on dark segments, darken on light
  const lum = luminance(color);
  const legColor = lum < 0.35 ? toCSS(lighten(color, 0.4), 0.7) : toCSS(darken(color, 0.35));
  const legBaseY = y + h * 0.88;
  const legLen = h * 0.16;
  const legW = w * 0.055;

  ctx.strokeStyle = legColor;
  ctx.lineWidth = legW;
  ctx.lineCap = 'round';

  // Walking wave: each leg pair lifts and plants in sequence
  // Phase travels from head to tail like a real caterpillar
  const legPositions = [x + w * 0.28, x + w * 0.62];
  legPositions.forEach((lx, legIdx) => {
    const phase = time * 6 - index * 0.8 - legIdx * 0.4;
    // Lift amount: legs briefly lift up then plant back down
    const lift = Math.max(0, Math.sin(phase)) * legLen * 0.4;
    const footY = legBaseY + legLen - lift;

    ctx.beginPath();
    ctx.moveTo(lx, legBaseY);
    ctx.lineTo(lx, footY);
    ctx.stroke();

    // Tiny foot dot
    ctx.fillStyle = legColor;
    ctx.beginPath();
    ctx.arc(lx, footY, legW * 0.7, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawAntennae(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: [number, number, number],
  time: number
) {
  const baseX1 = x + w * 0.2;
  const baseX2 = x + w * 0.55;
  const baseY = y + h * 0.1;
  const tipWobble1 = Math.sin(time * 2) * w * 0.08;
  const tipWobble2 = Math.sin(time * 2.3 + 1) * w * 0.08;

  const lum = luminance(color);
  const antennaColor = lum < 0.35 ? toCSS(lighten(color, 0.5), 0.8) : toCSS(darken(color, 0.2));
  ctx.strokeStyle = antennaColor;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';

  // Left antenna
  ctx.beginPath();
  ctx.moveTo(baseX1, baseY);
  ctx.quadraticCurveTo(baseX1 - w * 0.1 + tipWobble1, baseY - h * 0.3, baseX1 - w * 0.05 + tipWobble1, baseY - h * 0.4);
  ctx.stroke();

  // Right antenna
  ctx.beginPath();
  ctx.moveTo(baseX2, baseY);
  ctx.quadraticCurveTo(baseX2 + w * 0.1 + tipWobble2, baseY - h * 0.3, baseX2 + w * 0.05 + tipWobble2, baseY - h * 0.4);
  ctx.stroke();

  // Antenna tips (small circles)
  ctx.fillStyle = lum < 0.35 ? toCSS(lighten(color, 0.4)) : toCSS(color);
  ctx.beginPath();
  ctx.arc(baseX1 - w * 0.05 + tipWobble1, baseY - h * 0.4, w * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(baseX2 + w * 0.05 + tipWobble2, baseY - h * 0.4, w * 0.04, 0, Math.PI * 2);
  ctx.fill();
}

function luminance(rgb: [number, number, number]): number {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

function drawMouth(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  mood: Mood,
  color: [number, number, number]
) {
  const mx = x + w * 0.2;
  const my = y + h * 0.72;
  const mw = w * 0.3;

  // Use light stroke on dark segments, dark stroke on light segments
  const lum = luminance(color);
  ctx.strokeStyle = lum < 0.4 ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();

  if (mood === 'happy') {
    ctx.arc(mx + mw / 2, my - mw * 0.15, mw / 2, 0.1 * Math.PI, 0.9 * Math.PI);
  } else if (mood === 'sad') {
    ctx.arc(mx + mw / 2, my + mw * 0.3, mw / 2, 1.1 * Math.PI, 1.9 * Math.PI);
  } else {
    ctx.moveTo(mx, my);
    ctx.lineTo(mx + mw, my);
  }
  ctx.stroke();
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  eyeDirection: EyeDirection,
  x: number, y: number, w: number, h: number,
  color: [number, number, number],
  last: boolean,
  opts: { blinkPhase?: number; breatheScale?: number; mood?: Mood; time?: number }
) {
  const bs = opts.breatheScale ?? 1;
  drawSegment(ctx, x, y, w, h, color, true, last, bs);

  const bh = h * bs;
  const by = y + (h - bh) / 2;

  // Eyes
  drawEye(ctx, eyeDirection, x + w * 0.05, by + bh * 0.32, w * 0.22, bh * 0.22, opts.blinkPhase ?? 0);
  drawEye(ctx, eyeDirection, x + w * 0.42, by + bh * 0.32, w * 0.22, bh * 0.22, opts.blinkPhase ?? 0);

  // Mouth
  drawMouth(ctx, x, by, w, bh, opts.mood ?? 'neutral', color);

  // Antennae
  if (opts.time !== undefined) {
    drawAntennae(ctx, x, by, w, bh, color, opts.time);
  } else {
    drawAntennae(ctx, x, by, w, bh, color, 0);
  }
}

export interface DrawOptions {
  blinkPhase?: number;   // 0-1
  breatheScale?: number; // ~0.98-1.02
  mood?: Mood;
  time?: number;         // for animation
  animated?: boolean;
}

export function drawCaterpillar(
  ctx: CanvasRenderingContext2D,
  chain: number[],
  x: number, y: number,
  maxW: number, maxH: number,
  eyeDirection: EyeDirection = 'forward',
  opts: DrawOptions = {}
) {
  if (chain.length === 0) return;

  const NUM_SLOTS = 7;
  let w = maxW;
  let h = maxH;

  if (w < h * NUM_SLOTS) h = w / NUM_SLOTS;
  else w = h * NUM_SLOTS;

  const segW = w / NUM_SLOTS;
  const segH = h;
  const time = opts.time ?? 0;
  const breathe = opts.breatheScale ?? 1;

  for (let i = 0; i < chain.length; i++) {
    const sx = x + segW * i;
    const last = i === chain.length - 1;
    const color = COLORS[chain[i]];
    // Each segment breathes slightly offset
    const segBreathe = breathe + Math.sin(time * 3 + i * 0.5) * 0.01;

    // Legs under every segment (animated wobble or static)
    drawLegs(ctx, sx, y, segW, segH, color, time, i);

    if (i === 0) {
      drawHead(ctx, eyeDirection, sx, y, segW, segH, color, last, {
        blinkPhase: opts.blinkPhase,
        breatheScale: segBreathe,
        mood: opts.mood,
        time: opts.animated ? time : undefined,
      });
    } else {
      drawSegment(ctx, sx, y, segW, segH, color, false, last, segBreathe);
    }
  }
}

/** Create a static canvas element with a caterpillar — scales proportionally */
export function createCaterpillarCanvas(
  chain: number[],
  width: number,
  height: number,
  eyeDirection: EyeDirection = 'forward',
  mood: Mood = 'neutral'
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  // Only set max-width, let aspect-ratio handle height
  canvas.style.maxWidth = `${width}px`;
  canvas.style.width = '100%';
  canvas.style.aspectRatio = `${width} / ${height}`;
  canvas.style.height = 'auto';
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const padTop = height * 0.18;
  const padBot = height * 0.16;
  drawCaterpillar(ctx, chain, 0, padTop, width, height - padTop - padBot, eyeDirection, { mood });
  return canvas;
}

/** Create an animated canvas element */
export function createAnimatedCaterpillar(
  chain: number[],
  width: number,
  height: number,
  eyeDirection: EyeDirection = 'forward',
  mood: Mood = 'neutral'
): { canvas: HTMLCanvasElement; destroy: () => void } {
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.maxWidth = `${width}px`;
  canvas.style.width = '100%';
  canvas.style.aspectRatio = `${width} / ${height}`;
  canvas.style.height = 'auto';

  let animId = 0;
  let lastBlink = 0;
  let blinkPhase = 0;
  let blinking = false;

  function frame(now: number) {
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const time = now / 1000;
    const breathe = 1 + Math.sin(time * 2) * 0.015;

    // Blinking
    if (!blinking && now - lastBlink > 2500 + Math.random() * 3000) {
      blinking = true;
      lastBlink = now;
    }
    if (blinking) {
      const blinkElapsed = now - lastBlink;
      if (blinkElapsed < 150) blinkPhase = blinkElapsed / 150;
      else if (blinkElapsed < 300) blinkPhase = 1 - (blinkElapsed - 150) / 150;
      else { blinkPhase = 0; blinking = false; }
    }

    const padTop = height * 0.18;
    const padBot = height * 0.16;
    drawCaterpillar(ctx, chain, 0, padTop, width, height - padTop - padBot, eyeDirection, {
      blinkPhase,
      breatheScale: breathe,
      mood,
      time,
      animated: true,
    });

    animId = requestAnimationFrame(frame);
  }

  animId = requestAnimationFrame(frame);

  return {
    canvas,
    destroy: () => cancelAnimationFrame(animId),
  };
}
