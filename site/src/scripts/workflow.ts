import { scrollToSmooth } from './motion';

export function workflow(track: HTMLElement) {
  const pin = track.querySelector<HTMLElement>('.workflow-pin')!;
  const frame = track.querySelector<HTMLElement>('.workflow-frame')!;
  const tabs = [...track.querySelectorAll<HTMLElement>('[data-go]')];
  const panels = [...track.querySelectorAll<HTMLElement>('[data-shot]')];
  const count = track.querySelector<HTMLElement>('[data-workflow-count]')!;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let active = -1, raf = 0;
  const select = (n: number) => {
    if (n === active) return;
    active = n;
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === n));
      tab.tabIndex = i === n ? 0 : -1;
      tab.classList.toggle('passed', i < n);
    });
    panels.forEach((panel, i) => {
      panel.classList.toggle('on', i === n);
      panel.inert = track.classList.contains('is-pinned') && i !== n;
    });
    count.textContent = `${String(n + 1).padStart(2, '0')} / 04`;
  };
  const update = () => {
    raf = 0;
    if (!track.classList.contains('is-pinned')) return;
    const top = parseFloat(getComputedStyle(pin).top);
    const distance = track.offsetHeight - pin.offsetHeight;
    const p = Math.max(0, Math.min(.9999, (top - track.getBoundingClientRect().top) / distance));
    select(Math.floor(p * panels.length));
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
  const layout = () => {
    track.classList.toggle('is-pinned', !motion.matches);
    // If zoom or a very small viewport cannot fit the content, retain all four
    // in normal flow rather than clip anything inside a sticky viewport.
    if (!motion.matches && frame.offsetHeight > pin.clientHeight) track.classList.remove('is-pinned');
    active = -1;
    select(0);
    update();
  };
  const go = (n: number) => {
    n = Math.max(0, Math.min(panels.length - 1, n));
    if (!track.classList.contains('is-pinned')) {
      scrollToSmooth(window.scrollY + panels[n].getBoundingClientRect().top - 90);
      select(n);
      return;
    }
    const top = parseFloat(getComputedStyle(pin).top);
    const distance = track.offsetHeight - pin.offsetHeight;
    const start = window.scrollY + track.getBoundingClientRect().top - top;
    scrollToSmooth(start + distance * ((n + .12) / panels.length));
  };
  tabs.forEach((tab, i) => tab.addEventListener('click', () => go(i)));
  track.addEventListener('keydown', (e) => {
    if (!(e.target as HTMLElement).matches('[role="tab"]')) return;
    let n = tabs.indexOf(e.target as HTMLElement);
    if (['ArrowRight', 'ArrowDown'].includes(e.key)) n = (n + 1) % tabs.length;
    else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) n = (n + tabs.length - 1) % tabs.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = tabs.length - 1;
    else return;
    e.preventDefault();
    tabs[n].focus({ preventScroll: true });
    go(n);
  });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', layout);
  motion.addEventListener('change', layout);
  document.fonts.ready.then(layout);
  layout();
}
