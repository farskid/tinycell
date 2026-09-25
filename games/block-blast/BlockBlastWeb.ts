import { Key, createEngine } from "tinycell";
import { createWebAudio, createWebCanvas, createWebEvent, createWebGamepad } from "tinycell/web";
import { resumeWhenParentAsks } from "../parentResume.ts";
import { bindWebPersist, createWebPersist } from "../WebPersist.ts";
import { Cue, createBlockBlastApp } from "./BlockBlast.ts";

/** Canvas pixels per cell. demos/block-blast iframe is size × this. */
const CELL = 16;

if (typeof document === "undefined")
  throw new Error("BlockBlastWeb requires a browser document");

const persist = createWebPersist("block-blast::state");

function start(): void {
  const canvas = mountCanvas();
  const app = createBlockBlastApp();
  canvas.style.width = `${app.size.w * CELL}px`;
  canvas.style.height = `${app.size.h * CELL}px`;
  canvas.style.imageRendering = "pixelated";
  canvas.style.display = "block";
  const engine = bootEngine(app, canvas, persist.readPersistedState());
  bindWebPersist(engine, persist);
  engine.start();
}

function bootEngine(
  app: ReturnType<typeof createBlockBlastApp>,
  canvas: HTMLCanvasElement,
  saved: Uint8Array | null,
) {
  const audio = createWebAudio(new AudioContext(), {
    unlock: window,
    cues: {
      [Cue.Place]: { wave: "square", note: 67, ms: 40, gain: 0.16 },
      [Cue.Clear]: { wave: "triangle", note: 79, ms: 120, gain: 0.35 },
      [Cue.Combo]: { wave: "square", note: 88, ms: 180, gain: 0.4 },
      [Cue.Over]: { wave: "sawtooth", note: 34, ms: 420, gain: 0.45 },
      [Cue.Tune0]: { wave: "triangle", note: 60, gain: 0.08, lane: "music" },
      [Cue.Tune1]: { wave: "triangle", note: 64, gain: 0.08, lane: "music" },
      [Cue.Tune2]: { wave: "triangle", note: 67, gain: 0.08, lane: "music" },
      [Cue.Tune3]: { wave: "triangle", note: 72, gain: 0.08, lane: "music" },
      [Cue.Tune4]: { wave: "triangle", note: 67, gain: 0.08, lane: "music" },
      [Cue.Tune5]: { wave: "triangle", note: 64, gain: 0.08, lane: "music" },
      [Cue.Tune6]: { wave: "triangle", note: 62, gain: 0.08, lane: "music" },
      [Cue.Tune7]: { wave: "triangle", note: 55, gain: 0.08, lane: "music" },
      [Cue.Silence]: { wave: "square", note: 0, gain: 0, lane: "music" },
    },
  });
  resumeWhenParentAsks(audio);
  const opts = {
    app,
    painter: createWebCanvas(canvas, { cellPx: CELL }),
    inputs: [
      createWebEvent(window, { hold: [Key.Left, Key.Right, Key.Up, Key.Down] }),
      createWebGamepad(window, { hold: [Key.Left, Key.Right, Key.Up, Key.Down] }),
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
