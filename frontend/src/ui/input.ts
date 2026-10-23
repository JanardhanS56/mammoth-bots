export interface InputBarCallbacks {
  onSubmit: (question: string) => void;
  canSubmit: () => boolean;
}

export interface InputBarController {
  shake: () => void;
  setDisabled: (disabled: boolean) => void;
  clear: () => void;
  setValue: (val: string) => void;
  showHint: (msg: string, durationMs?: number) => void;
  clearHint: () => void;
}

export function setupInputBar(
  container: HTMLElement,
  input: HTMLInputElement,
  counter: HTMLElement,
  hint: HTMLElement,
  form: HTMLFormElement,
  callbacks: InputBarCallbacks
): InputBarController {
  let hintTimeout = 0;

  function showHint(msg: string, durationMs = 2500): void {
    hint.textContent = msg;
    if (hintTimeout) {
      window.clearTimeout(hintTimeout);
    }
    if (durationMs > 0) {
      hintTimeout = window.setTimeout(() => {
        hint.textContent = "";
        hintTimeout = 0;
      }, durationMs);
    }
  }

  function clearHint(): void {
    hint.textContent = "";
    if (hintTimeout) {
      window.clearTimeout(hintTimeout);
      hintTimeout = 0;
    }
  }

  function shake(): void {
    container.classList.remove("shake");
    // Force reflow
    void container.offsetWidth;
    container.classList.add("shake");
    window.setTimeout(() => {
      container.classList.remove("shake");
    }, 300);
  }

  function updateCounter(): void {
    const len = input.value.length;
    counter.textContent = String(len);
    if (len >= 91) {
      counter.classList.add("warning");
    } else {
      counter.classList.remove("warning");
    }
  }

  function handleInput(): void {
    if (input.value.length > 100) {
      input.value = input.value.slice(0, 100);
      showHint("that's a lot of words");
    }
    updateCounter();
  }

  function handlePaste(e: ClipboardEvent): void {
    const pasted = e.clipboardData?.getData("text") || "";
    const current = input.value;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const prospective = current.slice(0, start) + pasted + current.slice(end);

    if (prospective.length > 100) {
      e.preventDefault();
      const allowed = prospective.slice(0, 100);
      input.value = allowed;
      updateCounter();
      showHint("that's a lot of words");
    }
  }

  function handleSubmit(e: Event): void {
    e.preventDefault();

    if (!callbacks.canSubmit()) {
      return;
    }

    const trimmed = input.value.trim();
    if (!trimmed) {
      shake();
      return;
    }

    clearHint();
    callbacks.onSubmit(trimmed);
  }

  input.addEventListener("input", handleInput);
  input.addEventListener("paste", handlePaste);
  form.addEventListener("submit", handleSubmit);

  const submitBtn = form.querySelector(".submit-btn") as HTMLElement | null;
  submitBtn?.addEventListener("click", (e) => {
    handleSubmit(e);
  });

  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      handleSubmit(e);
    }
  });

  updateCounter();

  return {
    shake,
    setDisabled: (disabled: boolean) => {
      input.disabled = disabled;
    },
    clear: () => {
      input.value = "";
      updateCounter();
      clearHint();
    },
    setValue: (val: string) => {
      input.value = val.slice(0, 100);
      updateCounter();
    },
    showHint,
    clearHint,
  };
}
