// Caterpillar canvas renderer — preserves the original Kivy visual style
// Draws ellipses for body segments, rectangles for connectors, head with eyes

export type EyeDirection = 'forward' | 'left' | 'right';

export const COLORS: Record<number, [number, number, number]> = {
  0: [0.9921, 0.3882, 0.4118],  // Pink/Red
  1: [0.6627, 0.8942, 0.21569], // Green
  2: [0.20784, 0.27056, 0.3921], // Dark Blue
  3: [0.7098, 0.8, 0.6941],     // Light Green/Sage
};

function toCSS(rgb: [number, number, number], alpha = 1): string {
  return `rgba(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)}, ${alpha})`;
}

function drawEllipse(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  eyeDirection: EyeDirection,
  ex: number, ey: number, ew: number, eh: number
) {
  // White of the eye
  ctx.fillStyle = '#fff';
  drawEllipse(ctx, ex, ey, ew, eh);

  // Pupil position depends on direction
  let px = ex;
  let py = ey + eh * 0.25;
  if (eyeDirection === 'forward') {
    px = ex + ew * 0.25;
  } else if (eyeDirection === 'left') {
    px = ex;
  } else if (eyeDirection === 'right') {
    px = ex + ew * 0.5;
  }

  ctx.fillStyle = '#000';
  drawEllipse(ctx, px, py, ew * 0.5, eh * 0.5);
}

function drawSegment(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: [number, number, number],
  first: boolean, last: boolean
) {
  ctx.fillStyle = toCSS(color);
  // Main ellipse
  drawEllipse(ctx, x, y, w, h);

  // Connector rectangles
  if (!first) {
    ctx.fillRect(x, y, w / 2, h);
  }
  if (!last) {
    ctx.fillRect(x + w / 2, y, w / 2, h);
    // Divider line
    ctx.strokeStyle = `rgba(0, 0, 0, 0.2)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();
  }
}

function drawHead(
  ctx: CanvasRenderingContext2D,
  eyeDirection: EyeDirection,
  x: number, y: number, w: number, h: number,
  color: [number, number, number],
  last: boolean
) {
  drawSegment(ctx, x, y, w, h, color, true, last);
  // Two eyes
  drawEye(ctx, eyeDirection, x, y + h * 0.4, w * 0.2, h * 0.2);
  drawEye(ctx, eyeDirection, x + w * 0.4, y + h * 0.4, w * 0.2, h * 0.2);
}

export function drawCaterpillar(
  ctx: CanvasRenderingContext2D,
  chain: number[],
  x: number, y: number,
  maxW: number, maxH: number,
  eyeDirection: EyeDirection = 'forward'
) {
  if (chain.length === 0) return;

  const NUM_SLOTS = 7;
  let w = maxW;
  let h = maxH;

  // Aspect constraint like original: if a < b*num then b = a/num, else a = b*num
  if (w < h * NUM_SLOTS) {
    h = w / NUM_SLOTS;
  } else {
    w = h * NUM_SLOTS;
  }

  const segW = w / NUM_SLOTS;
  const segH = h;

  for (let i = 0; i < chain.length; i++) {
    const sx = x + segW * i;
    const last = i === chain.length - 1;
    const color = COLORS[chain[i]];

    if (i === 0) {
      drawHead(ctx, eyeDirection, sx, y, segW, segH, color, last);
    } else {
      drawSegment(ctx, sx, y, segW, segH, color, false, last);
    }
  }
}

/** Create a small canvas element with a caterpillar drawn on it */
export function createCaterpillarCanvas(
  chain: number[],
  width: number,
  height: number,
  eyeDirection: EyeDirection = 'forward'
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  drawCaterpillar(ctx, chain, 0, 0, width, height, eyeDirection);
  return canvas;
}
