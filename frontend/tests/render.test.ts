import { describe, it, expect, vi } from "vitest";
import { createBot } from "../src/bots/Bot";
import { getBotSpeechCopy, drawCrown } from "../src/bots/render";

describe("bots/render speech copy and crowns", () => {
  it("determines speech copy correctly by streak and outcome", () => {
    const winner = createBot(1, 100, 100);
    winner.chosen = true;
    winner.label = "Fly away";

    expect(getBotSpeechCopy(winner)).toBe("Fly away");

    winner.streak = 2;
    expect(getBotSpeechCopy(winner)).toBe("ha.");

    const loser = createBot(0, 100, 100);
    loser.chosen = false;

    loser.streak = -1;
    expect(getBotSpeechCopy(loser)).toBe("…");

    loser.streak = -2;
    expect(getBotSpeechCopy(loser)).toBe("hmph.");

    loser.streak = -3;
    expect(getBotSpeechCopy(loser)).toBe("why do I even");

    loser.streak = -5;
    expect(getBotSpeechCopy(loser)).toBe("why do I even");
  });

  it("suppresses crown when coinFlip is true", () => {
    const winner = createBot(1, 100, 100);
    winner.chosen = true;

    const ctx = {
      save: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      restore: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    // coinFlip true -> no crown
    drawCrown(ctx, winner, 300, true);
    expect(ctx.save).not.toHaveBeenCalled();

    // coinFlip false -> crown drawn
    drawCrown(ctx, winner, 300, false);
    expect(ctx.save).toHaveBeenCalled();
  });
});
