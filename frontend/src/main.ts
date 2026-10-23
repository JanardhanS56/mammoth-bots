import "./styles.css";
import { createAllBots, Bot } from "./bots/Bot";
import { drawBot } from "./bots/render";
import { updateSteering, Rect } from "./bots/steering";
import { createRenderLoop } from "./bots/loop";
import { setupInputBar, InputBarController } from "./ui/input";
import { decide, DecideResponse } from "./api";
import { showToast } from "./ui/toast";
import { easeOutCubic, lerp } from "./lib/ease";

export type AppState = "IDLE" | "THINKING" | "REVEALING" | "SETTLED";

const canvas = document.getElementById("bots-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const inputContainer = document.getElementById("input-container") as HTMLElement;
const questionForm = document.getElementById("question-form") as HTMLFormElement;
const questionInput = document.getElementById("question-input") as HTMLInputElement;
const charCounter = document.getElementById("char-counter") as HTMLElement;
const inputHint = document.getElementById("input-hint") as HTMLElement;
const a11yResult = document.getElementById("a11y-result") as HTMLElement;

let appState: AppState = "IDLE";
let currentResult: DecideResponse | null = null;
let revealStartTime = 0;
const startScales: number[] = [1, 1, 1, 1];
const startPs: number[] = [0.25, 0.25, 0.25, 0.25];

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

let bots: Bot[] = createAllBots(window.innerWidth, window.innerHeight);
let inputBarRect: Rect | null = null;
let lastWinnerPos: { x: number; y: number } | null = null;

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

function handleStateUpdate(now: number): void {
  if (appState === "REVEALING") {
    const elapsed = now - revealStartTime;
    const progress = reducedMotion ? 1 : Math.min(1, elapsed / 600);
    const eased = easeOutCubic(progress);

    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      b.pDisplay = lerp(startPs[i], b.targetP, eased);
      b.revealScale = lerp(startScales[i], b.targetScale, eased);
    }

    if (elapsed >= 600 || reducedMotion) {
      appState = "SETTLED";
      if (currentResult) {
        const winner = bots[currentResult.chosenId];
        lastWinnerPos = { x: winner.x, y: winner.y };
        if (a11yResult) {
          a11yResult.textContent = `The robots decided: Option ${winner.label || winner.slot}, ${Math.round(
            (winner.p ?? 0.25) * 100
          )}% probability.`;
        }
      }
    }
  } else if (appState === "SETTLED") {
    const elapsed = now - revealStartTime;
    if (elapsed >= 1400) {
      // 600ms reveal + 800ms settled
      appState = "IDLE";
      inputController?.setDisabled(false);
    }
  }
}

export const renderLoop = createRenderLoop(canvas, {
  onResize: (width, height) => {
    updateInputRect();
    const spacing = width / 5;
    const centerY = height * 0.4;
    for (let i = 0; i < bots.length; i++) {
      if (appState === "IDLE") {
        bots[i].x = spacing * (i + 1);
        bots[i].y = centerY;
      }
    }
  },
  onUpdate: (dt, now) => {
    handleStateUpdate(now);

    const dims = renderLoop.getDimensions();
    updateSteering(bots, {
      dt,
      width: dims.width,
      height: dims.height,
      inputBarRect,
      cursor,
      lastWinnerPos,
      freezeWander: appState === "REVEALING" || appState === "SETTLED",
      reducedMotion,
    });
  },
  onRender: (now) => {
    const dims = renderLoop.getDimensions();
    ctx.clearRect(0, 0, dims.width, dims.height);
    drawGrid(ctx, dims.width, dims.height);

    for (let i = 0; i < bots.length; i++) {
      drawBot(ctx, bots[i], now, cursor, reducedMotion);
    }
  },
});

export async function onUserSubmit(question: string): Promise<void> {
  if (appState !== "IDLE") return;

  appState = "THINKING";
  inputController?.setDisabled(true);
  showToast("the robots are conferring…", 2000);

  const res = await decide(question);
  if (!res.ok) {
    appState = "IDLE";
    inputController?.setDisabled(false);
    if (res.error.code === "BAD_INPUT") {
      inputController?.shake();
      inputController?.showHint("that's a lot of words");
    } else if (res.error.code === "RATE_LIMIT") {
      showToast("the robots need a break");
    } else {
      showToast("the robots forgot how to decide");
    }
    return;
  }

  currentResult = res.data;
  revealStartTime = performance.now();
  appState = "REVEALING";

  for (let i = 0; i < bots.length; i++) {
    const b = bots[i];
    const opt = res.data.options[i];
    startScales[i] = b.revealScale;
    startPs[i] = b.pDisplay;

    b.label = opt.label;
    b.description = opt.description;
    b.p = opt.p;
    b.targetP = opt.p;
    b.targetScale = 0.6 + opt.p;
    b.chosen = res.data.chosenId === b.id;
  }
}

export let inputController: InputBarController | null = null;
if (questionInput && charCounter && inputHint && questionForm && inputContainer) {
  inputController = setupInputBar(inputContainer, questionInput, charCounter, inputHint, questionForm, {
    canSubmit: () => appState === "IDLE",
    onSubmit: onUserSubmit,
  });
}

updateInputRect();
renderLoop.start();
