// DOM swipe adapter. A touch drag becomes an arrow key.
import { keyEvent, Key, type InputQueue, type InputSource } from "./engine.ts";

interface PointEvent {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  preventDefault?(): void;
}

type PointName = "pointerdown" | "pointerup" | "pointercancel";

interface PointTarget {
  addEventListener(type: PointName, listener: (ev: PointEvent) => void): void;
  removeEventListener(type: PointName, listener: (ev: PointEvent) => void): void;
}

export interface WebSwipeOptions {
  /** Minimum travel in CSS pixels. Shorter drags are dropped. */
  min?: number;
}

const MIN_PX = 24;

export function createWebSwipe(
  target: Window,
  opts?: WebSwipeOptions,
): InputSource;
export function createWebSwipe(
  target: EventTarget,
  opts?: WebSwipeOptions,
): InputSource;
export function createWebSwipe(
  target: PointTarget,
  opts?: WebSwipeOptions,
): InputSource;
export function createWebSwipe(
  target: Window | EventTarget | PointTarget,
  opts?: WebSwipeOptions,
): InputSource {
  const el = target as PointTarget;
  const min = opts?.min ?? MIN_PX;
  let activeDetach: (() => void) | null = null;

  return {
    attach(queue: InputQueue): () => void {
      activeDetach?.();
      let done = false;
      let down: { id: number; x: number; y: number } | null = null;

      function onDown(ev: PointEvent): void {
        if (done || down || !finger(ev.pointerType)) return;
        ev.preventDefault?.();
        down = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
      }

      function onUp(ev: PointEvent): void {
        if (done || !down || ev.pointerId !== down.id) return;
        const key = direction(ev.clientX - down.x, ev.clientY - down.y, min);
        down = null;
        if (key !== 0) queue.push(keyEvent(key));
      }

      function onCancel(ev: PointEvent): void {
        if (down && ev.pointerId === down.id) down = null;
      }

      el.addEventListener("pointerdown", onDown);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onCancel);

      const detach = (): void => {
        if (done) return;
        done = true;
        if (activeDetach === detach) activeDetach = null;
        down = null;
        el.removeEventListener("pointerdown", onDown);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onCancel);
      };
      activeDetach = detach;
      return detach;
    },
  };
}

function finger(pointerType: string): boolean {
  return pointerType === "touch" || pointerType === "pen";
}

function direction(dx: number, dy: number, min: number): Key | 0 {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < min && ady < min) return 0;
  if (adx >= ady) return dx > 0 ? Key.Right : Key.Left;
  return dy > 0 ? Key.Down : Key.Up;
}
