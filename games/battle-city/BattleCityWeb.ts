import { createEngine, Key } from "tinycell";
import {
  createWebAudio,
  createWebCanvas,
  createWebEvent,
  createWebGamepad,
  type CueDef,
  type Picture,
} from "tinycell/web";
import { resumeWhenParentAsks } from "../parentResume.ts";
import { bindWebPersist, createWebPersist } from "../WebPersist.ts";
import { createBattleCityApp, Cue, FX, TANK_ID, TILE } from "./BattleCity.ts";

const CELL = 16;

if (typeof document === "undefined")
  throw new Error("BattleCityWeb requires a browser document");

const persist = createWebPersist("battle-city::state");

function start(): void {
  const canvas = mountCanvas();
  const app = createBattleCityApp();
  canvas.style.width = `${app.size.w * CELL}px`;
  canvas.style.height = `${app.size.h * CELL}px`;
  canvas.style.imageRendering = "pixelated";
  canvas.style.display = "block";
  const saved = persist.readPersistedState();
  const ctx = new AudioContext();
  let pictures: Record<number, Picture> | undefined;
  let cues: Record<number, CueDef> | undefined;
  const boot = () => {
    if (!pictures || !cues) return;
    const engine = bootEngine(app, canvas, saved, pictures, ctx, cues);
    bindWebPersist(engine, persist);
    engine.start();
  };
  const sheet = new Image();
  sheet.onload = () => {
    pictures = picturesFrom(keyed(sheet));
    boot();
  };
  sheet.onerror = () => {
    pictures = {};
    boot();
  };
  // Namco Battle City (NES) sheet. Spriters Resource asset 60016.
  sheet.src = new URL("./art/battle-city.png", import.meta.url).href;
  void loadCues(ctx).then((loaded) => {
    cues = loaded;
    boot();
  });
}

function bootEngine(
  app: ReturnType<typeof createBattleCityApp>,
  canvas: HTMLCanvasElement,
  saved: Uint8Array | null,
  pictures: Record<number, Picture>,
  ctx: AudioContext,
  cues: Record<number, CueDef>,
) {
  const audio = createWebAudio(ctx, {
    unlock: window,
    voices: 8,
    volume: 0.55,
    cues,
  });
  resumeWhenParentAsks(audio);
  const opts = {
    app,
    painter: createWebCanvas(canvas, { cellPx: CELL, pictures }),
    inputs: [
      createWebEvent(window, {
        hold: [Key.Left, Key.Right, Key.Up, Key.Down, Key.Space],
      }),
      createWebGamepad(window, {
        hold: [Key.Left, Key.Right, Key.Up, Key.Down, Key.Space],
        bind: [
          [0, Key.Space],
          [2, Key.Space],
          [7, Key.Space],
          [9, Key.Enter],
          [1, Key.Escape],
        ],
      }),
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

const TONE: Record<number, CueDef> = {
  [Cue.Shot]: { wave: "square", note: 90, ms: 40, gain: 0.2 },
  [Cue.Hit]: { wave: "noise", note: 0, ms: 50, gain: 0.25 },
  [Cue.Die]: { wave: "square", note: 42, ms: 160, gain: 0.35 },
  [Cue.Power]: { wave: "square", note: 76, ms: 120, gain: 0.3 },
  [Cue.Blast]: { wave: "noise", note: 0, ms: 280, gain: 0.45 },
  [Cue.Win]: { wave: "square", note: 72, ms: 360, gain: 0.35 },
  [Cue.Lose]: { wave: "sawtooth", note: 36, ms: 480, gain: 0.4 },
  [Cue.Eagle]: { wave: "square", note: 40, ms: 420, gain: 0.45 },
  [Cue.Steel]: { wave: "square", note: 100, ms: 30, gain: 0.2 },
  [Cue.Armor]: { wave: "square", note: 70, ms: 40, gain: 0.25 },
  [Cue.Enemy]: { wave: "square", note: 80, ms: 40, gain: 0.15 },
  [Cue.Appear]: { wave: "square", note: 84, ms: 80, gain: 0.25 },
  [Cue.Engine]: { wave: "square", note: 36, ms: 80, gain: 0.12, lane: "music" },
  [Cue.Idle]: { wave: "square", note: 36, gain: 0, lane: "music" },
};

const SAMPLE: Array<[number, string, boolean]> = [
  [Cue.Shot, "shot.wav", false],
  [Cue.Enemy, "enemy.wav", false],
  [Cue.Hit, "brick.wav", false],
  [Cue.Steel, "steel.wav", false],
  [Cue.Armor, "armor.wav", false],
  [Cue.Die, "die.wav", false],
  [Cue.Blast, "die.wav", false],
  [Cue.Power, "power.wav", false],
  [Cue.Appear, "appear.wav", false],
  [Cue.Eagle, "eagle.wav", false],
  [Cue.Lose, "alarm.wav", false],
  [Cue.Win, "win.wav", false],
  [Cue.Engine, "engine.wav", true],
];

async function loadCues(ctx: AudioContext): Promise<Record<number, CueDef>> {
  const cues: Record<number, CueDef> = { ...TONE };
  await Promise.all(
    SAMPLE.map(async ([id, name, loop]) => {
      try {
        const res = await fetch(new URL(`./art/sfx/${name}`, import.meta.url));
        if (!res.ok) return;
        const sample = await ctx.decodeAudioData(await res.arrayBuffer());
        cues[id] = {
          sample,
          gain: 0.9,
          loop,
          lane: id === Cue.Engine ? "music" : "sfx",
        };
      } catch {
        /* keep the tone */
      }
    }),
  );
  return cues;
}

// Sheet is 16px tiles. Dir columns are up, right, down, left on each tank row.
const DIR_COL = [0, 6, 4, 2];
const SET_AT = [
  [0, 0],
  [8, 0],
  [0, 8],
  [8, 8],
  [8, 1],
];

function picturesFrom(image: HTMLCanvasElement): Record<number, Picture> {
  const pictures: Record<number, Picture> = {};
  const put = (id: number, x: number, y: number, w = 8, h = 8) => {
    pictures[id] = { image, src: { x, y, w, h } };
  };
  for (let set = 0; set < TANK_ID.length; set++) {
    const origin = SET_AT[set]!;
    for (let dir = 0; dir < 4; dir++) {
      const ox = (origin[0]! + DIR_COL[dir]!) * 16;
      const oy = origin[1]! * 16;
      const ids = TANK_ID[set]![dir]!;
      for (let i = 0; i < 4; i++) {
        put(ids[i]!, ox + (i % 2) * 8, oy + ((i / 2) | 0) * 8);
      }
    }
  }
  put(TILE.brick, 16 * 16, 0);
  put(TILE.steel, 16 * 16, 16);
  put(TILE.water, 16 * 16, 32);
  put(TILE.water2, 16 * 16, 48);
  put(TILE.bush, 17 * 16, 32);
  put(TILE.ice, 18 * 16, 32);
  for (let i = 0; i < 4; i++) {
    put(TILE.eagle[i]!, 19 * 16 + (i % 2) * 8, 32 + ((i / 2) | 0) * 8);
  }
  put(FX.bullet, 331, 102, 4, 4);
  const smallAt = [256, 272, 288];
  for (let frame = 0; frame < FX.small.length; frame++) {
    const ids = FX.small[frame]!;
    for (let i = 0; i < 4; i++) {
      put(ids[i]!, smallAt[frame]! + (i % 2) * 8, 128 + ((i / 2) | 0) * 8);
    }
  }
  const bigAt = [304, 336];
  for (let frame = 0; frame < FX.big.length; frame++) {
    const ids = FX.big[frame]!;
    for (let i = 0; i < 16; i++) {
      put(ids[i]!, bigAt[frame]! + (i % 4) * 8, 128 + ((i / 4) | 0) * 8);
    }
  }
  const scoreAt = [291, 307, 323, 339];
  for (let kind = 0; kind < FX.score.length; kind++) {
    const ids = FX.score[kind]!;
    put(ids[0]!, scoreAt[kind]!, 164);
    put(ids[1]!, scoreAt[kind]! + 8, 164);
  }
  return pictures;
}

function keyed(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sprite sheet needs a 2d canvas");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i]! + px[i + 1]! + px[i + 2]! < 24) px[i + 3] = 0;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
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
