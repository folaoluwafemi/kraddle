import { markDots } from '../lib/mark';

// The problem section: one dot-mark shown four ways as you scroll.
// 0 too little · 1 too much · 2 out of date · 3 exactly enough

export function morph(section: HTMLElement) {
  const canvas = section.querySelector<HTMLCanvasElement>('[data-morph]');
  const ctx = canvas?.getContext('2d');
  if (!canvas || !ctx) return;

  const BOX = { x: 112, y: 96, w: 396, h: 430 };
  const rand = (i: number) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
  type S = { x: number; y: number; r: number; a: number; hot: boolean; jitter: number };
  const base = markDots(18, BOX);
  const dots = base.map((d, i) => {
    const on = d.on;
    const targets: S[] = [
      // too little: only some of the shape is there
      { x: d.x, y: d.y, r: on && rand(i) > 0.64 ? 6.4 : 1.2, a: on && rand(i) > 0.64 ? 1 : 0.2, hot: false, jitter: 0 },
      // too much: everything at once, the shape is lost in noise
      { x: d.x + (rand(i + 1) - 0.5) * 10, y: d.y + (rand(i + 2) - 0.5) * 10, r: on || rand(i + 3) > 0.35 ? 3 + rand(i + 4) * 4.4 : 1.2, a: on ? 0.95 : 0.35 + rand(i + 5) * 0.5, hot: false, jitter: 1 },
      // out of date: the right shape, in the wrong place, faded
      { x: d.x + 26, y: d.y + 18, r: on ? 6.4 : 1.2, a: on ? 0.35 : 0.14, hot: false, jitter: 0 },
      // exactly enough: the mark, crisp, one part lit
      { x: d.x, y: d.y, r: on ? 6.4 : 1.2, a: on ? 1 : 0.2, hot: on && d.x > 445, jitter: 0 },
    ];
    return { targets, cur: { ...targets[0] }, i };
  });

  let state = 0;
  let W = 0, dpr = 1, scale = 1, ox = 0, oy = 0;
  let fg = '#EEEEEA', faint = '#8E8E88', orange = '#FF5A1F';
  const readColors = () => {
    const cs = getComputedStyle(canvas);
    fg = cs.color; faint = cs.getPropertyValue('--field-faint').trim() || faint;
    orange = cs.getPropertyValue('--field-hot').trim() || cs.getPropertyValue('--k-orange').trim() || orange;
  };
  const layout = () => {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    scale = Math.min(rect.width / BOX.w, rect.height / BOX.h) * 0.92;
    ox = (rect.width - BOX.w * scale) / 2; oy = (rect.height - BOX.h * scale) / 2;
    readColors();
  };
  layout();
  new ResizeObserver(layout).observe(canvas);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(layout, 0));

  const labels = [...section.querySelectorAll<HTMLElement>('.state[data-state]')];
  const ticks = [...section.querySelectorAll<HTMLElement>('[data-tick]')];
  const cards = [...section.querySelectorAll<HTMLElement>('[data-card]')];
  const setState = (n: number) => {
    if (n === state) return;
    state = n;
    section.dataset.state = String(n);
    labels.forEach((l, i) => { l.classList.toggle('on', i === n); l.classList.toggle('gone', i < n); });
    ticks.forEach((t, i) => { t.classList.toggle('on', i === n); if (i === n) t.setAttribute('aria-current', 'step'); else t.removeAttribute('aria-current'); });
    cards.forEach((c, i) => c.classList.toggle('on', i === n));
    readColors();
    setTimeout(readColors, 750); // after the background has finished changing
  };
  const scrollSpan = () => section.offsetHeight - window.innerHeight;
  const onScroll = () => {
    const rect = section.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, -rect.top / scrollSpan()));
    // each step's bar fills across its quarter of the scroll
    ticks.forEach((t, i) => t.style.setProperty('--p', String(Math.min(1, Math.max(0, p * 4 - i)))));
    setState(Math.min(3, Math.floor(p * 4.0001)));
  };
  ticks.forEach((t, i) => t.addEventListener('click', () => {
    const top = section.getBoundingClientRect().top + window.scrollY + scrollSpan() * ((i + 0.55) / 4);
    window.scrollTo({ top, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }));
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  let visible = false, raf = 0;
  const frame = (now: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, canvas.height / dpr);
    for (const d of dots) {
      const tg = d.targets[state];
      const c = d.cur;
      const k = 0.12;
      const jx = tg.jitter ? Math.sin(now / 90 + d.i) * 1.6 : 0;
      const jy = tg.jitter ? Math.cos(now / 110 + d.i * 1.3) * 1.6 : 0;
      c.x += (tg.x + jx - c.x) * k; c.y += (tg.y + jy - c.y) * k;
      c.r += (tg.r - c.r) * k; c.a += (tg.a - c.a) * k;
      ctx.globalAlpha = Math.max(0, Math.min(1, c.a));
      ctx.fillStyle = tg.hot ? orange : c.r > 2.2 ? fg : faint;
      ctx.beginPath();
      ctx.arc(ox + (c.x - BOX.x) * scale, oy + (c.y - BOX.y) * scale, Math.max(0, c.r) * scale, 0, Math.PI * 2);
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
