import { describe, it, expect, beforeEach } from "vitest";
import {
  recordRoundResult,
  decayStreaks,
  resetBotStats,
  computeMood,
  DEFAULT_BOT_STATS,
  MOOD_STORAGE_KEY,
} from "../src/bots/moods";

describe("bots/moods", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("computes mood clamped between -1 and 1", () => {
    expect(computeMood(0)).toBe(0);
    expect(computeMood(3)).toBe(1);
    expect(computeMood(6)).toBe(1);
    expect(computeMood(-3)).toBe(-1);
    expect(computeMood(-6)).toBe(-1);
  });

  it("updates streaks and win/loss records correctly", () => {
    let stats = { ...DEFAULT_BOT_STATS };
    // Round 1: 'yes' wins
    stats = recordRoundResult(stats, "yes");
    expect(stats.yes.streak).toBe(1);
    expect(stats.yes.wins).toBe(1);
    expect(stats.no.streak).toBe(-1);
    expect(stats.jester.streak).toBe(-1);
    expect(stats.prophet.streak).toBe(-1);

    // Round 2: 'yes' wins again
    stats = recordRoundResult(stats, "yes");
    expect(stats.yes.streak).toBe(2);
    expect(stats.no.streak).toBe(-2);

    // Round 3: 'yes' wins again -> losers reach streak -3 (mood -1.0)
    stats = recordRoundResult(stats, "yes");
    expect(stats.yes.streak).toBe(3);
    expect(stats.no.streak).toBe(-3);
    expect(computeMood(stats.no.streak)).toBe(-1);
  });

  it("clamps streaks to [-6, 6]", () => {
    let stats = { ...DEFAULT_BOT_STATS };
    for (let i = 0; i < 10; i++) {
      stats = recordRoundResult(stats, "jester");
    }
    expect(stats.jester.streak).toBe(6);
    expect(stats.no.streak).toBe(-6);
  });

  it("decays streaks towards 0", () => {
    const stats = {
      no: { streak: -3, wins: 0, plays: 3 },
      yes: { streak: 4, wins: 2, plays: 2 },
      jester: { streak: 1, wins: 1, plays: 1 },
      prophet: { streak: -1, wins: 0, plays: 1 },
    };

    const decayed = decayStreaks(stats);
    expect(decayed.no.streak).toBe(-1); // ceil(-3 / 2) = -1
    expect(decayed.yes.streak).toBe(2); // floor(4 / 2) = 2
    expect(decayed.jester.streak).toBe(0); // floor(1 / 2) = 0
    expect(decayed.prophet.streak).toBe(0); // ceil(-1 / 2) = 0
  });

  it("resetBotStats wipes storage and resets baseline", () => {
    localStorage.setItem(MOOD_STORAGE_KEY, JSON.stringify({ no: { streak: 5, wins: 5, plays: 5 } }));
    const reset = resetBotStats();
    expect(reset.no.streak).toBe(0);
    expect(localStorage.getItem(MOOD_STORAGE_KEY)).toBeNull();
  });
});
