export type BotSlot = "no" | "yes" | "jester" | "prophet";

export interface Bot {
  id: 0 | 1 | 2 | 3;
  slot: BotSlot;
  color: string;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  target: { x: number; y: number };
  seed: number;

  label: string;
  description: string;
  p: number | null;
  targetP: number;
  pDisplay: number;
  chosen: boolean;

  revealScale: number;
  targetScale: number;

  streak: number;
  mood: number;
}

export const BOT_CONFIGS: Array<{ id: 0 | 1 | 2 | 3; slot: BotSlot; color: string }> = [
  { id: 0, slot: "no", color: "#FF5D5D" },
  { id: 1, slot: "yes", color: "#4ADE80" },
  { id: 2, slot: "jester", color: "#FBBF24" },
  { id: 3, slot: "prophet", color: "#A78BFA" },
];

export function createBot(id: 0 | 1 | 2 | 3, x: number, y: number): Bot {
  const config = BOT_CONFIGS[id];
  return {
    id,
    slot: config.slot,
    color: config.color,
    r: 22,
    x,
    y,
    vx: 0,
    vy: 0,
    target: { x, y },
    seed: id * 1.57, // phase offset so bobs are staggered

    label: "",
    description: "",
    p: null,
    targetP: 0.25,
    pDisplay: 0.25,
    chosen: false,

    revealScale: 1,
    targetScale: 1,

    streak: 0,
    mood: 0,
  };
}

export function createAllBots(width: number, height: number): Bot[] {
  // Distribute 4 bots across the upper/middle viewport
  const spacing = width / 5;
  const centerY = height * 0.4;
  return BOT_CONFIGS.map((c, i) => createBot(c.id, spacing * (i + 1), centerY));
}
