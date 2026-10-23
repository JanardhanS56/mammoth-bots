import type { Bot, BotSlot } from "./Bot";

export const MOOD_STORAGE_KEY = "mammoth-bots-v1";

export interface BotStat {
  streak: number;
  wins: number;
  plays: number;
}

export type BotStatsRecord = Record<BotSlot, BotStat>;

export const DEFAULT_BOT_STATS: BotStatsRecord = {
  no: { streak: 0, wins: 0, plays: 0 },
  yes: { streak: 0, wins: 0, plays: 0 },
  jester: { streak: 0, wins: 0, plays: 0 },
  prophet: { streak: 0, wins: 0, plays: 0 },
};

export function computeMood(streak: number): number {
  return Math.max(-1, Math.min(1, streak / 3));
}

export function loadBotStats(): BotStatsRecord {
  try {
    const raw = localStorage.getItem(MOOD_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BOT_STATS };
    const parsed = JSON.parse(raw);
    return {
      no: parsed.no ?? { ...DEFAULT_BOT_STATS.no },
      yes: parsed.yes ?? { ...DEFAULT_BOT_STATS.yes },
      jester: parsed.jester ?? { ...DEFAULT_BOT_STATS.jester },
      prophet: parsed.prophet ?? { ...DEFAULT_BOT_STATS.prophet },
    };
  } catch {
    return { ...DEFAULT_BOT_STATS };
  }
}

export function saveBotStats(stats: BotStatsRecord): void {
  try {
    localStorage.setItem(MOOD_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Safari private mode or quota exceeded
  }
}

export function decayStreaks(stats: BotStatsRecord): BotStatsRecord {
  const updated = { ...stats };
  const slots: BotSlot[] = ["no", "yes", "jester", "prophet"];

  for (const slot of slots) {
    const s = updated[slot].streak;
    const raw = s > 0 ? Math.floor(s / 2) : Math.ceil(s / 2);
    const decayedStreak = raw === 0 ? 0 : raw;
    updated[slot] = {
      ...updated[slot],
      streak: decayedStreak,
    };
  }

  saveBotStats(updated);
  return updated;
}

export function recordRoundResult(stats: BotStatsRecord, winnerSlot: BotSlot): BotStatsRecord {
  const updated = { ...stats };
  const slots: BotSlot[] = ["no", "yes", "jester", "prophet"];

  for (const slot of slots) {
    const curr = updated[slot];
    const isWinner = slot === winnerSlot;

    let newStreak: number;
    if (isWinner) {
      newStreak = Math.max(1, curr.streak + 1);
    } else {
      newStreak = Math.min(-1, curr.streak - 1);
    }

    // Clamp to [-6, 6]
    newStreak = Math.max(-6, Math.min(6, newStreak));

    updated[slot] = {
      plays: curr.plays + 1,
      wins: isWinner ? curr.wins + 1 : curr.wins,
      streak: newStreak,
    };
  }

  saveBotStats(updated);
  return updated;
}

export function resetBotStats(): BotStatsRecord {
  try {
    localStorage.removeItem(MOOD_STORAGE_KEY);
  } catch {
    // ignore
  }
  return {
    no: { streak: 0, wins: 0, plays: 0 },
    yes: { streak: 0, wins: 0, plays: 0 },
    jester: { streak: 0, wins: 0, plays: 0 },
    prophet: { streak: 0, wins: 0, plays: 0 },
  };
}

export function applyStatsToBots(bots: Bot[], stats: BotStatsRecord): void {
  for (const b of bots) {
    const stat = stats[b.slot];
    if (stat) {
      b.streak = stat.streak;
      b.mood = computeMood(stat.streak);
    }
  }
}
