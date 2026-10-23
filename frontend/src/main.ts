import "./styles.css";

const canvas = document.getElementById("bots-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

let dpr = 1;
let width = window.innerWidth;
let height = window.innerHeight;

export function resizeCanvas(): void {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}

export function drawGrid(context: CanvasRenderingContext2D, w: number, h: number): void {
  context.fillStyle = "#0B0D10";
  context.fillRect(0, 0, w, h);

  context.strokeStyle = "#14181D";
  context.lineWidth = 1;
  context.beginPath();

  const cellSize = 24;
  for (let x = 0; x <= w; x += cellSize) {
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, h);
  }
  for (let y = 0; y <= h; y += cellSize) {
    context.moveTo(0, y + 0.5);
    context.lineTo(w, y + 0.5);
  }
  context.stroke();
}

let lastTime = 0;
let rafId = 0;

function frame(now: number): void {
  // Clamp dt to 32ms to survive tab-switch spikes
  const dt = Math.min(32, now - lastTime);
  lastTime = now;
  void dt;

  drawGrid(ctx, width, height);

  rafId = requestAnimationFrame(frame);
}

function startLoop(): void {
  if (!rafId) {
    lastTime = performance.now();
    rafId = requestAnimationFrame(frame);
  }
}

function stopLoop(): void {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

window.addEventListener("resize", () => {
  resizeCanvas();
  drawGrid(ctx, width, height);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopLoop();
  } else {
    startLoop();
  }
});

resizeCanvas();
startLoop();
