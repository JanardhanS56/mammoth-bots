import { describe, it, expect, vi, beforeEach } from "vitest";
import { setupInputBar } from "../src/ui/input";

describe("ui/input", () => {
  let container: HTMLDivElement;
  let input: HTMLInputElement;
  let counter: HTMLSpanElement;
  let hint: HTMLDivElement;
  let form: HTMLFormElement;

  beforeEach(() => {
    container = document.createElement("div");
    form = document.createElement("form");
    input = document.createElement("input");
    counter = document.createElement("span");
    hint = document.createElement("div");

    form.appendChild(input);
    form.appendChild(counter);
    container.appendChild(form);
    container.appendChild(hint);
    document.body.appendChild(container);
  });

  it("updates counter on typing and adds warning at 91+ chars", () => {
    const onSubmit = vi.fn();
    setupInputBar(container, input, counter, hint, form, {
      onSubmit,
      canSubmit: () => true,
    });

    input.value = "hello";
    input.dispatchEvent(new Event("input"));
    expect(counter.textContent).toBe("5");
    expect(counter.classList.contains("warning")).toBe(false);

    input.value = "a".repeat(91);
    input.dispatchEvent(new Event("input"));
    expect(counter.textContent).toBe("91");
    expect(counter.classList.contains("warning")).toBe(true);
  });

  it("truncates input to 100 characters and shows hint when exceeded", () => {
    const onSubmit = vi.fn();
    setupInputBar(container, input, counter, hint, form, {
      onSubmit,
      canSubmit: () => true,
    });

    input.value = "a".repeat(150);
    input.dispatchEvent(new Event("input"));
    expect(input.value.length).toBe(100);
    expect(counter.textContent).toBe("100");
    expect(hint.textContent).toBe("that's a lot of words");
  });

  it("shakes container on empty submit and does not call onSubmit", () => {
    const onSubmit = vi.fn();
    setupInputBar(container, input, counter, hint, form, {
      onSubmit,
      canSubmit: () => true,
    });

    input.value = "   ";
    form.dispatchEvent(new Event("submit"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.classList.contains("shake")).toBe(true);
  });

  it("submits trimmed question when canSubmit is true", () => {
    const onSubmit = vi.fn();
    setupInputBar(container, input, counter, hint, form, {
      onSubmit,
      canSubmit: () => true,
    });

    input.value = "  Should I eat pizza?  ";
    form.dispatchEvent(new Event("submit"));
    expect(onSubmit).toHaveBeenCalledWith("Should I eat pizza?");
  });

  it("blocks submit when canSubmit is false", () => {
    const onSubmit = vi.fn();
    setupInputBar(container, input, counter, hint, form, {
      onSubmit,
      canSubmit: () => false,
    });

    input.value = "Should I run?";
    form.dispatchEvent(new Event("submit"));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
