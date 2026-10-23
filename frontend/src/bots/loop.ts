export interface LoopCallbacks {
  onUpdate: (dt: number, now: number) => void;
  onRender: (now: number) => void;
  onResize: (width: number, height: number, dpr: number) => void;
}

export interface RenderLoop {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
  getDimensions: () => { width: number; height: number; dpr: number };
}

export function createRenderLoop(canvas: HTMLCanvasElement, callbacks: LoopCallbacks): RenderLoop {
  const ctx = canvas.getContext("2d")!;
  let rafId = 0;
  let lastTime = 0;
  let width = window.innerWidth;
  let height = window.innerHeight;
  let dpr = 1;

  function updateSize(): void {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    callbacks.onResize(width, height, dpr);
  }

  function frame(now: number): void {
    // Clamp dt to 32ms to survive tab-switch spikes
    const dt = Math.min(32, now - lastTime);
    lastTime = now;

    callbacks.onUpdate(dt, now);
    callbacks.onRender(now);

    rafId = requestAnimationFrame(frame);
  }

  function start(): void {
    if (!rafId) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  }

  function stop(): void {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  window.addEventListener("resize", () => {
    updateSize();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  });

  updateSize();

  return {
    start,
    stop,
    isRunning: () => rafId !== 0,
    getDimensions: () => ({ width, height, dpr }),
  };
}
