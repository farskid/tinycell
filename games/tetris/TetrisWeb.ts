import { Key, createEngine } from "tinycell";
import {
  createWebAudio,
  createWebCanvas,
  createWebEvent,
  createWebGamepad,
  createWebSwipe,
} from "tinycell/web";
import { resumeWhenParentAsks } from "../parentResume.ts";
import { bindWebPersist, createWebPersist } from "../WebPersist.ts";
import { Cue, createTetrisApp } from "./Tetris.ts";

/** Canvas pixels per cell. demos/tetris iframe is size × this. */
const CELL = 16;

if (typeof document === "undefined")
  throw new Error("TetrisWeb requires a browser document");

const persist = createWebPersist("tetris::state");

function start(): void {
  const canvas = mountCanvas();
  const app = createTetrisApp();
  canvas.style.width = `${app.size.w * CELL}px`;
  canvas.style.height = `${app.size.h * CELL}px`;
  canvas.style.imageRendering = "pixelated";
  canvas.style.display = "block";
  const engine = bootEngine(app, canvas, persist.readPersistedState());
  bindWebPersist(engine, persist);
  engine.start();
}

function bootEngine(
  app: ReturnType<typeof createTetrisApp>,
  canvas: HTMLCanvasElement,
  saved: Uint8Array | null,
) {
  const audio = createWebAudio(new AudioContext(), {
    unlock: window,
    cues: {
      [Cue.Move]: { wave: "square", note: 67, ms: 25, gain: 0.12 },
      [Cue.Rotate]: { wave: "square", note: 72, ms: 35, gain: 0.16 },
      [Cue.Lock]: { wave: "triangle", note: 48, ms: 50, gain: 0.22 },
      [Cue.Clear]: { wave: "triangle", note: 79, ms: 120, gain: 0.35 },
      [Cue.Tetris]: { wave: "square", note: 88, ms: 220, gain: 0.4 },
      [Cue.Shake]: { wave: "noise", note: 0, ms: 120, gain: 0.4 },
      [Cue.Drop]: { wave: "sawtooth", note: 40, ms: 60, gain: 0.18 },
      [Cue.Over]: { wave: "sawtooth", note: 34, ms: 420, gain: 0.45 },
      [Cue.Tune0]: { wave: "triangle", note: 60, gain: 0.1, lane: "music" },
      [Cue.Tune1]: { wave: "triangle", note: 64, gain: 0.1, lane: "music" },
      [Cue.Tune2]: { wave: "triangle", note: 67, gain: 0.1, lane: "music" },
      [Cue.Tune3]: { wave: "triangle", note: 72, gain: 0.1, lane: "music" },
      [Cue.Tune4]: { wave: "triangle", note: 67, gain: 0.1, lane: "music" },
      [Cue.Tune5]: { wave: "triangle", note: 64, gain: 0.1, lane: "music" },
      [Cue.Tune6]: { wave: "triangle", note: 62, gain: 0.1, lane: "music" },
      [Cue.Tune7]: { wave: "triangle", note: 55, gain: 0.1, lane: "music" },
      [Cue.Silence]: { wave: "square", note: 0, gain: 0, lane: "music" },
    },
  });
  resumeWhenParentAsks(audio);
  const opts = {
    app,
    painter: createWebCanvas(canvas, { cellPx: CELL }),
    inputs: [
      createWebEvent(window, { hold: [Key.Left, Key.Right, Key.Down] }),
      createWebSwipe(window),
      createWebGamepad(window, { hold: [Key.Left, Key.Right, Key.Down] }),
    ],
    audio,
    tickHz: 20,
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
