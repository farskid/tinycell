import { createEngine } from "tinycell";
import { createWebAudio, createWebCanvas, createWebEvent, createWebGamepad } from "tinycell/web";
import { resumeWhenParentAsks } from "../parentResume.ts";
import { bindWebPersist, createWebPersist } from "../WebPersist.ts";
import { createFlappyApp, Cue } from "./Flappy.ts";

const CELL = 16;

if (typeof document === "undefined")
  throw new Error("FlappyWeb requires a browser document");

const persist = createWebPersist("flappy::state");

function start(): void {
  const canvas = mountCanvas();
  const app = createFlappyApp();
  canvas.style.width = `${app.size.w * CELL}px`;
  canvas.style.height = `${app.size.h * CELL}px`;
  canvas.style.imageRendering = "pixelated";
  canvas.style.display = "block";
  const engine = bootEngine(app, canvas, persist.readPersistedState());
  bindWebPersist(engine, persist);
  engine.start();
}

function bootEngine(
  app: ReturnType<typeof createFlappyApp>,
  canvas: HTMLCanvasElement,
  saved: Uint8Array | null,
) {
  const audio = createWebAudio(new AudioContext(), {
    unlock: window,
    cues: {
      [Cue.Flap]: { wave: "square", note: 76, ms: 50, gain: 0.4 },
      [Cue.Score]: { wave: "triangle", note: 88, ms: 90, gain: 0.35 },
      [Cue.Hit]: { wave: "noise", note: 0, ms: 180, gain: 0.5 },
    },
  });
  resumeWhenParentAsks(audio);
  const opts = {
    app,
    painter: createWebCanvas(canvas, { cellPx: CELL }),
    inputs: [createWebEvent(window), createWebGamepad(window)],
    audio,
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
