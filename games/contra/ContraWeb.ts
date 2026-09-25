import { createEngine, Key } from "tinycell";
import { createWebAudio, createWebCanvas, createWebEvent, createWebGamepad } from "tinycell/web";
import { resumeWhenParentAsks } from "../parentResume.ts";
import { bindWebPersist, createWebPersist } from "../WebPersist.ts";
import { createContraApp, Cue } from "./Contra.ts";

const CELL = 16;

if (typeof document === "undefined")
  throw new Error("ContraWeb requires a browser document");

const persist = createWebPersist("contra::state");

function start(): void {
  const canvas = mountCanvas();
  const app = createContraApp();
  canvas.style.width = `${app.size.w * CELL}px`;
  canvas.style.height = `${app.size.h * CELL}px`;
  canvas.style.imageRendering = "pixelated";
  canvas.style.display = "block";
  const engine = bootEngine(app, canvas, persist.readPersistedState());
  bindWebPersist(engine, persist);
  engine.start();
}

function bootEngine(
  app: ReturnType<typeof createContraApp>,
  canvas: HTMLCanvasElement,
  saved: Uint8Array | null,
) {
  const audio = createWebAudio(new AudioContext(), {
    unlock: window,
    cues: {
      [Cue.Shot]: { wave: "square", note: 96, ms: 40, gain: 0.22 },
      [Cue.Jump]: { wave: "square", note: 62, ms: 50, gain: 0.2 },
      [Cue.Kill]: { wave: "square", note: 48, ms: 70, gain: 0.3 },
      [Cue.Hurt]: { wave: "noise", note: 0, ms: 140, gain: 0.4 },
      [Cue.Dead]: { wave: "sawtooth", note: 34, ms: 420, gain: 0.45 },
      [Cue.Win]: { wave: "square", note: 76, ms: 520, gain: 0.4 },
    },
  });
  resumeWhenParentAsks(audio);
  const opts = {
    app,
    painter: createWebCanvas(canvas, { cellPx: CELL }),
    inputs: [
      createWebEvent(window, {
        hold: [Key.Left, Key.Right, Key.Up, Key.Down, Key.Space, Key.Tab],
      }),
      createWebGamepad(window, {
        hold: [Key.Left, Key.Right, Key.Up, Key.Down, Key.Space, Key.Tab],
        diagonal: true,
        bind: [
          [0, Key.Enter],
          [1, Key.Tab],
          [2, Key.Space],
          [7, Key.Space],
          [9, Key.Escape],
        ],
      }),
    ],
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
