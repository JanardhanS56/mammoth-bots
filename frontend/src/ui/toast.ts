export function showToast(message: string, durationMs = 2500): void {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);

  // Force reflow for CSS transition
  void toast.offsetWidth;
  toast.classList.add("show");

  window.setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.add("hide");
    window.setTimeout(() => {
      toast.remove();
    }, 300);
  }, durationMs);
}
