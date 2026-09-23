// Tick playback for a settled board. No engine, surface, or game imports.
//
// Call fxAge before pushing. New effects start at age 0, which is the first frame.
// An effect lives while age < delay + dur. Samplers return null while age < delay.
// t = (age - delay) / (dur - 1), or 1 when dur is 1. The last visible frame is the end.
// Slides and pops both return linear t. Ease that t before placing a cell.
// fxLinear, fxEaseIn, and fxEaseOut are quadratic. fxEaseInOut is smoothstep.
// Each maps 0 to 0 and 1 to 1. fxCovers is true for the whole life, delay included.
// from, to, and at are integer grid points. The caller rounds a slide sample to a cell.

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
