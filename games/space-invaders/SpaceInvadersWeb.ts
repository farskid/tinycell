import { createEngine, Key } from "../../src/engine.ts";
import { createWebCanvas } from "../../src/CanvasPainter.ts";
import { createWebEvent } from "../../src/WebEvent.ts";
import { bindWebPersist, createWebPersist } from "../WebPersist.ts";
import { createSpaceInvadersApp } from "./SpaceInvaders.ts";

const CELL = 16;

if (typeof document === "undefined")
  throw new Error("SpaceInvadersWeb requires a browser document");

const persist = createWebPersist("invaders::state");

function start(): void {
  const canvas = mountCanvas();
  const app = createSpaceInvadersApp();
  const px = CELL;
  canvas.style.width = `${app.size.w * px}px`;
  canvas.style.height = `${app.size.h * px}px`;
  canvas.style.imageRendering = "pixelated";
  canvas.style.display = "block";
  const engine = bootEngine(app, canvas, persist.readPersistedState());
  bindWebPersist(engine, persist);
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

function mountCanvas(): HTMLCanvasElement {
  const found = document.querySelector("canvas");
  if (found instanceof HTMLCanvasElement) return found;
  const canvas = document.createElement("canvas");
  document.body.replaceChildren(canvas);
  return canvas;
}

document.documentElement.style.background = "#000";
document.body.style.margin = "0";
document.body.style.background = "#000";

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
