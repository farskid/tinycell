import { createEngine, Key, type Engine } from "../../src/engine.ts";
import { createWebCanvas } from "../../src/CanvasPainter.ts";
import { createWebEvent } from "../../src/WebEvent.ts";
import { createSpaceInvadersApp } from "./SpaceInvaders.ts";

const CELL = 16;
const SAVE_KEY = "invaders::state";

if (typeof document === "undefined")
  throw new Error("SpaceInvadersWeb requires a browser document");

function start(): void {
  const canvas = mountCanvas();
  const app = createSpaceInvadersApp();
  const px = CELL;
  canvas.style.width = `${app.size.w * px}px`;
  canvas.style.height = `${app.size.h * px}px`;
  canvas.style.imageRendering = "pixelated";
  canvas.style.display = "block";
  const engine = bootEngine(app, canvas, readSave());
  bindPersist(engine);
  engine.start();
}

function bootEngine(
  app: ReturnType<typeof createSpaceInvadersApp>,
  canvas: HTMLCanvasElement,
  saved: Uint8Array | null,
) {
  const opts = {
    app,
    painter: createWebCanvas(canvas, { cellPx: CELL }),
    inputs: [createWebEvent(window, { hold: [Key.Left, Key.Right] })],
    tickHz: 30,
  };
  if (!saved) return createEngine(opts);
  try {
    return createEngine({ ...opts, resume: saved });
  } catch {
    return createEngine(opts);
  }
}

function bindPersist(engine: Engine): void {
  const save = () => writeSave(engine.snapshot());
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
  return canvas;
}

function readSave(): Uint8Array | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return b64ToBytes(raw);
  } catch {
    return null;
  }
}

function writeSave(bytes: Uint8Array): void {
  try {
    localStorage.setItem(SAVE_KEY, bytesToB64(bytes));
  } catch {
    /* quota / private mode */
  }
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

document.documentElement.style.background = "#000";
document.body.style.margin = "0";
document.body.style.background = "#000";

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
