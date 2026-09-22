import { createEngine, type Engine } from "../../src/engine.ts";
import { createWebCanvas } from "../../src/CanvasPainter.ts";
import { createWebEvent } from "../../src/WebEvent.ts";
import { createSnakeApp, type Persist } from "./Snake.ts";

const CELL = 16;
const SAVE_KEY = "snake::state";

if (typeof document === "undefined")
  throw new Error("SnakeWeb requires a browser document");

const persist: Persist = {
  writePersistedState(bytes) {
    try {
      localStorage.setItem(SAVE_KEY, bytesToB64(bytes));
    } catch {
      /* quota / private mode */
    }
  },
  readPersistedState() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return b64ToBytes(raw);
    } catch {
      return null;
    }
  },
};

function start(): void {
  const canvas = mountCanvas();
  const app = createSnakeApp();
  const px = CELL;
  canvas.style.width = `${app.size.w * px}px`;
  canvas.style.height = `${app.size.h * px}px`;
  canvas.style.imageRendering = "pixelated";
  canvas.style.display = "block";
  const engine = bootEngine(app, canvas, persist.readPersistedState());
  bindPersist(engine, persist);
  engine.start();
}

function bootEngine(
  app: ReturnType<typeof createSnakeApp>,
  canvas: HTMLCanvasElement,
  saved: Uint8Array | null,
) {
  const opts = {
    app,
    painter: createWebCanvas(canvas, { cellPx: CELL }),
    inputs: [createWebEvent(window)],
    tickHz: 40,
  };
  if (!saved) return createEngine(opts);
  try {
    return createEngine({ ...opts, resume: saved });
  } catch {
    return createEngine(opts);
  }
}

function bindPersist(engine: Engine, store: Persist): void {
  const save = () => store.writePersistedState(engine.snapshot());
  const away = () => {
    save();
    engine.pause();
  };
  const back = () => {
    if (document.visibilityState === "hidden" || !document.hasFocus()) return;
    engine.resume();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") away();
    else back();
  });
  window.addEventListener("blur", away);
  window.addEventListener("focus", back);
  window.addEventListener("pagehide", save);
}

function mountCanvas(): HTMLCanvasElement {
  const found = document.querySelector("canvas");
  if (found instanceof HTMLCanvasElement) return found;
  const canvas = document.createElement("canvas");
  document.body.replaceChildren(canvas);
  document.body.style.margin = "0";
  document.body.style.background = "#000";
  return canvas;
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

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
