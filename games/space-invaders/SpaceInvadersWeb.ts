import { createEngine, Key } from "../../src/engine.ts";
import { createWebCanvas } from "../../src/CanvasPainter.ts";
import { createWebEvent } from "../../src/WebEvent.ts";
import { createWebAudio } from "../../src/WebAudio.ts";
import { resumeWhenParentAsks } from "../parentResume.ts";
import { bindWebPersist, createWebPersist } from "../WebPersist.ts";
import { createSpaceInvadersApp, Cue } from "./SpaceInvaders.ts";

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
  const audio = createWebAudio(new AudioContext(), {
      unlock: window,
      cues: {
        [Cue.Shot]: { wave: "square", note: 90, ms: 40, gain: 0.25 },
        [Cue.Alien]: { wave: "square", note: 55, ms: 70, gain: 0.35 },
        [Cue.Saucer]: { wave: "sawtooth", note: 72, ms: 140, gain: 0.3 },
        [Cue.Hurt]: { wave: "noise", note: 0, ms: 180, gain: 0.45 },
        [Cue.Wave]: { wave: "triangle", note: 72, ms: 280, gain: 0.45 },
        [Cue.Wave2]: { wave: "triangle", note: 84, ms: 360, gain: 0.4 },
        [Cue.Over]: { wave: "sawtooth", note: 36, ms: 480, gain: 0.5 },
        [Cue.Dive]: { wave: "sawtooth", note: 42, ms: 160, gain: 0.4 },
        [Cue.March0]: { wave: "square", note: 41, gain: 0.12, lane: "music" },
        [Cue.March1]: { wave: "square", note: 39, gain: 0.12, lane: "music" },
        [Cue.March2]: { wave: "square", note: 37, gain: 0.12, lane: "music" },
        [Cue.March3]: { wave: "square", note: 34, gain: 0.12, lane: "music" },
        [Cue.Silence]: { wave: "square", note: 0, gain: 0, lane: "music" },
      },
  });
  resumeWhenParentAsks(audio);
  const opts = {
    app,
    painter: createWebCanvas(canvas, { cellPx: CELL }),
    inputs: [createWebEvent(window, { hold: [Key.Left, Key.Right, Key.Space] })],
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
