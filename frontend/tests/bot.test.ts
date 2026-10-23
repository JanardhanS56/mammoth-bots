import { describe, it, expect } from "vitest";
import { createBot, createAllBots, BOT_CONFIGS } from "../src/bots/Bot";

describe("bots/Bot", () => {
  it("creates a bot with correct default properties and slot mapping", () => {
    const bot = createBot(0, 100, 200);
    expect(bot.id).toBe(0);
    expect(bot.slot).toBe("no");
    expect(bot.color).toBe("#FF5D5D");
    expect(bot.x).toBe(100);
    expect(bot.y).toBe(200);
    expect(bot.r).toBe(22);
    expect(bot.streak).toBe(0);
    expect(bot.mood).toBe(0);
    expect(bot.revealScale).toBe(1);
  });

  it("creates 4 bots matching BOT_CONFIGS in exact slot order", () => {
    const bots = createAllBots(1000, 800);
    expect(bots).toHaveLength(4);
    expect(bots[0].slot).toBe("no");
    expect(bots[1].slot).toBe("yes");
    expect(bots[2].slot).toBe("jester");
    expect(bots[3].slot).toBe("prophet");

    for (let i = 0; i < 4; i++) {
      expect(bots[i].id).toBe(BOT_CONFIGS[i].id);
      expect(bots[i].color).toBe(BOT_CONFIGS[i].color);
      expect(bots[i].x).toBeGreaterThan(0);
      expect(bots[i].y).toBeGreaterThan(0);
    }
  });
});
