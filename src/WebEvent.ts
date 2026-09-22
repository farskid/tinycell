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

interface KeyTarget {
  addEventListener(type: "keydown", listener: (ev: KeyEvent) => void): void;
  removeEventListener(type: "keydown", listener: (ev: KeyEvent) => void): void;
}

export function createWebEvent(target: Window): InputSource;
export function createWebEvent(target: EventTarget): InputSource;
export function createWebEvent(target: KeyTarget): InputSource;
export function createWebEvent(
  target: Window | EventTarget | KeyTarget,
): InputSource {
  const el = target as KeyTarget;
  let activeDetach: (() => void) | null = null;

  return {
    attach(queue: InputQueue): () => void {
      activeDetach?.();
      let done = false;

      function onKey(ev: KeyEvent): void {
        if (done) return;
        const key = mapped(ev);
        if (key !== 0) {
          ev.preventDefault?.();
          queue.push(keyEvent(key));
          return;
        }
        const ch = printable(ev);
        if (ch === 0) return;
        ev.preventDefault?.();
        queue.push(charEvent(ch));
      }

      el.addEventListener("keydown", onKey);

      const detach = (): void => {
        if (done) return;
        done = true;
        if (activeDetach === detach) activeDetach = null;
        el.removeEventListener("keydown", onKey);
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
