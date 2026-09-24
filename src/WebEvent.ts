// DOM keyboard adapter. The only module that reads key events.
import {
  charEvent,
  keyEvent,
  Key,
  type InputQueue,
  type InputSource,
} from "./engine.ts";

interface KeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  preventDefault?(): void;
}

type KeyName = "keydown" | "keyup" | "blur";

interface KeyTarget {
  addEventListener(type: KeyName, listener: (ev: KeyEvent) => void): void;
  removeEventListener(type: KeyName, listener: (ev: KeyEvent) => void): void;
}

export interface WebEventOptions {
  /** Push these keys every frame while held. OS key repeat is too slow for movement. */
  hold?: readonly Key[];
}

export function createWebEvent(
  target: Window,
  opts?: WebEventOptions,
): InputSource;
export function createWebEvent(
  target: EventTarget,
  opts?: WebEventOptions,
): InputSource;
export function createWebEvent(
  target: KeyTarget,
  opts?: WebEventOptions,
): InputSource;
export function createWebEvent(
  target: Window | EventTarget | KeyTarget,
  opts?: WebEventOptions,
): InputSource {
  const el = target as KeyTarget;
  const hold = new Set(opts?.hold ?? []);
  let activeDetach: (() => void) | null = null;

  return {
    attach(queue: InputQueue): () => void {
      activeDetach?.();
      let done = false;
      const held: Key[] = [];
      let frame = 0;

      function cancel(): void {
        if (frame === 0) return;
        cancelAnimationFrame(frame);
        frame = 0;
      }

      function pump(): void {
        frame = 0;
        if (done || held.length === 0) return;
        for (let i = 0; i < held.length; i++) queue.push(keyEvent(held[i]!));
        arm();
      }

      function arm(): void {
        if (done || frame !== 0 || held.length === 0) return;
        if (typeof requestAnimationFrame !== "function") return;
        frame = requestAnimationFrame(pump);
      }

      function track(key: Key, down: boolean): void {
        if (!hold.has(key)) return;
        const i = held.indexOf(key);
        if (down) {
          if (i >= 0) held.splice(i, 1);
          held.push(key);
          arm();
          return;
        }
        if (i >= 0) held.splice(i, 1);
        if (held.length === 0) cancel();
      }

      function onKey(ev: KeyEvent): void {
        if (done) return;
        const key = mapped(ev);
        if (key !== 0) {
          ev.preventDefault?.();
          queue.push(keyEvent(key));
          track(key, true);
          return;
        }
        const ch = printable(ev);
        if (ch === 0) return;
        ev.preventDefault?.();
        queue.push(charEvent(ch));
      }

      function onUp(ev: KeyEvent): void {
        if (done) return;
        const key = mapped(ev);
        if (key !== 0) track(key, false);
      }

      function onBlur(): void {
        held.length = 0;
        cancel();
      }

      el.addEventListener("keydown", onKey);
      if (hold.size > 0) {
        el.addEventListener("keyup", onUp);
        el.addEventListener("blur", onBlur);
      }

      const detach = (): void => {
        if (done) return;
        done = true;
        if (activeDetach === detach) activeDetach = null;
        held.length = 0;
        cancel();
        el.removeEventListener("keydown", onKey);
        if (hold.size > 0) {
          el.removeEventListener("keyup", onUp);
          el.removeEventListener("blur", onBlur);
        }
      };
      activeDetach = detach;
      return detach;
    },
  };
}

function mapped(ev: KeyEvent): Key | 0 {
  switch (ev.key) {
    case "ArrowUp":
      return Key.Up;
    case "ArrowDown":
      return Key.Down;
    case "ArrowLeft":
      return Key.Left;
    case "ArrowRight":
      return Key.Right;
    case "Enter":
      return Key.Enter;
    case "Escape":
      return Key.Escape;
    case " ":
      return Key.Space;
    case "Tab":
      return Key.Tab;
    case "Backspace":
      return Key.Backspace;
    case "c":
    case "C":
      if (ev.ctrlKey === true || ev.metaKey === true) return Key.CtrlC;
      return 0;
    default:
      return 0;
  }
}

function printable(ev: KeyEvent): number {
  if (ev.ctrlKey === true || ev.metaKey === true || ev.altKey === true) return 0;
  if (ev.key.length !== 1) return 0;
  const ch = ev.key.charCodeAt(0);
  if (ch < 0x21 || ch > 0x7e) return 0;
  return ch;
}
