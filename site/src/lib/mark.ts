// Kraddle mark geometry. The mark is two identical halves; half B is half A
// turned 180° about the centre. Everything here is in the mark's 621 × 621 frame.

export const STROKE = 83.196;
export const CENTER = { x: 310, y: 310.9325 };

export const PATHS = [
  'M376.049 368.843H488.002',
  'M243.953 253.021H132',
  'M132 368.843H202.824C221.792 368.843 239.783 377.257 251.943 391.815L293.051 441.029C305.211 455.586 323.202 464 342.17 464H376.051',
  'M488.002 253.021H417.18C398.212 253.021 380.221 244.607 368.061 230.049L326.953 180.835C314.793 166.278 296.802 157.864 277.834 157.864H243.953',
];

// Tight box around the stroked mark (square ends).
export const VIEWBOX = '132 116.27 356 389.33';

type Pt = [number, number];
type Seg = [Pt, Pt];

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 16): Seg[] {
  const out: Seg[] = [];
  let prev = p0;
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const pt: Pt = [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
    out.push([prev, pt]);
    prev = pt;
  }
  return out;
}

const HALF_A: Seg[] = [
  [[376.049, 368.843], [488.002, 368.843]],
  [[132, 368.843], [202.824, 368.843]],
  ...cubic([202.824, 368.843], [221.792, 368.843], [239.783, 377.257], [251.943, 391.815]),
  [[251.943, 391.815], [293.051, 441.029]],
  ...cubic([293.051, 441.029], [305.211, 455.586], [323.202, 464], [342.17, 464]),
  [[342.17, 464], [376.051, 464]],
];

const turn = ([x, y]: Pt): Pt => [2 * CENTER.x - x, 2 * CENTER.y - y];
export const SEGMENTS: Seg[] = [...HALF_A, ...HALF_A.map(([a, b]) => [turn(a), turn(b)] as Seg)];

/** True when (x, y) lies inside the stroked mark (square ends). */
export function inMark(x: number, y: number, width = STROKE): boolean {
  const h = width / 2;
  for (const [[ax, ay], [bx, by]] of SEGMENTS) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = ((x - ax) * dx + (y - ay) * dy) / len2;
    if (t < 0 || t > 1) continue;
    const px = ax + t * dx - x, py = ay + t * dy - y;
    if (px * px + py * py <= h * h) return true;
  }
  return false;
}

export type Dot = { x: number; y: number; on: boolean };

/** A dot grid over the mark's frame, flagging dots that fall inside the mark. */
export function markDots(step = 22, box = { x: 112, y: 96, w: 396, h: 430 }): Dot[] {
  const dots: Dot[] = [];
  for (let y = box.y + step / 2; y < box.y + box.h; y += step)
    for (let x = box.x + step / 2; x < box.x + box.w; x += step)
      dots.push({ x, y, on: inMark(x, y) });
  return dots;
}

/** The mark's joint as a relative path: one level down (dir 1) or up (dir -1). */
export function joint(s: number, dir: 1 | -1): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  const k = dir;
  return `c${r(18.968 * s)} 0 ${r(36.959 * s)} ${r(8.414 * s * k)} ${r(49.119 * s)} ${r(22.972 * s * k)}` +
    `l${r(41.108 * s)} ${r(49.214 * s * k)}` +
    `c${r(12.16 * s)} ${r(14.557 * s * k)} ${r(30.151 * s)} ${r(22.971 * s * k)} ${r(49.119 * s)} ${r(22.971 * s * k)}`;
}
export const JOINT = { dx: 139.346, dy: 95.157 };
