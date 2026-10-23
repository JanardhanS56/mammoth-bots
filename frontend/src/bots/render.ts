import type { Bot } from "./Bot";
import { hexA } from "../lib/color";

export interface CursorState {
  x: number;
  y: number;
}

export interface BotTrailPoint {
  x: number;
  y: number;
  t: number;
}

export function drawCrown(
  ctx: CanvasRenderingContext2D,
  bot: Bot,
  elapsed: number,
  coinFlip: boolean
): void {
  if (coinFlip || !bot.chosen || elapsed < 200) return;

  const progress = Math.min(1, (elapsed - 200) / 300);
  // Overshoot 0 -> 1.15 -> 1.0
  let scale = 1;
  if (progress < 0.7) {
    scale = (progress / 0.7) * 1.15;
  } else {
    scale = 1.15 - ((progress - 0.7) / 0.3) * 0.15;
  }

  const crownY = bot.y - bot.r * bot.revealScale - 28;

  ctx.save();
  ctx.translate(bot.x, crownY);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#F59E0B";
  ctx.strokeStyle = "#18181B";
  ctx.lineWidth = 1.5;

  // 3-point minimalist geometric crown
  ctx.beginPath();
  ctx.moveTo(-13, 5);
  ctx.lineTo(-15, -9);
  ctx.lineTo(-5, -2);
  ctx.lineTo(0, -13);
  ctx.lineTo(5, -2);
  ctx.lineTo(15, -9);
  ctx.lineTo(13, 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Geometric crown jewels
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(-15, -9, 1.8, 0, Math.PI * 2);
  ctx.arc(0, -13, 2, 0, Math.PI * 2);
  ctx.arc(15, -9, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#18181B";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

export function getBotSpeechCopy(bot: Bot): string {
  if (bot.chosen) {
    return bot.streak >= 2 ? "ha." : bot.label || "yes.";
  }
  if (bot.streak <= -3) return "why do I even";
  if (bot.streak <= -2) return "hmph.";
  return "…";
}

export function drawSpeech(
  ctx: CanvasRenderingContext2D,
  bot: Bot,
  elapsed: number
): void {
  if (elapsed < 600) return;

  const bubbleProgress = Math.min(1, (elapsed - 600) / 200);
  const text = getBotSpeechCopy(bot);
  if (!text) return;

  ctx.save();
  ctx.font = bot.chosen
    ? "bold 12px ui-sans-serif, system-ui, sans-serif"
    : "11px ui-sans-serif, system-ui, sans-serif";
  const textMetrics = ctx.measureText(text);
  const paddingX = 10;
  const bubbleWidth = Math.max(34, textMetrics.width + paddingX * 2);
  const bubbleHeight = 22;

  const bubbleX = bot.x;
  const bubbleY = bot.y - bot.r * bot.revealScale - (bot.chosen ? 50 : 38);

  ctx.translate(bubbleX, bubbleY);
  ctx.scale(bubbleProgress, bubbleProgress);

  // Minimalist white speech bubble with crisp black stroke
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "#18181B";
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.roundRect(-bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth, bubbleHeight, 6);
  ctx.fill();
  ctx.stroke();

  // Speech bubble pointer tail
  ctx.beginPath();
  ctx.moveTo(-4, bubbleHeight / 2);
  ctx.lineTo(0, bubbleHeight / 2 + 5);
  ctx.lineTo(4, bubbleHeight / 2);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.stroke();

  // Fill in tail seam
  ctx.beginPath();
  ctx.moveTo(-3, bubbleHeight / 2 - 0.5);
  ctx.lineTo(3, bubbleHeight / 2 - 0.5);
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Speech text
  ctx.fillStyle = "#18181B";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 1);

  ctx.restore();
}

export function drawNerdTag(
  ctx: CanvasRenderingContext2D,
  bot: Bot,
  viewportWidth: number
): void {
  const moodScale = 1 + 0.06 * bot.mood;
  const totalScale = moodScale * bot.revealScale;

  // Clamped >= 40px from top
  const botTopY = bot.y - bot.r * totalScale;
  const tagY = Math.max(40, botTopY - 26);

  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "11px ui-monospace, 'SFMono-Regular', Menlo, monospace";

  const showLabel = viewportWidth >= 480;
  const percentText = `${Math.round(bot.pDisplay * 100)}%`;

  if (showLabel && bot.label) {
    ctx.fillStyle = "#18181B";
    ctx.fillText(bot.label, bot.x, tagY - 10);
  }

  // Draw 96x6px probability bar
  const barW = 96;
  const barH = 6;
  const barX = bot.x - barW / 2;
  const barY = tagY;

  // Background track
  ctx.fillStyle = "#E4E4E7";
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 3);
  ctx.fill();

  // Filled bar: winner full color, others 60% alpha
  const fillW = Math.max(0, Math.min(barW, Math.round(bot.pDisplay * barW)));
  ctx.fillStyle = bot.chosen ? bot.color : hexA(bot.color, 0.6);
  if (fillW > 0) {
    ctx.beginPath();
    ctx.roundRect(barX, barY, fillW, barH, 3);
    ctx.fill();
  }

  ctx.fillStyle = "#71717A";
  ctx.fillText(percentText, bot.x, barY + barH + 11);

  ctx.restore();
}

/**
 * Draws the faint, roaming path trail left by an agent across the white canvas.
 */
export function drawRoamingTrail(
  ctx: CanvasRenderingContext2D,
  points: BotTrailPoint[],
  color: string,
  now: number
): void {
  if (points.length < 2) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 1; i < points.length; i++) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const age = now - p2.t;
    const maxAge = 4000;
    if (age > maxAge) continue;

    const alpha = (1 - age / maxAge) * 0.22;
    ctx.strokeStyle = hexA(color, alpha);
    ctx.lineWidth = 2.5 * (1 - age / maxAge);
    ctx.setLineDash([4, 6]);

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draws the shape body:
 * 0: Circle (Blue)
 * 1: Triangle (Green)
 * 2: Diamond (Red)
 * 3: Round edged square (Squircle) (Yellow)
 */
function drawShapeGeometry(
  ctx: CanvasRenderingContext2D,
  shape: string,
  r: number,
  color: string
): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = "#18181B";
  ctx.lineWidth = 2;

  ctx.beginPath();
  if (shape === "triangle") {
    // Equilateral triangle with rounded vertex feel
    const h = r * 1.35;
    const w = r * 1.25;
    ctx.moveTo(0, -h);
    ctx.lineTo(w, h * 0.75);
    ctx.lineTo(-w, h * 0.75);
    ctx.closePath();
  } else if (shape === "diamond") {
    // Diamond / Rhombus shape
    const dw = r * 1.15;
    const dh = r * 1.3;
    ctx.moveTo(0, -dh);
    ctx.lineTo(dw, 0);
    ctx.lineTo(0, dh);
    ctx.lineTo(-dw, 0);
    ctx.closePath();
  } else if (shape === "squircle") {
    // Round edged square
    const size = r * 2.1;
    ctx.roundRect(-size / 2, -size / 2, size, size, 12);
  } else {
    // Default circle (Blue)
    ctx.arc(0, 0, r * 1.05, 0, Math.PI * 2);
  }

  ctx.fill();
  ctx.stroke();
}

/**
 * Draws expressive, interactive eyes that track the cursor and blink naturally.
 */
function drawEyes(
  ctx: CanvasRenderingContext2D,
  eyeOffset: { x: number; y: number },
  isBlinking: boolean,
  mood: number
): void {
  const eyeSpacing = 8;
  const eyeBaseY = -3;
  const eyeR = 4.5;
  const pupilR = 2.2;

  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = "#18181B";
  ctx.lineWidth = 1.2;

  if (isBlinking) {
    // Cute curved blink lines
    ctx.beginPath();
    ctx.arc(-eyeSpacing, eyeBaseY + 1, 4, Math.PI * 0.8, Math.PI * 0.2, true);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(eyeSpacing, eyeBaseY + 1, 4, Math.PI * 0.8, Math.PI * 0.2, true);
    ctx.stroke();
    return;
  }

  // Left Eye white
  ctx.beginPath();
  ctx.arc(-eyeSpacing, eyeBaseY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Right Eye white
  ctx.beginPath();
  ctx.arc(eyeSpacing, eyeBaseY, eyeR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Pupils
  ctx.fillStyle = "#09090B";

  ctx.beginPath();
  ctx.arc(
    -eyeSpacing + eyeOffset.x,
    eyeBaseY + eyeOffset.y,
    pupilR,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.beginPath();
  ctx.arc(
    eyeSpacing + eyeOffset.x,
    eyeBaseY + eyeOffset.y,
    pupilR,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // Tiny glint specular highlight
  ctx.fillStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.arc(-eyeSpacing + eyeOffset.x - 0.8, eyeBaseY + eyeOffset.y - 0.8, 0.8, 0, Math.PI * 2);
  ctx.arc(eyeSpacing + eyeOffset.x - 0.8, eyeBaseY + eyeOffset.y - 0.8, 0.8, 0, Math.PI * 2);
  ctx.fill();

  // Happy eyebrow curve if winning mood
  if (mood > 0.3) {
    ctx.strokeStyle = "#18181B";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(-eyeSpacing, eyeBaseY - 4, 3, Math.PI, 0, false);
    ctx.arc(eyeSpacing, eyeBaseY - 4, 3, Math.PI, 0, false);
    ctx.stroke();
  }
}

/**
 * Draws the physical handheld sign/board showing option and probability.
 */
function drawBoard(
  ctx: CanvasRenderingContext2D,
  bot: Bot,
  tiltAngle: number
): void {
  const boardW = 108;
  const boardH = 46;
  const boardY = bot.r + 26;

  ctx.save();
  ctx.translate(0, boardY);
  ctx.rotate(tiltAngle);

  // Placard stem / post connecting bot to board
  ctx.strokeStyle = "#18181B";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -boardH / 2 - 8);
  ctx.lineTo(0, -boardH / 2);
  ctx.stroke();

  // Soft tactile drop shadow under the board
  ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
  ctx.beginPath();
  ctx.roundRect(-boardW / 2 + 2, -boardH / 2 + 4, boardW, boardH, 8);
  ctx.fill();

  // White board body
  ctx.fillStyle = "#FFFFFF";
  ctx.strokeStyle = bot.chosen ? bot.color : "#18181B";
  ctx.lineWidth = bot.chosen ? 2.5 : 1.5;

  ctx.beginPath();
  ctx.roundRect(-boardW / 2, -boardH / 2, boardW, boardH, 8);
  ctx.fill();
  ctx.stroke();

  // Two cute little hands/grippers gripping the top sides of the board
  ctx.fillStyle = bot.color;
  ctx.strokeStyle = "#18181B";
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.arc(-boardW / 2 + 14, -boardH / 2, 4.5, 0, Math.PI * 2);
  ctx.arc(boardW / 2 - 14, -boardH / 2, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 1. Probability Display
  const pct = Math.round(bot.pDisplay * 100);
  const percentText = bot.p !== null ? `${pct}%` : "—%";

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = bot.chosen ? bot.color : "#09090B";
  ctx.font = "bold 16px ui-monospace, 'SFMono-Regular', Menlo, Monaco, monospace";
  ctx.fillText(percentText, 0, -8);

  // 2. Option Label Display
  let optionText = bot.label || "ready";
  if (optionText.length > 17) {
    optionText = optionText.substring(0, 15) + "…";
  }

  ctx.fillStyle = bot.label ? "#27272A" : "#A1A1AA";
  ctx.font = "500 10.5px ui-sans-serif, system-ui, -apple-system, sans-serif";
  ctx.fillText(optionText, 0, 11);

  ctx.restore();
}

/**
 * Main drawBot function rendering the 4 distinct geometric shape bots
 * holding their option & probability boards.
 */
export function drawBot(
  ctx: CanvasRenderingContext2D,
  bot: Bot,
  t: number,
  cursor: CursorState,
  reducedMotion: boolean = false,
  lookAtCamera: boolean = false
): void {
  // Natural periodic eye blink cycle
  const blinkCycle = ((t + bot.id * 1400) % 3600);
  const isBlinking = blinkCycle < 140;

  // Gentle walking bob
  const bobAmp = reducedMotion ? 0 : 2.5 + 1.5 * bot.mood;
  const bob = reducedMotion ? 0 : Math.sin((t / 2000) * 2 * Math.PI + bot.seed) * bobAmp;

  // Jump animation on click/hop
  const hop = bot.hopOffset || 0;

  const moodScale = 1 + 0.05 * bot.mood;
  const totalScale = moodScale * bot.revealScale;

  const sadFactor = Math.max(0, -bot.mood);
  const scaleX = totalScale * (1 + 0.04 * sadFactor);
  const scaleY = totalScale * (1 - 0.06 * sadFactor);

  const drawX = bot.x;
  const drawY = bot.y + bob + hop;

  // Board tilt based on horizontal velocity
  const tiltAngle = Math.max(-0.16, Math.min(0.16, (bot.vx / 90) * 0.14));

  ctx.save();
  ctx.translate(drawX, drawY);

  // Contact shadow on the white canvas floor
  const shadowR = bot.r * totalScale * 0.9;
  ctx.fillStyle = "rgba(0, 0, 0, 0.07)";
  ctx.beginPath();
  ctx.ellipse(0, bot.r * totalScale + 44, shadowR, shadowR * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.scale(scaleX, scaleY);

  // 1. Draw Geometric Shape (Circle, Triangle, Diamond, Squircle)
  drawShapeGeometry(ctx, bot.shape, bot.r, bot.color);

  // 2. Eye Tracking
  let eyeOffsetX = 0;
  let eyeOffsetY = 0;
  if (!lookAtCamera && (cursor.x !== 0 || cursor.y !== 0)) {
    const dx = cursor.x - drawX;
    const dy = cursor.y - drawY;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.1) {
      eyeOffsetX = Math.max(-2.5, Math.min(2.5, (dx / dist) * 2.5));
      eyeOffsetY = Math.max(-2.2, Math.min(2.2, (dy / dist) * 2.2));
    }
  }

  drawEyes(ctx, { x: eyeOffsetX, y: eyeOffsetY }, isBlinking, bot.mood);

  // 3. Handheld Option & Probability Board
  drawBoard(ctx, bot, tiltAngle);

  ctx.restore();
}
