import { inMark } from '../lib/mark';

// A full-bleed dot grid with the Kraddle mark formed inside it.
// Dots swell under the cursor, warm to orange where you linger, and ripple on click.

type Options = {
  spacing?: number;
  /** Where the mark sits: 'right' of the canvas, or 'center'. */
  place?: 'right' | 'center';
  /** Mark height as a share of the canvas height. */
  markScale?: number;
};

const BOX = { x: 112, y: 96, w: 396, h: 430 }; // the mark's frame, with a little air

export function dotField(canvas: HTMLCanvasElement, opts: Options = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const spacing = opts.spacing ?? 22;
  const place = opts.place ?? 'right';
  const markScale = opts.markScale ?? 0.8;

  type Dot = { x: number; y: number; on: boolean; r: number; heat: number; born: number };
  let dots: Dot[] = [];
  let W = 0, H = 0, dpr = 1;
  let fg = '#121212', faint = '#6B6B66', orange = '#FF5A1F';

  const readColors = () => {
    const cs = getComputedStyle(canvas);
    fg = cs.color || fg;
    faint = cs.getPropertyValue('--field-faint').trim() || fg;
    orange = cs.getPropertyValue('--k-orange').trim() || orange;
  };

  const layout = () => {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    readColors();

    // Fit the mark into a region of the canvas.
    const narrow = W < 900;
    const mh = Math.min(H * (narrow ? 0.42 : markScale), W * (narrow ? 0.62 : 0.5));
    const s = mh / BOX.h;
    const mw = BOX.w * s;
    const x0 = place === 'center' ? (W - mw) / 2 : narrow ? W - mw - 8 : W - mw - Math.max(24, W * 0.06);
    const y0 = place === 'center' ? (H - mh) / 2 : narrow ? 12 : (H - mh) / 2;

    const prev = new Map(dots.map((d) => [`${Math.round(d.x)}:${Math.round(d.y)}`, d]));
    dots = [];
    const cx = x0 + mw / 2, cy = y0 + mh / 2;
    for (let y = spacing / 2; y < H; y += spacing) {
      for (let x = spacing / 2; x < W; x += spacing) {
        const fx = BOX.x + (x - x0) / s, fy = BOX.y + (y - y0) / s;
        const on = fx > BOX.x && fx < BOX.x + BOX.w && fy > BOX.y && fy < BOX.y + BOX.h && inMark(fx, fy);
        const old = prev.get(`${Math.round(x)}:${Math.round(y)}`);
        dots.push({ x, y, on, r: old?.r ?? 0, heat: old?.heat ?? 0, born: Math.hypot(x - cx, y - cy) * 1.4 });
      }
    }
  };

  let pointer: { x: number; y: number } | null = null;
  const ripples: { x: number; y: number; t: number }[] = [];
  const toLocal = (e: PointerEvent | MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, inside: e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom };
  };
  const host = canvas.parentElement as HTMLElement;
  host.addEventListener('pointermove', (e) => { const p = toLocal(e); pointer = p.inside ? p : null; }, { passive: true });
  host.addEventListener('pointerleave', () => { pointer = null; });
  host.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('a, button, input, label, form')) return;
    const p = toLocal(e);
    if (p.inside) ripples.push({ x: p.x, y: p.y, t: performance.now() });
  });

  layout();
  new ResizeObserver(() => layout()).observe(canvas);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(readColors, 0));

  const LENS = 150;
  let visible = false, raf = 0;
  const t0 = performance.now();

  const frame = (now: number) => {
    const t = now - t0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (let i = ripples.length - 1; i >= 0; i--) if (now - ripples[i].t > 1600) ripples.splice(i, 1);

    for (const d of dots) {
      const born = reduce ? 1 : Math.min(1, Math.max(0, (t - d.born) / 500));
      let f = 0;
      if (pointer) {
        const dist = Math.hypot(d.x - pointer.x, d.y - pointer.y);
        if (dist < LENS) f = 1 - dist / LENS;
      }
      let wave = 0;
      for (const rp of ripples) {
        const age = (now - rp.t) / 1000;
        const ring = Math.abs(Math.hypot(d.x - rp.x, d.y - rp.y) - age * 520);
        if (ring < 40) wave = Math.max(wave, (1 - ring / 40) * (1 - age / 1.6));
      }
      const breathe = reduce ? 0 : Math.sin(t / 1100 + (d.x + d.y) / 90) * 0.08;
      const target = d.on
        ? (5.2 * (1 + breathe) + 3 * f + 2.5 * wave)
        : (1.1 + 2.6 * f * f + 2.2 * wave);
      d.r += (target * born - d.r) * 0.2;
      d.heat = d.on && f > 0.45 ? Math.min(1, d.heat + 0.03) : d.heat * 0.985;

      if (d.r <= 0.05) continue;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      if (d.on) { ctx.globalAlpha = 1; ctx.fillStyle = d.heat > 0.3 ? orange : fg; }
      else { ctx.globalAlpha = 0.22 + f * 0.55 + wave * 0.5; ctx.fillStyle = wave > 0.2 ? orange : faint; }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (visible) raf = requestAnimationFrame(frame);
  };

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    cancelAnimationFrame(raf);
    if (visible) raf = requestAnimationFrame(frame);
  }).observe(canvas);
}
