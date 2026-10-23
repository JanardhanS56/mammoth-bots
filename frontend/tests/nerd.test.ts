import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupNerdMode, NERD_STORAGE_KEY } from "../src/ui/nerd";
import { createBot } from "../src/bots/Bot";
import { drawNerdTag } from "../src/bots/render";

describe("ui/nerd", () => {
  let button: HTMLButtonElement;
  let panel: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    button = document.createElement("button");
    panel = document.createElement("div");
  });

  it("toggles state and writes to localStorage", () => {
    const nerd = setupNerdMode(button, panel);
    expect(nerd.getState().isToggled).toBe(false);
    expect(button.getAttribute("aria-pressed")).toBe("false");

    button.click();
    expect(nerd.getState().isToggled).toBe(true);
    expect(localStorage.getItem(NERD_STORAGE_KEY)).toBe("1");
    expect(button.getAttribute("aria-pressed")).toBe("true");

    button.click();
    expect(nerd.getState().isToggled).toBe(false);
    expect(localStorage.getItem(NERD_STORAGE_KEY)).toBe("0");
    nerd.destroy();
  });

  it("handles H key peek on keydown and release on keyup", () => {
    const nerd = setupNerdMode(button, panel);
    expect(nerd.getState().isActive).toBe(false);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "h" }));
    expect(nerd.getState().isPeeking).toBe(true);
    expect(nerd.getState().isActive).toBe(true);

    window.dispatchEvent(new KeyboardEvent("keyup", { key: "h" }));
    expect(nerd.getState().isPeeking).toBe(false);
    expect(nerd.getState().isActive).toBe(false);
    nerd.destroy();
  });

  it("drawNerdTag clamps tagY to >= 40", () => {
    const bot = createBot(0, 200, 30); // Very close to viewport top
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      fillText: vi.fn(),
      roundRect: vi.fn(),
      beginPath: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawNerdTag(ctx, bot, 800);

    // Verify roundRect was called with y >= 40
    const callArgs = (ctx.roundRect as any).mock.calls[0];
    const rectY = callArgs[1];
    expect(rectY).toBeGreaterThanOrEqual(40);
  });
});
