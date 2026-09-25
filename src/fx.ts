// Tick playback for a settled board. No engine, surface, or game imports.
//
// Call fxAge before pushing. New effects start at age 0, which is the first frame.
// An effect lives while age < delay + dur. Samplers return null while age < delay.
// t = (age - delay) / (dur - 1), or 1 when dur is 1. The last visible frame is the end.
// Slides and pops both return linear t. Ease that t before placing a cell.
// fxLinear, fxEaseIn, and fxEaseOut are quadratic. fxEaseInOut is smoothstep.
// Each maps 0 to 0 and 1 to 1. fxCovers is true for the whole life, delay included.
// from, to, and at are integer grid points. The caller rounds a slide sample to a cell.
// A shake is not a cell in that list, and it is not a camera. Age it yourself:
// age 0 is the first frame, and it lives while age < delay + dur.
// fxShakeAt returns an integer offset, or null while age < delay or once it is over.
// The offset swings through +x, +y, -x, -y. Reach starts at amp and is 0 on the last frame.
// Draw the scene, then fxShift the whole surface by that offset. The two buffers differ.

export interface Pt {
  x: number;
  y: number;
}

export interface Slide<T> {
  kind: "slide";
  from: Pt;
  to: Pt;
  delay: number;
  dur: number;
  age: number;
  body: T;
}

export interface Pop<T> {
  kind: "pop";
  at: Pt;
  delay: number;
  dur: number;
  age: number;
  body: T;
}

export type Fx<T> = Slide<T> | Pop<T>;

export interface Shake {
  amp: number;
  delay: number;
  dur: number;
  age: number;
}

export function fxAge<T>(list: Fx<T>[]): void {
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    const fx = list[i]!;
    fx.age++;
    if (fx.dur > 0 && fx.age < fx.delay + fx.dur) list[w++] = fx;
  }
  list.length = w;
}

export function fxSlideAt<T>(fx: Slide<T>): Pt | null {
  const t = unit(fx.age, fx.delay, fx.dur);
  if (t === null) return null;
  return {
    x: fx.from.x + (fx.to.x - fx.from.x) * t,
    y: fx.from.y + (fx.to.y - fx.from.y) * t,
  };
}

export function fxPopU<T>(fx: Pop<T>): number | null {
  return unit(fx.age, fx.delay, fx.dur);
}

export function fxCovers<T>(list: readonly Fx<T>[], x: number, y: number): boolean {
  for (let i = 0; i < list.length; i++) {
    const fx = list[i]!;
    if (fx.dur <= 0) continue;
    if (fx.kind === "slide") {
      if (fx.to.x === x && fx.to.y === y) return true;
    } else if (fx.at.x === x && fx.at.y === y) return true;
  }
  return false;
}

export function fxShakeAt(shake: Shake): Pt | null {
  if (shake.dur <= 0 || shake.age < shake.delay || shake.age >= shake.delay + shake.dur) {
    return null;
  }
  if (shake.amp <= 0) return { x: 0, y: 0 };
  const t = unit(shake.age, shake.delay, shake.dur);
  if (t === null) return { x: 0, y: 0 };
  const reach = shake.dur === 1 ? shake.amp | 0 : Math.round(shake.amp * (1 - t));
  if (reach <= 0) return { x: 0, y: 0 };
  const step = (shake.age - shake.delay) & 3;
  if (step === 0) return { x: reach, y: 0 };
  if (step === 1) return { x: 0, y: reach };
  if (step === 2) return { x: -reach, y: 0 };
  return { x: 0, y: -reach };
}

export function fxShift(
  src: Uint32Array,
  dst: Uint32Array,
  w: number,
  h: number,
  dx: number,
  dy: number,
  clear: number,
): void {
  const n = w * h;
  dst.fill(clear >>> 0, 0, n);
  const x0 = dx < 0 ? -dx : 0;
  const x1 = dx > 0 ? w - dx : w;
  const y0 = dy < 0 ? -dy : 0;
  const y1 = dy > 0 ? h - dy : h;
  for (let y = y0; y < y1; y++) {
    const from = y * w + x0;
    const to = (y + dy) * w + (x0 + dx);
    dst.set(src.subarray(from, from + (x1 - x0)), to);
  }
}

export function fxLinear(t: number): number {
  return t;
}

export function fxEaseIn(t: number): number {
  return t * t;
}

export function fxEaseOut(t: number): number {
  const u = 1 - t;
  return 1 - u * u;
}

export function fxEaseInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

function unit(age: number, delay: number, dur: number): number | null {
  if (dur <= 0 || age < delay) return null;
  if (dur === 1) return 1;
  const t = (age - delay) / (dur - 1);
  return t > 1 ? 1 : t;
}
