import "./styles.css";
import { createAllBots, Bot } from "./bots/Bot";
import {
  drawBot,
  drawCrown,
  drawSpeech,
  drawNerdTag,
  drawRoamingTrail,
  drawConfetti,
  drawScrumBubble,
  BotTrailPoint,
  ConfettiParticle,
} from "./bots/render";
import { updateSteering, Rect } from "./bots/steering";
import { createRenderLoop } from "./bots/loop";
import { setupInputBar, InputBarController } from "./ui/input";
import { decide, DecideResponse } from "./api";
import { showToast } from "./ui/toast";
import { easeOutCubic, lerp } from "./lib/ease";
import { setupNerdMode, NerdController } from "./ui/nerd";
import { sound } from "./lib/sound";
import {
  loadBotStats,
  decayStreaks,
  recordRoundResult,
  resetBotStats,
  applyStatsToBots,
  BotStatsRecord,
} from "./bots/moods";

export type AppState = "IDLE" | "THINKING" | "REVEALING" | "SETTLED";

interface ClickRipple {
  x: number;
  y: number;
  startTime: number;
  duration: number;
}

interface CursorTrailPoint {
  x: number;
  y: number;
  t: number;
}

const canvas = document.getElementById("bots-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const inputContainer = document.getElementById("input-container") as HTMLElement;
const dilemmaChips = document.getElementById("dilemma-chips") as HTMLElement | null;
const questionForm = document.getElementById("question-form") as HTMLFormElement;
const questionInput = document.getElementById("question-input") as HTMLInputElement;
const charCounter = document.getElementById("char-counter") as HTMLElement;
const inputHint = document.getElementById("input-hint") as HTMLElement;
const a11yResult = document.getElementById("a11y-result") as HTMLElement;
const nerdToggle = document.getElementById("nerd-toggle") as HTMLButtonElement | null;
const nerdPanel = document.getElementById("nerd-panel") as HTMLElement | null;
const amnesiaBtn = document.getElementById("amnesia-btn") as HTMLButtonElement | null;
const soundToggle = document.getElementById("sound-toggle") as HTMLButtonElement | null;

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
const cursorTrail: CursorTrailPoint[] = [];
const ripples: ClickRipple[] = [];
const confetti: ConfettiParticle[] = [];
const botTrails = new Map<number, BotTrailPoint[]>();

// Drag-and-toss state
let draggedBot: Bot | null = null;
const dragSamples: Array<{ x: number; y: number; t: number }> = [];

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let reducedMotion = reducedMotionQuery.matches;

reducedMotionQuery.addEventListener("change", (e) => {
  reducedMotion = e.matches;
});

// Sound toggle setup
if (soundToggle) {
  soundToggle.textContent = sound.isEnabled() ? "sound: on" : "sound: off";
  soundToggle.addEventListener("click", () => {
    const isNowOn = sound.toggle();
    soundToggle.textContent = isNowOn ? "sound: on" : "sound: off";
  });
}

// Dilemma chip quick prompt selection
if (dilemmaChips && questionInput) {
  dilemmaChips.querySelectorAll(".dilemma-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      if (appState !== "IDLE") return;
      const prompt = (pill as HTMLElement).dataset.prompt;
      if (prompt) {
        questionInput.value = prompt;
        inputController?.setValue(prompt);
        onUserSubmit(prompt);
      }
    });
  });
}

window.addEventListener("pointermove", (e) => {
  cursor.x = e.clientX;
  cursor.y = e.clientY;
  const now = performance.now();
  cursorTrail.push({ x: e.clientX, y: e.clientY, t: now });

  if (draggedBot) {
    draggedBot.x = e.clientX;
    draggedBot.y = e.clientY;
    dragSamples.push({ x: e.clientX, y: e.clientY, t: now });
    if (dragSamples.length > 8) dragSamples.shift();
  }
});

canvas.addEventListener("pointerdown", (e) => {
  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;
  const now = performance.now();

  // 1. Check if user clicked directly on a bot to drag / poke it
  for (const b of bots) {
    const dist = Math.hypot(b.x - clickX, b.y - clickY);
    if (dist <= b.r * 2.3) {
      draggedBot = b;
      b.isDragged = true;
      dragSamples.length = 0;
      dragSamples.push({ x: clickX, y: clickY, t: now });
      b.hopOffset = -18;
      sound.playPoke();
      canvas.setPointerCapture?.(e.pointerId);
      return;
    }
  }

  // 2. Add interactive ripple
  ripples.push({ x: clickX, y: clickY, startTime: now, duration: 600 });
  sound.playPoke();

  // 3. Shockwave impulse on nearby bots
  for (const b of bots) {
    const dx = b.x - clickX;
    const dy = b.y - clickY;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist < 180) {
      const force = (1 - dist / 180) * 45;
      b.vx += (dx / dist) * force;
      b.vy += (dy / dist) * force;
      b.hopOffset = -12;
    }
  }
});

window.addEventListener("pointerup", (e) => {
  if (draggedBot) {
    let vx = 0;
    let vy = 0;
    if (dragSamples.length >= 2) {
      const first = dragSamples[0];
      const last = dragSamples[dragSamples.length - 1];
      const dt = (last.t - first.t) / 1000;
      if (dt > 0.01 && dt < 0.25) {
        vx = (last.x - first.x) / dt;
        vy = (last.y - first.y) / dt;
      }
    }

    draggedBot.vx = Math.max(-320, Math.min(320, vx * 0.45));
    draggedBot.vy = Math.max(-320, Math.min(320, vy * 0.45));
    draggedBot.isDragged = false;
    draggedBot.hopOffset = -10;
    sound.playToss();
    draggedBot = null;
    try {
      canvas.releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
  }
});

let bots: Bot[] = createAllBots(window.innerWidth, window.innerHeight);
applyStatsToBots(bots, botStats);

for (const b of bots) {
  botTrails.set(b.id, []);
}

let inputBarRect: Rect | null = null;
let lastWinnerPos: { x: number; y: number } | null = null;
let murmurInterval = 0;

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

/**
 * Minimalist white background with subtle micro-grid.
 */
export function drawGrid(context: CanvasRenderingContext2D, w: number, h: number): void {
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, w, h);

  // Architectural micro-grid with coordinate crosshairs
  const spacing = 28;
  const majorInterval = 4 * spacing; // every 112px

  context.fillStyle = "#E4E4E7";
  for (let x = spacing; x < w; x += spacing) {
    for (let y = spacing; y < h; y += spacing) {
      const isMajor = x % majorInterval === 0 && y % majorInterval === 0;
      if (isMajor) {
        // Precision drafting crosshair
        context.strokeStyle = "#D4D4D8";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x - 3, y);
        context.lineTo(x + 3, y);
        context.moveTo(x, y - 3);
        context.lineTo(x, y + 3);
        context.stroke();
      } else {
        context.beginPath();
        context.arc(x, y, 0.9, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  // Architectural drafting perimeter tick marks
  const margin = 20;
  context.strokeStyle = "#E4E4E7";
  context.lineWidth = 1;

  // Corner registration brackets
  const bracketSize = 12;
  // Top-left
  context.beginPath();
  context.moveTo(margin, margin + bracketSize);
  context.lineTo(margin, margin);
  context.lineTo(margin + bracketSize, margin);
  // Top-right
  context.moveTo(w - margin - bracketSize, margin);
  context.lineTo(w - margin, margin);
  context.lineTo(w - margin, margin + bracketSize);
  // Bottom-left
  context.moveTo(margin, h - margin - bracketSize);
  context.lineTo(margin, h - margin);
  context.lineTo(margin + bracketSize, h - margin);
  // Bottom-right
  context.moveTo(w - margin - bracketSize, h - margin);
  context.lineTo(w - margin, h - margin);
  context.lineTo(w - margin, h - margin - bracketSize);
  context.stroke();

  // Subtle bottom-left scale watermark
  context.fillStyle = "#A1A1AA";
  context.font = "9px ui-monospace, 'SFMono-Regular', Menlo, monospace";
  context.textAlign = "left";
  context.fillText("GRID // 28PX RATIO 1:1 · MAMMOTH QUAD-BOT SYSTEM", margin + 18, h - margin - 3);
}

/**
 * Spawns celebratory geometric confetti particles on winner reveal.
 */
function spawnConfetti(originX: number, originY: number): void {
  if (reducedMotion) return;
  const colors = ["#2563EB", "#16A34A", "#DC2626", "#EAB308"];
  const shapes = ["circle", "triangle", "diamond", "square"];

  for (let i = 0; i < 36; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 70 + Math.random() * 190;
    confetti.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 90,
      size: 5 + Math.random() * 6,
      color: colors[i % colors.length],
      shape: shapes[i % shapes.length],
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 8,
      alpha: 1,
      life: 2.4,
    });
  }
}

/**
 * Draws interactive cursor trail and ripples.
 */
function drawInteractions(context: CanvasRenderingContext2D, now: number): void {
  // 1. Cursor trail
  const maxTrailAge = 400;
  while (cursorTrail.length > 0 && now - cursorTrail[0].t > maxTrailAge) {
    cursorTrail.shift();
  }

  if (cursorTrail.length > 1 && !reducedMotion) {
    context.save();
    for (let i = 1; i < cursorTrail.length; i++) {
      const p1 = cursorTrail[i - 1];
      const p2 = cursorTrail[i];
      const age = now - p2.t;
      const alpha = (1 - age / maxTrailAge) * 0.25;
      context.strokeStyle = `rgba(24, 24, 27, ${alpha})`;
      context.lineWidth = 1.5 * (1 - age / maxTrailAge);
      context.beginPath();
      context.moveTo(p1.x, p1.y);
      context.lineTo(p2.x, p2.y);
      context.stroke();
    }
    context.restore();
  }

  // 2. Click ripples
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    const elapsed = now - r.startTime;
    if (elapsed > r.duration) {
      ripples.splice(i, 1);
      continue;
    }

    const progress = elapsed / r.duration;
    const currentRadius = progress * 65;
    const alpha = (1 - progress) * 0.35;

    context.save();
    context.strokeStyle = `rgba(24, 24, 27, ${alpha})`;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(r.x, r.y, currentRadius, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }
}

function handleStateUpdate(now: number, dt: number, width: number, height: number): void {
  const dtSec = Math.min(0.032, dt / 1000);

  // 1. Update hop spring physics & placard wobble dynamics
  for (const b of bots) {
    if (b.hopOffset && b.hopOffset !== 0) {
      b.hopOffset += (0 - b.hopOffset) * Math.min(1, dtSec * 10);
      if (Math.abs(b.hopOffset) < 0.2) b.hopOffset = 0;
    }

    // Placard inertial spring wobble
    const targetAngle = Math.max(-0.22, Math.min(0.22, (b.vx / 90) * 0.16));
    const springForce = (targetAngle - b.placardAngle) * 36 - b.placardVel * 6.5;
    b.placardVel += springForce * dtSec;
    b.placardAngle += b.placardVel * dtSec;
  }

  // 2. Update confetti physics
  for (let i = confetti.length - 1; i >= 0; i--) {
    const p = confetti[i];
    p.life -= dtSec;
    if (p.life <= 0) {
      confetti.splice(i, 1);
      continue;
    }
    p.x += p.vx * dtSec;
    p.y += p.vy * dtSec;
    p.vy += 220 * dtSec; // gravity
    p.vx *= 0.98; // air resistance
    p.rot += p.vrot * dtSec;
    p.alpha = Math.max(0, p.life / 2.4);
  }

  // 3. Robot Scrum / Huddle when THINKING
  if (appState === "THINKING") {
    const cx = width / 2;
    const cy = height * 0.42;
    const scrumR = 58;

    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      if (b.isDragged) continue;
      const angle = (i * Math.PI) / 2 + Math.PI / 4 + now / 3500;
      const tx = cx + Math.cos(angle) * scrumR;
      const ty = cy + Math.sin(angle) * scrumR;

      b.vx += (tx - b.x) * 4 * dtSec * 60;
      b.vy += (ty - b.y) * 4 * dtSec * 60;
      b.vx *= 0.88;
      b.vy *= 0.88;
      b.x += b.vx * dtSec;
      b.y += b.vy * dtSec;

      // Safe clamp inside canvas
      b.x = Math.max(b.r + 10, Math.min(width - b.r - 10, b.x));
      b.y = Math.max(b.r + 10, Math.min(height - b.r - 10, b.y));
    }

    // Murmur sound pulses
    if (now - murmurInterval > 550) {
      murmurInterval = now;
      sound.playMurmur();
    }
  }

  // 4. Reveal & Settled State Transitions
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
      dilemmaChips?.classList.remove("hidden");
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
    const dims = renderLoop.getDimensions();
    handleStateUpdate(now, dt, dims.width, dims.height);

    if (appState !== "THINKING") {
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
    }

    // Record wandering path coordinates
    for (const b of bots) {
      if (b.isDragged) continue;
      const trail = botTrails.get(b.id);
      if (trail) {
        const last = trail[trail.length - 1];
        if (!last || Math.hypot(b.x - last.x, b.y - last.y) > 6) {
          trail.push({ x: b.x, y: b.y, t: now });
          if (trail.length > 50) trail.shift();
        }
      }
    }
  },
  onRender: (now) => {
    const dims = renderLoop.getDimensions();
    ctx.clearRect(0, 0, dims.width, dims.height);
    drawGrid(ctx, dims.width, dims.height);

    // 1. Draw ephemeral roaming trails for each agent
    for (const b of bots) {
      const trail = botTrails.get(b.id);
      if (trail) {
        drawRoamingTrail(ctx, trail, b.color, now);
      }
    }

    // 2. Draw interactive cursor trails and ripples
    drawInteractions(ctx, now);

    // 3. Draw celebratory confetti particles
    if (confetti.length > 0) {
      drawConfetti(ctx, confetti);
    }

    const elapsed = (appState === "REVEALING" || appState === "SETTLED") ? now - revealStartTime : 0;
    const isCoinFlip = currentResult?.coinFlip ?? false;

    // 4. Draw bots (Shape + Expressive Eyes + Handheld Board)
    for (let i = 0; i < bots.length; i++) {
      const b = bots[i];
      const isTopCoinPair = isCoinFlip && coinFlipTopPair && (i === coinFlipTopPair[0] || i === coinFlipTopPair[1]);
      const lookAtCamera = Boolean(isTopCoinPair && elapsed >= 550);

      drawBot(ctx, b, now, cursor, reducedMotion, lookAtCamera);

      // Thinking Scrum murmurs
      if (appState === "THINKING") {
        const glyphs = ["?", "…", "!", "~"];
        drawScrumBubble(ctx, b, glyphs[i], now);
      }
    }

    // 5. Draw nerd tags (AFTER drawBot)
    if (isNerdActive) {
      for (let i = 0; i < bots.length; i++) {
        drawNerdTag(ctx, bots[i], dims.width);
      }
    }

    // 6. Draw crowns & speech bubbles
    if (appState === "REVEALING" || appState === "SETTLED") {
      for (let i = 0; i < bots.length; i++) {
        const b = bots[i];
        drawCrown(ctx, b, elapsed, isCoinFlip);
        drawSpeech(ctx, b, elapsed);
      }
    }
  },
});

let lastSubmitTimestamp = 0;

export async function onUserSubmit(question: string): Promise<void> {
  const now = Date.now();
  if (appState !== "IDLE") return;

  // Client-side debounce to prevent accidental double-clicks or rapid bursts
  if (now - lastSubmitTimestamp < 2500) {
    inputController?.shake();
    inputController?.showHint("wait a moment…", 1500);
    return;
  }

  lastSubmitTimestamp = now;
  appState = "THINKING";
  roundRecorded = false;
  inputController?.setDisabled(true);
  dilemmaChips?.classList.add("hidden");
  showToast("conferring…", 2000);

  const res = await decide(question);
  if (!res.ok) {
    appState = "IDLE";
    inputController?.setDisabled(false);
    dilemmaChips?.classList.remove("hidden");
    if (res.error.code === "BAD_INPUT") {
      inputController?.shake();
      inputController?.showHint("that's a lot of words");
    } else if (res.error.code === "RATE_LIMIT") {
      showToast(res.error.message, 4500);
      inputController?.showHint(res.error.message, 4500);
    } else {
      showToast(res.error.message || "the robots forgot how to decide", 3000);
    }
    return;
  }

  currentResult = res.data;
  revealStartTime = performance.now();
  appState = "REVEALING";
  sound.playChime();

  if (res.data.fallback) {
    showToast("the robots forgot how to decide", 3000);
  }

  const sortedIndices = res.data.options
    .map((o, idx) => ({ idx, p: o.p }))
    .sort((a, b) => b.p - a.p)
    .map((item) => item.idx);
  coinFlipTopPair = [sortedIndices[0], sortedIndices[1]];

  const winner = bots[res.data.chosenId];
  if (winner) {
    spawnConfetti(winner.x, winner.y);
  }

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

    // Scatter impulse away from scrum center
    const dims = renderLoop.getDimensions();
    const cx = dims.width / 2;
    const cy = dims.height * 0.42;
    const dx = b.x - cx;
    const dy = b.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    b.vx = (dx / dist) * 75;
    b.vy = (dy / dist) * 75;
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
  sound.playPoke();
  showToast("memories cleared", 1500);
});

updateInputRect();
renderLoop.start();
