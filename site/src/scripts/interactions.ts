import { dotField } from './dotfield';
import { morph } from './morph';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/* ---------- reveal on scroll (and decode mono labels as they arrive) ---------- */
const GLYPHS = '▖▗▘▙▚▛▜▝▞▟░▒01';
function scramble(el: HTMLElement) {
  if (reduce || el.dataset.done) return;
  el.dataset.done = '1';
  const final = el.textContent || '';
  let frame = 0;
  const total = 18;
  const tick = () => {
    frame++;
    const keep = Math.floor((frame / total) * final.length);
    el.textContent = final.split('').map((c, i) => (i < keep || c === ' ' ? c : GLYPHS[(i + frame) % GLYPHS.length])).join('');
    if (frame < total) requestAnimationFrame(tick); else el.textContent = final;
  };
  tick();
}
const revealer = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const el = e.target as HTMLElement;
    el.classList.add('in');
    if (el.hasAttribute('data-scramble')) scramble(el);
    revealer.unobserve(el);
  }
}, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('[data-reveal], [data-scramble]').forEach((el) => revealer.observe(el));

/* ---------- nav: hides on the way down, returns on the way up; progress line ---------- */
const nav = document.querySelector<HTMLElement>('[data-nav]');
const progress = document.querySelector<HTMLElement>('[data-progress]');
// Direction is decided over a run of scrolling, not per event, so smooth-scroll
// wheels (many tiny deltas) don't flip the nav back and forth.
let lastY = window.scrollY, run = 0;
function onScroll() {
  const y = window.scrollY;
  const dy = y - lastY;
  lastY = y;
  run = Math.sign(dy) === Math.sign(run) ? run + dy : dy;
  nav?.classList.toggle('scrolled', y > 8);
  if (y < 400 || run < -60) nav?.classList.remove('tucked');
  else if (run > 60) nav?.classList.add('tucked');
  const max = document.documentElement.scrollHeight - window.innerHeight;
  progress?.style.setProperty('--p', String(max > 0 ? Math.min(1, y / max) : 0));
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* ---------- magnetic buttons ---------- */
if (finePointer && !reduce) {
  document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width - 0.5) * 10}px`);
      el.style.setProperty('--my', `${((e.clientY - r.top) / r.height - 0.5) * 8}px`);
    });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--mx', '0px'); el.style.setProperty('--my', '0px'); });
  });
}

/* ---------- dot fields and the problem morph ---------- */
document.querySelectorAll<HTMLCanvasElement>('[data-dotfield]').forEach((c) => {
  dotField(c, { place: c.dataset.dotfield === 'center' ? 'center' : 'right', markScale: c.dataset.dotfield === 'center' ? 0.72 : 0.74 });
});
document.querySelectorAll<HTMLElement>('[data-morph-section]').forEach((s) => morph(s));

/* ---------- waitlist ---------- */
const ENDPOINT = import.meta.env.PUBLIC_WAITLIST_ENDPOINT as string | undefined;
document.querySelectorAll<HTMLFormElement>('[data-waitlist]').forEach((form) => {
  const input = form.querySelector('input') as HTMLInputElement;
  const status = form.querySelector('.status') as HTMLElement;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.classList.contains('busy') || form.classList.contains('done')) return;
    if (!input.checkValidity() || !input.value.trim()) {
      form.classList.remove('invalid'); void form.offsetWidth; form.classList.add('invalid');
      status.innerHTML = '<span class="stop">stop</span> · that email doesn’t look right. Check it and try again.';
      input.focus();
      return;
    }
    form.classList.remove('invalid');
    form.classList.add('busy');
    status.textContent = 'Adding you…';
    try {
      if (ENDPOINT) {
        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ email: input.value.trim() }),
        });
        if (!res.ok) throw new Error(String(res.status));
      } else {
        await new Promise((r) => setTimeout(r, 1100));
        console.info('[waitlist] PUBLIC_WAITLIST_ENDPOINT is not set; nothing was sent.');
      }
      form.classList.add('done');
      status.innerHTML = '<span class="held">held</span> · you’re on the list. We’ll email you once, when it’s ready.';
    } catch {
      status.innerHTML = '<span class="stop">stop</span> · that didn’t go through. Try again in a moment.';
    } finally {
      form.classList.remove('busy');
    }
  });
});

/* ---------- auto-advancing tab sets (map steps, showcase windows) ---------- */
function tabSet(root: HTMLElement, opts: { dur: number; onChange: (i: number) => void; tabs: HTMLElement[] }) {
  let i = 0, timer = 0, started = false, hover = false;
  root.style.setProperty('--dur', `${opts.dur}ms`);
  const go = (n: number, user = false) => {
    i = (n + opts.tabs.length) % opts.tabs.length;
    opts.tabs.forEach((t, k) => t.setAttribute('aria-selected', String(k === i)));
    // restart the progress bar animation
    const bar = opts.tabs[i].querySelector<HTMLElement>('.bar span');
    if (bar) { bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = ''; }
    opts.onChange(i);
    schedule(user ? opts.dur * 1.6 : opts.dur);
  };
  const schedule = (ms: number) => {
    clearTimeout(timer);
    if (reduce) return;
    timer = window.setTimeout(() => { if (!hover) go(i + 1); else schedule(800); }, ms);
  };
  opts.tabs.forEach((t, k) => t.addEventListener('click', () => go(k, true)));
  root.addEventListener('pointerenter', () => { hover = true; root.classList.add('paused'); });
  root.addEventListener('pointerleave', () => { hover = false; root.classList.remove('paused'); });
  root.addEventListener('keydown', (e) => {
    if (!(e.target as HTMLElement).matches('[role="tab"]')) return;
    if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).tagName !== 'BUTTON') {
      e.preventDefault();
      (e.target as HTMLElement).click();
      return;
    }
    if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      go(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1), true);
      opts.tabs[i].focus();
    }
  });
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !started) { started = true; go(0); }
    else if (!e.isIntersecting) clearTimeout(timer);
    else if (started) schedule(opts.dur);
  }, { threshold: 0.4 }).observe(root);
}

/* use cases: one expands at a time, with its recording or screenshot */
document.querySelectorAll<HTMLElement>('[data-cases]').forEach((root) => {
  const shots = [...root.querySelectorAll<HTMLElement>('[data-shot]')];
  tabSet(root, {
    dur: 8000,
    tabs: [...root.querySelectorAll<HTMLElement>('[data-go]')],
    onChange: (n) => shots.forEach((s, k) => s.classList.toggle('on', k === n)),
  });
});

/* showcase: the desktop app switches modes; each mode plays its own little sequence */
document.querySelectorAll<HTMLElement>('[data-show]').forEach((show) => {
  const panels = [...show.querySelectorAll<HTMLElement>('[data-panel]')];
  const ipanels = [...show.querySelectorAll<HTMLElement>('[data-ipanel]')];
  const caps = [...show.querySelectorAll<HTMLElement>('[data-cap]')];
  tabSet(show, {
    dur: 7500,
    tabs: [...show.querySelectorAll<HTMLElement>('[data-go]')],
    onChange: (n) => {
      panels.forEach((p, k) => {
        p.classList.toggle('on', k === n);
        p.classList.remove('play');
        if (k === n) { void p.offsetWidth; p.classList.add('play'); }
      });
      ipanels.forEach((p, k) => p.classList.toggle('on', k === n));
      caps.forEach((c, k) => c.classList.toggle('on', k === n));
    },
  });
  // gentle 3D tilt toward the cursor
  const tilt = show.querySelector<HTMLElement>('[data-tilt]');
  const win = tilt?.querySelector<HTMLElement>('.app');
  if (tilt && win && finePointer && !reduce) {
    tilt.addEventListener('pointermove', (e) => {
      const r = tilt.getBoundingClientRect();
      win.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 3}deg`);
      win.style.setProperty('--rx', `${-((e.clientY - r.top) / r.height - 0.5) * 2.5}deg`);
    });
    tilt.addEventListener('pointerleave', () => { win.style.setProperty('--ry', '0deg'); win.style.setProperty('--rx', '0deg'); });
  }
});

/* ideation: explore or park */
document.querySelectorAll<HTMLElement>('[data-ideation]').forEach((chat) => {
  chat.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const choice = btn.dataset.choice;
      chat.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      chat.querySelectorAll<HTMLElement>('[data-reply]').forEach((r) => { r.hidden = r.dataset.reply !== choice; });
    });
  });
});

/* taste: tap to link heuristic and change on touch screens */
document.querySelectorAll<HTMLElement>('[data-taste]').forEach((t) => {
  t.addEventListener('click', () => { if (!finePointer) t.classList.toggle('lit'); });
});

/* ---------- footer: the giant wordmark thins out around the cursor ---------- */
// Weights are eased every frame with fractional values (variable fonts accept
// any weight between 100 and 900), so the letters glide instead of stepping.
const giant = document.querySelector<HTMLElement>('[data-giant]');
if (giant && finePointer && !reduce) {
  const chars = [...giant.querySelectorAll<HTMLElement>('.ch')].map((el) => ({ el, f: 0, cx: 0, cy: 0, w: 1 }));
  let px = -1e4, py = -1e4, running = false, raf = 0;
  const measure = () => chars.forEach((c) => {
    const r = c.el.getBoundingClientRect();
    c.cx = r.left + r.width / 2; c.cy = r.top + r.height / 2; c.w = r.width;
  });
  const tick = () => {
    let moving = false;
    for (const c of chars) {
      const d = Math.hypot(px - c.cx, py - c.cy);
      const target = Math.max(0, 1 - d / (c.w * 2.6));
      const eased = target * target * (3 - 2 * target); // smoothstep
      c.f += (eased - c.f) * 0.14;
      if (Math.abs(eased - c.f) > 0.001) moving = true;
      c.el.style.setProperty('--f', c.f.toFixed(4));
    }
    raf = moving || running ? requestAnimationFrame(tick) : 0;
  };
  const start = () => { if (!raf) raf = requestAnimationFrame(tick); };
  giant.addEventListener('pointerenter', () => { measure(); running = true; start(); });
  giant.addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; });
  giant.addEventListener('pointerleave', () => { running = false; px = py = -1e4; start(); });
  window.addEventListener('scroll', () => { if (running) measure(); }, { passive: true });
}
document.querySelector('[data-up]')?.addEventListener('click', (e) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
});
