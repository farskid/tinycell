import { createEngine } from "../../src/engine.ts";
import { createWebCanvas } from "../../src/CanvasPainter.ts";
import { createWebEvent } from "../../src/WebEvent.ts";
import { createWebAudio } from "../../src/WebAudio.ts";
import { bindWebPersist, createWebPersist } from "../WebPersist.ts";
import { createSnakeApp, Cue } from "./Snake.ts";

const CELL = 16;

if (typeof document === "undefined")
  throw new Error("SnakeWeb requires a browser document");

const persist = createWebPersist("snake::state");

function start(): void {
  const canvas = mountCanvas();
  const app = createSnakeApp();
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
  app: ReturnType<typeof createSnakeApp>,
  canvas: HTMLCanvasElement,
  saved: Uint8Array | null,
) {
  const opts = {
    app,
    painter: createWebCanvas(canvas, { cellPx: CELL }),
    inputs: [createWebEvent(window)],
    audio: createWebAudio(new AudioContext(), {
      unlock: window,
      cues: {
        [Cue.Eat]: { wave: "square", note: 79, ms: 60, gain: 0.35 },
        [Cue.Bonus]: { wave: "triangle", note: 88, ms: 120, gain: 0.4 },
        [Cue.Die]: { wave: "noise", note: 0, ms: 220, gain: 0.5 },
        [Cue.Tune0]: { wave: "triangle", note: 50, gain: 0.14, lane: "music" },
        [Cue.Tune1]: { wave: "triangle", note: 53, gain: 0.14, lane: "music" },
        [Cue.Tune2]: { wave: "triangle", note: 57, gain: 0.14, lane: "music" },
        [Cue.Tune3]: { wave: "triangle", note: 53, gain: 0.14, lane: "music" },
        [Cue.Tune4]: { wave: "triangle", note: 48, gain: 0.14, lane: "music" },
        [Cue.Tune5]: { wave: "triangle", note: 52, gain: 0.14, lane: "music" },
        [Cue.Tune6]: { wave: "triangle", note: 55, gain: 0.14, lane: "music" },
        [Cue.Tune7]: { wave: "triangle", note: 52, gain: 0.14, lane: "music" },
        [Cue.Silence]: { wave: "square", note: 0, gain: 0, lane: "music" },
      },
    }),
    tickHz: 40,
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
  document.body.style.margin = "0";
  document.body.style.background = "#000";
  return canvas;
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
