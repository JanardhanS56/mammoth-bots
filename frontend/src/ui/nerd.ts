export const NERD_STORAGE_KEY = "mammoth-nerd-v1";

export interface NerdState {
  isToggled: boolean;
  isPeeking: boolean;
  isActive: boolean;
}

export interface NerdController {
  getState: () => NerdState;
  updatePanel: (content: {
    state?: string;
    chosenSlot?: string;
    marginPercent?: number;
    isCoinFlip?: boolean;
    timings?: { groq: number; mammoth: number };
  } | null) => void;
  destroy: () => void;
}

export function setupNerdMode(
  toggleBtn: HTMLButtonElement | null,
  panelEl: HTMLElement | null,
  onChange?: (active: boolean) => void
): NerdController {
  let isToggled = false;
  let isPeeking = false;

  try {
    isToggled = localStorage.getItem(NERD_STORAGE_KEY) === "1";
  } catch {
    isToggled = false;
  }

  function syncUI(): void {
    const active = isToggled || isPeeking;
    if (toggleBtn) {
      toggleBtn.setAttribute("aria-pressed", isToggled ? "true" : "false");
    }
    if (panelEl) {
      if (active) {
        panelEl.classList.add("active");
        panelEl.setAttribute("aria-hidden", "false");
      } else {
        panelEl.classList.remove("active");
        panelEl.setAttribute("aria-hidden", "true");
      }
    }
    onChange?.(active);
  }

  function handleToggle(): void {
    isToggled = !isToggled;
    try {
      localStorage.setItem(NERD_STORAGE_KEY, isToggled ? "1" : "0");
    } catch {
      // ignore quota / private mode
    }
    syncUI();
  }

  function handleKeyDown(e: KeyboardEvent): void {
    const tag = (document.activeElement?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;

    if (e.key === "h" || e.key === "H" || e.key === "?") {
      if (!isPeeking) {
        isPeeking = true;
        syncUI();
      }
    }
  }

  function handleKeyUp(e: KeyboardEvent): void {
    if (e.key === "h" || e.key === "H" || e.key === "?") {
      if (isPeeking) {
        isPeeking = false;
        syncUI();
      }
    }
  }

  toggleBtn?.addEventListener("click", handleToggle);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  syncUI();

  return {
    getState: () => ({
      isToggled,
      isPeeking,
      isActive: isToggled || isPeeking,
    }),
    updatePanel: (content) => {
      if (!panelEl) return;
      if (!content) {
        panelEl.innerHTML = `<div class="title">NERD PANEL</div><div>Awaiting verdict...</div>`;
        return;
      }

      const marginStr = content.marginPercent !== undefined ? `${Math.round(content.marginPercent * 100)}%` : "--";
      let html = `<div class="title">NERD METRICS</div>`;
      if (content.state) {
        html += `<div><strong>State:</strong> ${escapeHtml(content.state)}</div>`;
      }
      if (content.chosenSlot) {
        html += `<div><strong>Chosen:</strong> ${escapeHtml(content.chosenSlot)}</div>`;
      }
      html += `<div><strong>Margin:</strong> ${marginStr}</div>`;
      if (content.isCoinFlip) {
        html += `<div class="coin-flip-warn">⚠ coin flip</div>`;
      }
      if (content.timings) {
        html += `<div style="opacity:0.6; margin-top:4px;">Groq: ${content.timings.groq}ms · Mammoth: ${content.timings.mammoth}ms</div>`;
      }
      panelEl.innerHTML = html;
    },
    destroy: () => {
      toggleBtn?.removeEventListener("click", handleToggle);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    },
  };
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (m) => {
    switch (m) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#039;";
      default:
        return m;
    }
  });
}
