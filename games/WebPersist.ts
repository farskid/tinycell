import type { Engine } from "tinycell";
import { PARENT_PAUSE, PARENT_RESUME } from "./parentResume.ts";

export function createWebPersist(key: string) {
  return {
    writePersistedState(bytes: Uint8Array): void {
      try {
        localStorage.setItem(key, bytesToB64(bytes));
      } catch {
        /* quota / private mode */
      }
    },
    readPersistedState(): Uint8Array | null {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return b64ToBytes(raw);
      } catch {
        return null;
      }
    },
  };
}

export function bindWebPersist(
  engine: Engine,
  persist: { writePersistedState(bytes: Uint8Array): void },
): void {
  const save = () => persist.writePersistedState(engine.snapshot());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      save();
      engine.pause();
      return;
    }
    if (window.parent !== window && !document.hasFocus()) return;
    engine.resume();
  });
  window.addEventListener("message", (ev: MessageEvent) => {
    if (ev.origin !== location.origin) return;
    if (ev.data === PARENT_PAUSE) engine.pause();
    else if (ev.data === PARENT_RESUME) engine.resume();
  });
  window.addEventListener("pagehide", save);
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
