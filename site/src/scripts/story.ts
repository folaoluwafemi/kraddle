import { ease, scrollToSmooth } from './motion';

export function story(section: HTMLElement) {
  const track = section.querySelector<HTMLElement>('[data-story-track]')!;
  const pin = section.querySelector<HTMLElement>('.story-pin')!;
  const guide = section.querySelector<HTMLElement>('.story-nav')!;
  const chapters = [...section.querySelectorAll<HTMLElement>('[data-chapter]')];
  const links = [...section.querySelectorAll<HTMLAnchorElement>('[data-chapter-link]')];
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const nativePan = CSS.supports('(animation-timeline: scroll()) and (animation-range: 0% 100%) and (view-timeline-inset: 1px)');
  let current = -1, frame = 0;
  const select = (n: number) => {
    if (n === current) return;
    current = n;
    chapters.forEach((chapter, i) => {
      chapter.classList.toggle('on', i === n);
      chapter.inert = track.classList.contains('is-pinned') && i !== n;
    });
    links.forEach((link, i) => {
      link.classList.toggle('on', i === current);
      link.classList.toggle('passed', i < current);
      if (i === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  const update = () => {
    frame = 0;
    if (track.classList.contains('is-pinned')) {
      const top = parseFloat(getComputedStyle(pin).top);
      const span = track.offsetHeight - pin.offsetHeight;
      const p = Math.max(0, Math.min(.9999, (top - track.getBoundingClientRect().top) / span));
      const n = Math.floor(p * chapters.length);
      select(n);
      const chapter = chapters[n];
      const content = chapter.querySelector<HTMLElement>('.chapter-grid')!;
      const space = pin.clientHeight - guide.offsetHeight - parseFloat(getComputedStyle(chapter).paddingTop) * 2;
      const overflow = Math.max(0, content.offsetHeight - space);
      // Tall phone chapters travel from their text to the end of the scene,
      // with a reading pause at each end before the next chapter takes over.
      const local = p * chapters.length - n;
      if (!nativePan) chapter.style.setProperty('--chapter-pan', `${-overflow * ease((local - .15) / .6)}px`);
    } else {
      let n = 0;
      chapters.forEach((chapter, i) => { if (chapter.getBoundingClientRect().top <= Math.min(innerHeight * .4, 280)) n = i; });
      select(n);
    }
  };
  const layout = () => {
    track.classList.toggle('is-pinned', !motion.matches);
    chapters.forEach(chapter => {
      const space = pin.clientHeight - guide.offsetHeight - parseFloat(getComputedStyle(chapter).paddingTop) * 2;
      const overflow = Math.max(0, chapter.querySelector<HTMLElement>('.chapter-grid')!.offsetHeight - space);
      chapter.classList.toggle('is-tall', overflow > 0);
      chapter.style.setProperty('--chapter-overflow', `${overflow}px`);
      chapter.style.removeProperty('--chapter-pan');
    });
    current = -1;
    select(0);
    update();
  };
  const go = (i: number, animate = true) => {
    const top = parseFloat(getComputedStyle(pin).top);
    const start = window.scrollY + track.getBoundingClientRect().top - top;
    const y = start + (track.offsetHeight - pin.offsetHeight) * ((i + .12) / chapters.length);
    if (animate) scrollToSmooth(y); else window.scrollTo({ top: y, behavior: 'instant' });
  };
  section.querySelectorAll<HTMLAnchorElement>('a[href^="#story-"]').forEach(link => link.addEventListener('click', (e) => {
    if (!track.classList.contains('is-pinned') || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const i = Number(link.hash.slice('#story-'.length));
    if (!Number.isInteger(i) || i < 0 || i >= chapters.length) return;
    e.preventDefault(); e.stopImmediatePropagation();
    go(i);
    history.pushState(null, '', link.hash);
  }));
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', layout);
  motion.addEventListener('change', layout);
  document.fonts.ready.then(() => {
    layout();
    const match = window.location.hash.match(/^#story-([0-3])$/);
    if (match && track.classList.contains('is-pinned')) go(Number(match[1]), false);
  });
  layout();
}
