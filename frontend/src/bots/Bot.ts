export type BotSlot = "no" | "yes" | "jester" | "prophet";
export type BotShape = "circle" | "triangle" | "diamond" | "squircle";

export interface Bot {
  id: 0 | 1 | 2 | 3;
  slot: BotSlot;
  color: string;
  shape: BotShape;
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

  // Visual interactivity state
  blinkTimer?: number;
  isBlinking?: boolean;
  hopOffset?: number;
  clickAnim?: number;
}

export const BOT_CONFIGS: Array<{
  id: 0 | 1 | 2 | 3;
  slot: BotSlot;
  color: string;
  shape: BotShape;
}> = [
  { id: 0, slot: "no", color: "#2563EB", shape: "circle" },
  { id: 1, slot: "yes", color: "#16A34A", shape: "triangle" },
  { id: 2, slot: "jester", color: "#DC2626", shape: "diamond" },
  { id: 3, slot: "prophet", color: "#EAB308", shape: "squircle" },
];

export function createBot(id: 0 | 1 | 2 | 3, x: number, y: number): Bot {
  const config = BOT_CONFIGS[id];
  return {
    id,
    slot: config.slot,
    color: config.color,
    shape: config.shape,
    r: 24,
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
