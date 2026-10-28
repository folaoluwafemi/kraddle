// Matches the page's original cubic-bezier(.2, .7, .2, 1) for scroll fallbacks.
const samples = Array.from({ length: 1001 }, (_, i) => {
  const x = i / 1000;
  let low = 0, high = 1;
  for (let k = 0; k < 16; k++) {
    const t = (low + high) / 2;
    const bx = 3 * (1 - t) ** 2 * t * .2 + 3 * (1 - t) * t ** 2 * .2 + t ** 3;
    if (bx < x) low = t; else high = t;
  }
  const t = (low + high) / 2;
  return 3 * (1 - t) ** 2 * t * .7 + 3 * (1 - t) * t ** 2 + t ** 3;
});
export const ease = (t: number) => t <= 0 ? 0 : t >= 1 ? 1 : samples[Math.round(t * 1000)];

export function scrollToSmooth(top: number) {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  top = Math.max(0, Math.min(max, top));
  window.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
