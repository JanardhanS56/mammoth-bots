import "./styles.css";
import { createAllBots, Bot } from "./bots/Bot";
import { drawBot, drawCrown, drawSpeech, drawNerdTag } from "./bots/render";
import { updateSteering, Rect } from "./bots/steering";
import { createRenderLoop } from "./bots/loop";
import { setupInputBar, InputBarController } from "./ui/input";
import { decide, DecideResponse } from "./api";
import { showToast } from "./ui/toast";
import { easeOutCubic, lerp } from "./lib/ease";
import { setupNerdMode, NerdController } from "./ui/nerd";
import {
  loadBotStats,
  decayStreaks,
  recordRoundResult,
  resetBotStats,
  applyStatsToBots,
  BotStatsRecord,
} from "./bots/moods";

export type AppState = "IDLE" | "THINKING" | "REVEALING" | "SETTLED";

const canvas = document.getElementById("bots-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const inputContainer = document.getElementById("input-container") as HTMLElement;
const questionForm = document.getElementById("question-form") as HTMLFormElement;
const questionInput = document.getElementById("question-input") as HTMLInputElement;
const charCounter = document.getElementById("char-counter") as HTMLElement;
const inputHint = document.getElementById("input-hint") as HTMLElement;
const a11yResult = document.getElementById("a11y-result") as HTMLElement;
const nerdToggle = document.getElementById("nerd-toggle") as HTMLButtonElement | null;
const nerdPanel = document.getElementById("nerd-panel") as HTMLElement | null;
const amnesiaBtn = document.getElementById("amnesia-btn") as HTMLButtonElement | null;

let appState: AppState = "IDLE";
let currentResult: DecideResponse | null = null;
let revealStartTime = 0;
const startScales: number[] = [1, 1, 1, 1];
const startPs: number[] = [0.25, 0.25, 0.25, 0.25];
let coinFlipTopPair: [number, number] | null = null;
let isNerdActive = false;
let roundRecorded = false;

// Persistent moods initialization with decay on load
let botStats: BotStatsRecord = decayStreaks(loadBotStats());

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
applyStatsToBots(bots, botStats);

let inputBarRect: Rect | null = null;
let lastWinnerPos: { x: number; y: number } | null = null;

export const nerdController: NerdController = setupNerdMode(nerdToggle, nerdPanel, (active) => {
  isNerdActive = active;
});

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

    if (currentResult?.coinFlip && coinFlipTopPair && !reducedMotion) {
      const [idxA, idxB] = coinFlipTopPair;
      const botA = bots[idxA];
      const botB = bots[idxB];
      if (elapsed >= 150 && elapsed <= 550) {
        const bumpPhase = (elapsed - 150) / 400;
        const bumpDisp = Math.sin(bumpPhase * Math.PI * 4) * 14;
        const dx = botB.x - botA.x;
        const dy = botB.y - botA.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;

        botA.x += nx * (bumpDisp * 0.05);
        botA.y += ny * (bumpDisp * 0.05);
        botB.x -= nx * (bumpDisp * 0.05);
        botB.y -= ny * (bumpDisp * 0.05);
      }
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

    // t=800: recordResult(), recompute moods
    if (elapsed >= 800 && !roundRecorded && currentResult) {
      roundRecorded = true;
      const winnerSlot = bots[currentResult.chosenId].slot;
      botStats = recordRoundResult(botStats, winnerSlot);
      applyStatsToBots(bots, botStats);
    }

    if (elapsed >= 1400) {
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

    const elapsed = (appState === "REVEALING" || appState === "SETTLED") ? now - revealStartTime : 0;
    const isCoinFlip = currentResult?.coinFlip ?? false;

    // 1. Draw bots
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      const isTopCoinPair = isCoinFlip && coinFlipTopPair && (i === coinFlipTopPair[0] || i === coinFlipTopPair[1]);
      const lookAtCamera = Boolean(isTopCoinPair && elapsed >= 550);

      drawBot(ctx, b, now, cursor, reducedMotion, lookAtCamera);
    }

    // 2. Draw nerd tags (AFTER drawBot)
    if (isNerdActive) {
      for (let i = 0; i < bots.length; i++) {
        drawNerdTag(ctx, bots[i], dims.width);
      }
    }

    // 3. Draw crowns & speech bubbles
    if (appState === "REVEALING" || appState === "SETTLED") {
      for (let i = 0; i < bots.length; i++) {
        const b = bots[i];
        drawCrown(ctx, b, elapsed, isCoinFlip);
        drawSpeech(ctx, b, elapsed);
      }
    }
  },
});

export async function onUserSubmit(question: string): Promise<void> {
  if (appState !== "IDLE") return;

  appState = "THINKING";
  roundRecorded = false;
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

  if (res.data.fallback) {
    showToast("the robots forgot how to decide", 3000);
  }

  const sortedIndices = res.data.options
    .map((o, idx) => ({ idx, p: o.p }))
    .sort((a, b) => b.p - a.p)
    .map((item) => item.idx);
  coinFlipTopPair = [sortedIndices[0], sortedIndices[1]];

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

  nerdController.updatePanel({
    state: res.data.state,
    chosenSlot: res.data.options[res.data.chosenId]?.slot,
    marginPercent: res.data.margin,
    isCoinFlip: res.data.coinFlip,
    timings: res.data.timings,
  });
}

export let inputController: InputBarController | null = null;
if (questionInput && charCounter && inputHint && questionForm && inputContainer) {
  inputController = setupInputBar(inputContainer, questionInput, charCounter, inputHint, questionForm, {
    canSubmit: () => appState === "IDLE",
    onSubmit: onUserSubmit,
  });
}

amnesiaBtn?.addEventListener("click", () => {
  botStats = resetBotStats();
  applyStatsToBots(bots, botStats);
  lastWinnerPos = null;
  showToast("forget everything", 1500);
});

updateInputRect();
renderLoop.start();
