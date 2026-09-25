// Browser Gamepad adapter. The only module that reads getGamepads.
import { keyEvent, Key, type InputQueue, type InputSource } from "./engine.ts";

interface GamepadButton {
  pressed?: boolean;
  value?: number;
}

interface GamepadLike {
  mapping?: string;
  connected?: boolean;
  buttons?: ReadonlyArray<GamepadButton | null | undefined>;
  axes?: ReadonlyArray<number>;
}

interface GamepadNav {
  getGamepads(): ReadonlyArray<GamepadLike | null | undefined> | null;
}

type PadName = "gamepadconnected" | "gamepaddisconnected" | "blur";

interface GamepadTarget {
  navigator: GamepadNav;
  addEventListener(type: PadName, listener: () => void): void;
  removeEventListener(type: PadName, listener: () => void): void;
}

export interface WebGamepadOptions {
  /** Push these keys every frame while held. A face button is one press otherwise. */
  hold?: readonly Key[];
  /**
   * Standard button index to key. Replaces Cross, Circle, Options, and R2.
   * D-pad and the left stick stay arrows.
   */
  bind?: readonly (readonly [number, Key])[];
  /** Left stick may emit both axes at once. Off, the stronger axis wins. */
  diagonal?: boolean;
}

const AX_ON = 0.5;
const AX_OFF = 0.35;
const TRIGGER = 0.5;

const BTN_CROSS = 0;
const BTN_CIRCLE = 1;
const BTN_R2 = 7;
const BTN_OPTIONS = 9;
const BTN_UP = 12;
const BTN_DOWN = 13;
const BTN_LEFT = 14;
const BTN_RIGHT = 15;

const WATCHED: readonly Key[] = [
  Key.Up,
  Key.Down,
  Key.Left,
  Key.Right,
  Key.Enter,
  Key.Escape,
  Key.Space,
  Key.Tab,
];

const DEFAULT_BIND: readonly (readonly [number, Key])[] = [
  [BTN_CROSS, Key.Space],
  [BTN_R2, Key.Space],
  [BTN_OPTIONS, Key.Enter],
  [BTN_CIRCLE, Key.Escape],
];

export function createWebGamepad(
  target: Window,
  opts?: WebGamepadOptions,
): InputSource;
export function createWebGamepad(
  target: GamepadTarget,
  opts?: WebGamepadOptions,
): InputSource;
export function createWebGamepad(
  target: Window | GamepadTarget,
  opts?: WebGamepadOptions,
): InputSource {
  const el = target as GamepadTarget;
  const hold = new Set(opts?.hold ?? []);
  const bind = opts?.bind ?? DEFAULT_BIND;
  const diagonal = opts?.diagonal === true;
  let activeDetach: (() => void) | null = null;

  return {
    attach(queue: InputQueue): () => void {
      activeDetach?.();
      let done = false;
      let frame = 0;
      let prev = 0;
      let suppress = 0;
      let stick = 0;

      function cancel(): void {
        if (frame === 0) return;
        cancelAnimationFrame(frame);
        frame = 0;
      }

      function sample(): void {
        const now = sense(padOf(el.navigator), stick, bind, diagonal);
        stick = now.stick;
        for (let i = 0; i < WATCHED.length; i++) {
          const key = WATCHED[i]!;
          const bit = 1 << key;
          const isDown = (now.mask & bit) !== 0;
          const was = (prev & bit) !== 0;
          if (!isDown) {
            suppress &= ~bit;
            continue;
          }
          if (!was) {
            suppress &= ~bit;
            queue.push(keyEvent(key));
            continue;
          }
          if (hold.has(key) && (suppress & bit) === 0) queue.push(keyEvent(key));
        }
        prev = now.mask;
      }

      function pump(): void {
        frame = 0;
        if (done) return;
        sample();
        if (padOf(el.navigator)) arm();
      }

      function arm(): void {
        if (done || frame !== 0) return;
        if (typeof requestAnimationFrame !== "function") return;
        frame = requestAnimationFrame(pump);
      }

      function onBlur(): void {
        if (done) return;
        for (let i = 0; i < WATCHED.length; i++) {
          const key = WATCHED[i]!;
          if (!hold.has(key)) continue;
          const bit = 1 << key;
          if ((prev & bit) !== 0) suppress |= bit;
        }
      }

      el.addEventListener("gamepadconnected", arm);
      el.addEventListener("gamepaddisconnected", arm);
      el.addEventListener("blur", onBlur);
      arm();

      const detach = (): void => {
        if (done) return;
        done = true;
        if (activeDetach === detach) activeDetach = null;
        prev = 0;
        suppress = 0;
        stick = 0;
        cancel();
        el.removeEventListener("gamepadconnected", arm);
        el.removeEventListener("gamepaddisconnected", arm);
        el.removeEventListener("blur", onBlur);
      };
      activeDetach = detach;
      return detach;
    },
  };
}

function padOf(nav: GamepadNav): GamepadLike | null {
  let list: ReadonlyArray<GamepadLike | null | undefined> | null;
  try {
    list = nav.getGamepads();
  } catch {
    return null;
  }
  if (!list) return null;
  for (let i = list.length - 1; i >= 0; i--) {
    const pad = list[i];
    if (pad && pad.connected !== false && pad.mapping === "standard") return pad;
  }
  return null;
}

function sense(
  pad: GamepadLike | null,
  stick: number,
  bind: readonly (readonly [number, Key])[],
  diagonal: boolean,
): { mask: number; stick: number } {
  if (!pad) return { mask: 0, stick: 0 };
  const next = stickMask(axis(pad, 0), axis(pad, 1), stick, diagonal);
  let mask = next;
  if (button(pad, BTN_UP)) mask |= 1 << Key.Up;
  if (button(pad, BTN_DOWN)) mask |= 1 << Key.Down;
  if (button(pad, BTN_LEFT)) mask |= 1 << Key.Left;
  if (button(pad, BTN_RIGHT)) mask |= 1 << Key.Right;
  for (let i = 0; i < bind.length; i++) {
    const index = bind[i]![0];
    const key = bind[i]![1];
    const down = index === 6 || index === 7 ? trigger(pad, index) : button(pad, index);
    if (down) mask |= 1 << key;
  }
  return { mask, stick: next };
}

function stickMask(x: number, y: number, prev: number, diagonal: boolean): number {
  if (diagonal) {
    return axisBit(x, Key.Left, Key.Right, prev) | axisBit(y, Key.Up, Key.Down, prev);
  }
  const key = stickKey(x, y, stickPrev(prev));
  return key === 0 ? 0 : 1 << key;
}

function axisBit(v: number, neg: Key, pos: Key, prev: number): number {
  const held = (prev & ((1 << neg) | (1 << pos))) !== 0;
  const on = held ? AX_OFF : AX_ON;
  if (v <= -on) return 1 << neg;
  if (v >= on) return 1 << pos;
  return 0;
}

function stickPrev(mask: number): Key | 0 {
  if ((mask & (1 << Key.Left)) !== 0) return Key.Left;
  if ((mask & (1 << Key.Right)) !== 0) return Key.Right;
  if ((mask & (1 << Key.Up)) !== 0) return Key.Up;
  if ((mask & (1 << Key.Down)) !== 0) return Key.Down;
  return 0;
}

function stickKey(x: number, y: number, prev: Key | 0): Key | 0 {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const horizontal = ax >= ay;
  const mag = horizontal ? ax : ay;
  const key: Key | 0 =
    mag === 0 || (horizontal && x === 0)
      ? 0
      : horizontal
        ? x > 0
          ? Key.Right
          : Key.Left
        : y > 0
          ? Key.Down
          : Key.Up;
  if (key !== 0 && mag >= (prev === key ? AX_OFF : AX_ON)) return key;
  if (prev === 0) return 0;
  const prevMag = prev === Key.Left || prev === Key.Right ? ax : ay;
  return prevMag >= AX_OFF ? prev : 0;
}

function axis(pad: GamepadLike, i: number): number {
  const v = pad.axes?.[i];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function button(pad: GamepadLike, i: number): boolean {
  const b = pad.buttons?.[i];
  if (!b) return false;
  if (b.pressed === true) return true;
  return (b.value ?? 0) > TRIGGER;
}

function trigger(pad: GamepadLike, i: number): boolean {
  return (pad.buttons?.[i]?.value ?? 0) > TRIGGER;
}
