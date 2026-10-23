import type { Bot } from "./Bot";
import { hexA } from "../lib/color";

export interface CursorState {
  x: number;
  y: number;
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

  const crownY = bot.y - bot.r * bot.revealScale - 26;

  ctx.save();
  ctx.translate(bot.x, crownY);
  ctx.scale(scale, scale);

  ctx.fillStyle = "#FBBF24";
  ctx.strokeStyle = "#D97706";
  ctx.lineWidth = 1.5;

  // 3-point crown
  ctx.beginPath();
  ctx.moveTo(-12, 4);
  ctx.lineTo(-14, -8);
  ctx.lineTo(-5, -2);
  ctx.lineTo(0, -12);
  ctx.lineTo(5, -2);
  ctx.lineTo(14, -8);
  ctx.lineTo(12, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Jewels at points
  ctx.fillStyle = "#FFF";
  ctx.beginPath();
  ctx.arc(-14, -8, 1.5, 0, Math.PI * 2);
  ctx.arc(0, -12, 1.5, 0, Math.PI * 2);
  ctx.arc(14, -8, 1.5, 0, Math.PI * 2);
  ctx.fill();

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
  ctx.font = bot.chosen ? "bold 13px ui-sans-serif, system-ui, sans-serif" : "12px ui-sans-serif, system-ui, sans-serif";
  const textMetrics = ctx.measureText(text);
  const paddingX = 10;
  const paddingY = 6;
  void paddingY;
  const bubbleWidth = textMetrics.width + paddingX * 2;
  const bubbleHeight = 24;

  const bubbleX = bot.x;
  const bubbleY = bot.y - bot.r * bot.revealScale - (bot.chosen ? 46 : 38);

  ctx.translate(bubbleX, bubbleY);
  ctx.scale(bubbleProgress, bubbleProgress);

  // Bubble background
  ctx.fillStyle = "rgba(20, 24, 29, 0.92)";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.roundRect(-bubbleWidth / 2, -bubbleHeight / 2, bubbleWidth, bubbleHeight, 6);
  ctx.fill();
  ctx.stroke();

  // Tail
  ctx.beginPath();
  ctx.moveTo(-4, bubbleHeight / 2);
  ctx.lineTo(0, bubbleHeight / 2 + 5);
  ctx.lineTo(4, bubbleHeight / 2);
  ctx.fillStyle = "rgba(20, 24, 29, 0.92)";
  ctx.fill();

  // Text
  ctx.fillStyle = "#E8ECF1";
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

  // 26px above bot top boundary, clamped to >= 40px from top
  const botTopY = bot.y - bot.r * totalScale;
  const tagY = Math.max(40, botTopY - 26);

  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "11px ui-monospace, 'SFMono-Regular', Menlo, monospace";

  const showLabel = viewportWidth >= 480;
  const percentText = `${Math.round(bot.pDisplay * 100)}%`;

  // Draw label line if screen >= 480px
  if (showLabel) {
    const labelText = bot.label || bot.slot;
    ctx.fillStyle = "#E8ECF1";
    ctx.fillText(labelText, bot.x, tagY - 10);
  }

  // Draw 96x6px probability bar
  const barW = 96;
  const barH = 6;
  const barX = bot.x - barW / 2;
  const barY = tagY;

  // Background track
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 3);
  ctx.fill();

  // Filled bar: winner full color, others 50% alpha
  const fillW = Math.max(0, Math.min(barW, Math.round(bot.pDisplay * barW)));
  ctx.fillStyle = bot.chosen ? bot.color : hexA(bot.color, 0.5);
  if (fillW > 0) {
    ctx.beginPath();
    ctx.roundRect(barX, barY, fillW, barH, 3);
    ctx.fill();
  }

  // Percent text below bar
  ctx.fillStyle = "#6B7685";
  ctx.fillText(percentText, bot.x, barY + barH + 11);

  ctx.restore();
}

export function drawBot(
  ctx: CanvasRenderingContext2D,
  bot: Bot,
  t: number,
  cursor: CursorState,
  reducedMotion: boolean = false,
  lookAtCamera: boolean = false
): void {
  const bobAmp = reducedMotion ? 0 : 3 + 2 * bot.mood;
  const bob = reducedMotion ? 0 : Math.sin((t / 2400) * 2 * Math.PI + bot.seed) * bobAmp;

  const moodScale = 1 + 0.06 * bot.mood;
  const totalScale = moodScale * bot.revealScale;

  const sadFactor = Math.max(0, -bot.mood);
  const scaleX = totalScale * (1 + 0.05 * sadFactor);
  const scaleY = totalScale * (1 - 0.08 * sadFactor);

  const drawX = bot.x;
  const drawY = bot.y + bob;

  ctx.save();
  ctx.translate(drawX, drawY);
  ctx.scale(scaleX, scaleY);

  // 1. Radial Halo
  const haloR = bot.r * 1.7;
  const haloAlpha = Math.max(0.18, Math.min(0.48, 0.33 + 0.15 * bot.mood));
  const grad = ctx.createRadialGradient(0, 0, bot.r * 0.8, 0, 0, haloR);
  grad.addColorStop(0, hexA(bot.color, haloAlpha));
  grad.addColorStop(1, hexA(bot.color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, haloR, 0, Math.PI * 2);
  ctx.fill();

  // 2. Antenna
  const antennaAngle = -0.55 * bot.mood;
  const antennaLen = 14;
  const antennaStartX = 0;
  const antennaStartY = -bot.r;
  const antennaEndX = antennaStartX + Math.sin(antennaAngle) * antennaLen;
  const antennaEndY = antennaStartY - Math.cos(antennaAngle) * antennaLen;

  ctx.strokeStyle = bot.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(antennaStartX, antennaStartY);
  ctx.lineTo(antennaEndX, antennaEndY);
  ctx.stroke();

  ctx.fillStyle = bot.color;
  ctx.beginPath();
  ctx.arc(antennaEndX, antennaEndY, 3, 0, Math.PI * 2);
  ctx.fill();

  // 3. Rounded-rect body
  const w = bot.r * 2;
  const h = bot.r * 2;
  const radius = 8;
  ctx.fillStyle = bot.color;
  ctx.beginPath();
  ctx.roundRect(-bot.r, -bot.r, w, h, radius);
  ctx.fill();

  // 4. Eyes
  let eyeOffsetX = 0;
  let eyeOffsetY = 0;
  if (!lookAtCamera && (cursor.x !== 0 || cursor.y !== 0)) {
    const dx = cursor.x - drawX;
    const dy = cursor.y - drawY;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.1) {
      eyeOffsetX = Math.max(-4, Math.min(4, (dx / dist) * 4));
      eyeOffsetY = Math.max(-4, Math.min(4, (dy / dist) * 4));
    }
  }

  ctx.fillStyle = "#0B0D10";
  const eyeR = 2.5;
  const eyeBaseY = -2;

  ctx.beginPath();
  ctx.arc(-7 + eyeOffsetX, eyeBaseY + eyeOffsetY, eyeR, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(7 + eyeOffsetX, eyeBaseY + eyeOffsetY, eyeR, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
