import type { Bot } from "./Bot";
import { createRNG, randomRange } from "../lib/rand";

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SteeringOptions {
  dt: number; // in milliseconds
  width: number;
  height: number;
  inputBarRect: Rect | null;
  cursor: { x: number; y: number };
  lastWinnerPos: { x: number; y: number } | null;
  freezeWander?: boolean;
  reducedMotion?: boolean;
}

// Bot wander timers and RNGs
const botRNGs = new Map<number, () => number>();
const botTimers = new Map<number, number>();

function getRNG(botId: number): () => number {
  let rng = botRNGs.get(botId);
  if (!rng) {
    rng = createRNG(1337 + botId * 997);
    botRNGs.set(botId, rng);
  }
  return rng;
}

export function pickWanderTarget(
  bot: Bot,
  width: number,
  height: number,
  inputBarRect: Rect | null
): void {
  const rng = getRNG(bot.id);
  const margin = bot.r + 30;

  // Bottom boundary is top of input bar minus margin if input bar exists
  const bottomLimit = inputBarRect ? inputBarRect.top - 40 - margin : height - margin;
  const minY = margin + 30; // Leave room at top
  const maxY = Math.max(minY + 50, bottomLimit);

  bot.target = {
    x: randomRange(rng, margin, width - margin),
    y: randomRange(rng, minY, maxY),
  };
}

export function updateSteering(bots: Bot[], options: SteeringOptions): void {
  const {
    dt,
    width,
    height,
    inputBarRect,
    cursor,
    lastWinnerPos,
    freezeWander = false,
    reducedMotion = false,
  } = options;

  if (reducedMotion) {
    for (const b of bots) {
      b.vx = 0;
      b.vy = 0;
    }
    return;
  }

  const dtSec = Math.min(dt / 1000, 0.032);
  const turnRate = freezeWander ? 0 : 0.08;
  const maxSpeed = 90; // clamp speed to ~90px/s

  for (let i = 0; i < bots.length; i++) {
    const b = bots[i];

    // Manage wander target timer
    let timer = (botTimers.get(b.id) || 0) - dt;
    if (timer <= 0 || !b.target) {
      pickWanderTarget(b, width, height, inputBarRect);
      const rng = getRNG(b.id);
      timer = randomRange(rng, 2000, 5000); // re-pick every 2-5s
      botTimers.set(b.id, timer);
    } else {
      botTimers.set(b.id, timer);
    }

    let desiredVx = 0;
    let desiredVy = 0;

    // 1. Wander target force
    if (!freezeWander && b.target) {
      const dx = b.target.x - b.x;
      const dy = b.target.y - b.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 5) {
        const speed = 55;
        desiredVx += (dx / dist) * speed;
        desiredVy += (dy / dist) * speed;
      }
    }

    // 2. Separation force (repel bots within 70px)
    const sepRadius = 70;
    for (let j = 0; j < bots.length; j++) {
      if (i === j) continue;
      const other = bots[j];
      const dx = b.x - other.x;
      const dy = b.y - other.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0 && dist < sepRadius) {
        const strength = (1 - dist / sepRadius) * 120;
        desiredVx += (dx / dist) * strength;
        desiredVy += (dy / dist) * strength;
      }
    }

    // 3. Avoid input bar rect with 40px margin
    if (inputBarRect) {
      const margin = 40;
      const expLeft = inputBarRect.left - margin;
      const expRight = inputBarRect.right + margin;
      const expTop = inputBarRect.top - margin;
      const expBottom = inputBarRect.bottom + margin;

      if (b.x >= expLeft && b.x <= expRight && b.y >= expTop && b.y <= expBottom) {
        // Inside danger zone: strongly push upward and away
        const distFromTop = Math.abs(b.y - expTop);
        const repelY = -Math.max(80, 160 - distFromTop * 2);
        desiredVy += repelY;

        // Sideways nudge
        const centerX = (expLeft + expRight) / 2;
        if (b.x < centerX) {
          desiredVx -= 60;
        } else {
          desiredVx += 60;
        }
      }
    }

    // 4. Viewport boundaries repulsion
    const edgeMargin = b.r + 20;
    if (b.x < edgeMargin) desiredVx += (edgeMargin - b.x) * 4;
    if (b.x > width - edgeMargin) desiredVx -= (b.x - (width - edgeMargin)) * 4;
    if (b.y < edgeMargin + 20) desiredVy += (edgeMargin + 20 - b.y) * 4;
    if (b.y > height - edgeMargin) desiredVy -= (b.y - (height - edgeMargin)) * 4;

    // 5. Cursor curiosity (weak pull toward mouse, mood-scaled)
    if (!freezeWander && (cursor.x !== 0 || cursor.y !== 0)) {
      const dx = cursor.x - b.x;
      const dy = cursor.y - b.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 30 && dist < 300) {
        const pull = 15 * (1 + 0.3 * b.mood);
        desiredVx += (dx / dist) * pull;
        desiredVy += (dy / dist) * pull;
      }
    }

    // 6. Sulk repel: if mood < -0.4, extra repel from lastWinner
    if (b.mood < -0.4 && lastWinnerPos) {
      const dx = b.x - lastWinnerPos.x;
      const dy = b.y - lastWinnerPos.y;
      const dist = Math.hypot(dx, dy);
      const sulkRadius = 160;
      if (dist > 0 && dist < sulkRadius) {
        const sulkStrength = (1 - dist / sulkRadius) * 110;
        desiredVx += (dx / dist) * sulkStrength;
        desiredVy += (dy / dist) * sulkStrength;
      }
    }

    // Velocity update: v += (desired - v) * turnRate
    b.vx += (desiredVx - b.vx) * turnRate;
    b.vy += (desiredVy - b.vy) * turnRate;

    // Friction: v *= 0.92
    b.vx *= 0.92;
    b.vy *= 0.92;

    // Clamp speed to ~90px/s
    const currentSpeed = Math.hypot(b.vx, b.vy);
    if (currentSpeed > maxSpeed) {
      b.vx = (b.vx / currentSpeed) * maxSpeed;
      b.vy = (b.vy / currentSpeed) * maxSpeed;
    }

    // Pos += v * dt
    b.x += b.vx * dtSec;
    b.y += b.vy * dtSec;

    // Hard clamp to viewport bounds
    b.x = Math.max(b.r, Math.min(width - b.r, b.x));
    b.y = Math.max(b.r, Math.min(height - b.r, b.y));
  }
}
