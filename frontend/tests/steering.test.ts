import { describe, it, expect } from "vitest";
import { createBot } from "../src/bots/Bot";
import { updateSteering, pickWanderTarget, Rect } from "../src/bots/steering";

describe("bots/steering", () => {
  it("pickWanderTarget sets target inside allowed boundaries", () => {
    const bot = createBot(0, 100, 100);
    const inputRect: Rect = { left: 200, top: 500, right: 800, bottom: 580 };
    pickWanderTarget(bot, 1000, 600, inputRect);
    expect(bot.target.x).toBeGreaterThan(0);
    expect(bot.target.x).toBeLessThan(1000);
    // Should stay above input bar rect (top 500 - 40 - margin)
    expect(bot.target.y).toBeLessThan(500);
  });

  it("applies separation force when two bots are close (<70px)", () => {
    const botA = createBot(0, 200, 200);
    const botB = createBot(1, 220, 200); // 20px apart horizontally

    updateSteering([botA, botB], {
      dt: 16,
      width: 1000,
      height: 800,
      inputBarRect: null,
      cursor: { x: 0, y: 0 },
      lastWinnerPos: null,
    });

    // Bot A should be pushed left, Bot B pushed right
    expect(botA.vx).toBeLessThan(0);
    expect(botB.vx).toBeGreaterThan(0);
  });

  it("avoids input bar rect with 40px margin", () => {
    // Place bot inside the input bar zone
    const bot = createBot(0, 500, 520);
    const inputRect: Rect = { left: 400, top: 500, right: 600, bottom: 560 };

    updateSteering([bot], {
      dt: 16,
      width: 1000,
      height: 600,
      inputBarRect: inputRect,
      cursor: { x: 0, y: 0 },
      lastWinnerPos: null,
    });

    // Should repel upward (negative vy)
    expect(bot.vy).toBeLessThan(0);
  });

  it("zeroes velocity under reducedMotion", () => {
    const bot = createBot(0, 200, 200);
    bot.vx = 50;
    bot.vy = 50;

    updateSteering([bot], {
      dt: 16,
      width: 1000,
      height: 800,
      inputBarRect: null,
      cursor: { x: 0, y: 0 },
      lastWinnerPos: null,
      reducedMotion: true,
    });

    expect(bot.vx).toBe(0);
    expect(bot.vy).toBe(0);
  });
});
