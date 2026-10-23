import "./styles.css";
import { createAllBots } from "./bots/Bot";
import { drawBot } from "./bots/render";
import { updateSteering, Rect } from "./bots/steering";
import { setupInputBar, InputBarController } from "./ui/input";

export type AppState = "IDLE" | "THINKING" | "REVEALING" | "SETTLED";

const canvas = document.getElementById("bots-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const inputContainer = document.getElementById("input-container") as HTMLElement;
const questionForm = document.getElementById("question-form") as HTMLFormElement;
const questionInput = document.getElementById("question-input") as HTMLInputElement;
const charCounter = document.getElementById("char-counter") as HTMLElement;
const inputHint = document.getElementById("input-hint") as HTMLElement;

let dpr = 1;
let width = window.innerWidth;
let height = window.innerHeight;
let appState: AppState = "IDLE";

const cursor = { x: 0, y: 0 };
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = reducedMotionQuery.matches;

reducedMotionQuery.addEventListener("change", (e) => {
  reducedMotion = e.matches;
});

window.addEventListener("pointermove", (e) => {
  cursor.x = e.clientX;
  cursor.y = e.clientY;
});

let bots = createAllBots(width, height);
let inputBarRect: Rect | null = null;
const lastWinnerPos: { x: number; y: number } | null = null;

function updateInputRect(): void {
  if (inputContainer) {
    const rect = inputContainer.getBoundingClientRect();
    inputBarRect = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };
  }
}

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
  updateInputRect();
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
  const dt = Math.min(32, now - lastTime);
  lastTime = now;

  updateSteering(bots, {
    dt,
    width,
    height,
    inputBarRect,
    cursor,
    lastWinnerPos,
    freezeWander: appState === "REVEALING",
    reducedMotion,
  });

  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height);

  for (let i = 0; i < bots.length; i++) {
    drawBot(ctx, bots[i], now, cursor, reducedMotion);
  }

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
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopLoop();
  } else {
    startLoop();
  }
});

export let inputController: InputBarController | null = null;
if (questionInput && charCounter && inputHint && questionForm && inputContainer) {
  inputController = setupInputBar(inputContainer, questionInput, charCounter, inputHint, questionForm, {
    canSubmit: () => appState === "IDLE",
    onSubmit: (question) => {
      // Handled in later milestones via api.ts
      console.log("Question submitted:", question);
    },
  });
}

resizeCanvas();
startLoop();
