import { createEngine } from "../../src/engine.ts";
import { createWebCanvas } from "../../src/CanvasPainter.ts";
import { createWebEvent } from "../../src/WebEvent.ts";
import { createWebAudio } from "../../src/WebAudio.ts";
import { resumeWhenParentAsks } from "../parentResume.ts";
import { createWebSwipe } from "../../src/WebSwipe.ts";
import { bindWebPersist, createWebPersist } from "../WebPersist.ts";
import { createGame2048App, Cue } from "./Game2048.ts";

/** Canvas pixels per cell. demos/2048 iframe is size × this. */
const CELL = 16;

if (typeof document === "undefined")
  throw new Error("Game2048Web requires a browser document");

const persist = createWebPersist("2048::state");

function start(): void {
  const canvas = mountCanvas();
  const app = createGame2048App();
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
  app: ReturnType<typeof createGame2048App>,
  canvas: HTMLCanvasElement,
  saved: Uint8Array | null,
) {
  const audio = createWebAudio(new AudioContext(), {
      unlock: window,
      cues: {
        [Cue.Slide]: { wave: "square", note: 62, ms: 40, gain: 0.2 },
        [Cue.Merge]: { wave: "triangle", note: 76, ms: 90, gain: 0.35 },
        [Cue.Bump]: { wave: "square", note: 40, ms: 30, gain: 0.12 },
        [Cue.Win]: { wave: "triangle", note: 88, ms: 220, gain: 0.45 },
        [Cue.Over]: { wave: "sawtooth", note: 36, ms: 420, gain: 0.5 },
        [Cue.Pad]: { wave: "triangle", note: 48, gain: 0.06, lane: "music" },
        [Cue.PadWin]: { wave: "triangle", note: 60, gain: 0.08, lane: "music" },
        [Cue.Silence]: { wave: "square", note: 0, gain: 0, lane: "music" },
      },
  });
  resumeWhenParentAsks(audio);
  const opts = {
    app,
    painter: createWebCanvas(canvas, { cellPx: CELL }),
    inputs: [createWebEvent(window), createWebSwipe(window)],
    audio,
    tickHz: 60,
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
