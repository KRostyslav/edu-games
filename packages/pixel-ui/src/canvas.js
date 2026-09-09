/**
 * Піксельна канва з цілочисельним масштабуванням.
 *
 * Логічний розмір фіксований (напр. 320×180), а на екрані канва розтягується
 * ЛИШЕ на цілий множник — тому жоден піксель не розмивається і не «пливе».
 * Дробовий масштаб дав би нерівні пікселі, і вся піксельна естетика зникла б.
 */
export function createPixelCanvas({ width, height, parent, maxScale = 6 }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.className = "pixel-canvas";

  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = false;

  if (parent) parent.appendChild(canvas);

  function fit() {
    const box = (parent ?? canvas.parentElement)?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    // Масштаб рахується від ширини. Висотою не обмежуємо: контейнер зазвичай
    // тягнеться під вміст, і врахування його висоти давало б масштаб ×1
    // навіть там, де по ширині вільно вміщається ×3.
    const scale = Math.max(1, Math.min(maxScale, Math.floor(box.width / width)));
    canvas.style.width = `${width * scale}px`;
    canvas.style.height = `${height * scale}px`;
  }

  fit();
  const observer = new ResizeObserver(fit);
  if (parent) observer.observe(parent);

  return {
    canvas,
    ctx,
    width,
    height,
    fit,
    destroy: () => observer.disconnect(),
  };
}
