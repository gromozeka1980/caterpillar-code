// Lightweight confetti effect for victory screen

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  w: number;
  h: number;
  color: string;
  life: number;
}

const CONFETTI_COLORS = ['#e94560', '#3dc96e', '#6dd5fa', '#ffd93d', '#ff6b6b', '#a855f7'];

export function launchConfetti(container: HTMLElement, duration = 2500) {
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  const rect = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;

  const particles: Particle[] = [];
  for (let i = 0; i < 80; i++) {
    particles.push({
      x: W * 0.5 + (Math.random() - 0.5) * W * 0.3,
      y: H * 0.4,
      vx: (Math.random() - 0.5) * 12,
      vy: -Math.random() * 10 - 4,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      w: Math.random() * 8 + 4,
      h: Math.random() * 6 + 2,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      life: 1,
    });
  }

  const start = performance.now();

  function frame(now: number) {
    const elapsed = now - start;
    if (elapsed > duration) {
      canvas.remove();
      return;
    }

    ctx.clearRect(0, 0, W, H);

    for (const p of particles) {
      p.vy += 0.2; // gravity
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.life = Math.max(0, 1 - elapsed / duration);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
