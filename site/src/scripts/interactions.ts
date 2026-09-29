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
let lastY = window.scrollY;
function onScroll() {
  const y = window.scrollY;
  nav?.classList.toggle('scrolled', y > 8);
  nav?.classList.toggle('tucked', y > 400 && y > lastY + 4);
  if (y < lastY - 4) nav?.classList.remove('tucked');
  lastY = y;
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
  dotField(c, { place: c.dataset.dotfield === 'center' ? 'center' : 'right', markScale: c.dataset.dotfield === 'center' ? 0.7 : 0.8 });
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
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      go(i + (e.key === 'ArrowRight' ? 1 : -1), true);
      opts.tabs[i].focus();
    }
  });
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !started) { started = true; go(0); }
    else if (!e.isIntersecting) clearTimeout(timer);
    else if (started) schedule(opts.dur);
  }, { threshold: 0.4 }).observe(root);
}

/* map: 01 map it · 02 slice it · 03 keep it current, plus node tooltips */
document.querySelectorAll<HTMLElement>('[data-map]').forEach((map) => {
  const lines = [...map.querySelectorAll<HTMLElement>('[data-line]')];
  tabSet(map, {
    dur: 5200,
    tabs: [...map.querySelectorAll<HTMLElement>('[data-go]')],
    onChange: (n) => { map.dataset.step = String(n); lines.forEach((l, k) => l.classList.toggle('on', k === n)); },
  });
  const tip = map.querySelector<HTMLElement>('[data-tip]');
  const canvas = map.querySelector<HTMLElement>('.canvas');
  if (!tip || !canvas) return;
  const show = (node: SVGGElement) => {
    const r = node.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    (tip.querySelector('b') as HTMLElement).textContent = node.dataset.label || '';
    (tip.querySelector('span') as HTMLElement).textContent = node.dataset.limit || '';
    tip.style.left = `${r.left - c.left + r.width / 2 + canvas.scrollLeft}px`;
    tip.style.top = `${r.top - c.top}px`;
    tip.hidden = false;
  };
  map.querySelectorAll<SVGGElement>('.node').forEach((n) => {
    n.addEventListener('pointerenter', () => show(n));
    n.addEventListener('focus', () => show(n));
    n.addEventListener('pointerleave', () => { tip.hidden = true; });
    n.addEventListener('blur', () => { tip.hidden = true; });
  });
});

/* showcase: three windows, each plays its own little sequence */
document.querySelectorAll<HTMLElement>('[data-show]').forEach((show) => {
  const panels = [...show.querySelectorAll<HTMLElement>('[data-panel]')];
  const caps = [...show.querySelectorAll<HTMLElement>('[data-cap]')];
  const title = show.querySelector<HTMLElement>('[data-title]');
  const titles = ['checkout · agent', 'checkout · ideas', 'price.tsx · editor'];
  tabSet(show, {
    dur: 7000,
    tabs: [...show.querySelectorAll<HTMLElement>('[data-go]')],
    onChange: (n) => {
      panels.forEach((p, k) => {
        p.classList.toggle('on', k === n);
        p.classList.remove('play');
        if (k === n) { void p.offsetWidth; p.classList.add('play'); }
      });
      caps.forEach((c, k) => c.classList.toggle('on', k === n));
      if (title) title.textContent = titles[n];
    },
  });
  // collapsible context card
  show.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((b) => {
    b.addEventListener('click', () => b.setAttribute('aria-expanded', String(b.getAttribute('aria-expanded') !== 'true')));
  });
  // gentle 3D tilt toward the cursor
  const tilt = show.querySelector<HTMLElement>('[data-tilt]');
  const win = tilt?.querySelector<HTMLElement>('.window');
  if (tilt && win && finePointer && !reduce) {
    tilt.addEventListener('pointermove', (e) => {
      const r = tilt.getBoundingClientRect();
      win.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 5}deg`);
      win.style.setProperty('--rx', `${-((e.clientY - r.top) / r.height - 0.5) * 4}deg`);
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
const giant = document.querySelector<HTMLElement>('[data-giant]');
if (giant && finePointer && !reduce) {
  const chars = [...giant.querySelectorAll<HTMLElement>('.ch')];
  giant.addEventListener('pointermove', (e) => {
    for (const ch of chars) {
      const r = ch.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      const f = Math.max(0, 1 - d / (r.width * 2.4));
      ch.style.fontWeight = String(Math.round(800 - f * 650));
      ch.classList.toggle('hot', f > 0.7);
      ch.style.transform = `translateY(${-f * 6}px)`;
    }
  });
  giant.addEventListener('pointerleave', () => chars.forEach((ch) => { ch.style.fontWeight = ''; ch.style.transform = ''; ch.classList.remove('hot'); }));
}
document.querySelector('[data-up]')?.addEventListener('click', (e) => {
  e.preventDefault();
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
});
