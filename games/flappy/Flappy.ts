// One bird and scrolling columns. Motion is fractional; the picture is cells.
import {
  Color,
  Key,
  keyOf,
  packCell,
  type App,
  type CueQueue,
  type Engine,
  type InputQueue,
  type Surface,
} from "../../src/engine.ts";
import { fxAge, fxEaseOut, fxSlideAt, type Fx } from "../fx.ts";

export const Cue = {
  Flap: 1,
  Score: 2,
  Hit: 3,
} as const;

const W = 40;
const H = 24;
const GROUND = 2;
const PLAY = H - GROUND;
const BIRD_X = 7;
const GAP = 9;
const OPEN_MIN = 6;
const OPEN_MAX = 10;
const PIPE_W = 3;
const SPACE_MIN = 13;
const SPACE_MAX = 22;
const SCROLL = 0.25;
const GRAVITY = 0.035;
const HOP = 2;
const HOP_DUR = 3;
const VY_MAX = 0.45;
const FIRST_GAP = 5;
const START_Y = 9;
const LEAD = 10;
const MAX_PIPES = 5;
const Q = 32;
const SAVE_VER = 2;
const GAP_MIN = 1;
const HEAD = 22;
const PAYLOAD = HEAD + MAX_PIPES * 4;

const SKY = packCell(0x20, Color.Default, Color.Blue);
const GROUND_TOP = packCell(0x20, Color.Default, Color.BrightGreen);
const GROUND_BOT = packCell(0x20, Color.Default, Color.Green);
const PIPE = packCell(0x20, Color.Default, Color.Green);
const LIP = packCell(0x20, Color.Default, Color.BrightGreen);
const BIRD = packCell(0x3e, Color.Black, Color.BrightYellow);
const BIRD_UP = packCell(0x5e, Color.Black, Color.BrightYellow);
const BIRD_DEAD = packCell(0x78, Color.BrightWhite, Color.BrightRed);

type Phase = "ready" | "run" | "dead";

type Pipe = { x: number; gap: number; open: number; scored: boolean };

type State = {
  phase: Phase;
  birdY: number;
  vy: number;
  until: number;
  seed: number;
  wing: number;
  score: number;
  best: number;
  gap: number;
  open: number;
  space: number;
  pipes: Pipe[];
  hop: Fx<number>[];
};

function freshSeed(): number {
  const n = (Math.random() * 0x100000000) >>> 0;
  return n === 0 ? 1 : n;
}

function reset(s: State): void {
  s.phase = "ready";
  s.birdY = START_Y;
  s.vy = 0;
  s.until = LEAD;
  s.seed = freshSeed();
  s.wing = 0;
  s.score = 0;
  s.gap = FIRST_GAP;
  s.open = GAP;
  s.space = SPACE_MIN + (roll(s) % (SPACE_MAX - SPACE_MIN + 1));
  s.pipes.length = 0;
  s.hop.length = 0;
}

function roll(s: State): number {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed;
}

function pick(s: State, lo: number, hi: number): number {
  return lo + (roll(s) % (hi - lo + 1));
}

function maxTop(open: number): number {
  return PLAY - open - 1;
}

/** Full-range hole. A near-repeat jumps to the far edge so neighbors don't stack. */
function placeNext(s: State): void {
  const open = pick(s, OPEN_MIN, OPEN_MAX);
  const hi = maxTop(open);
  let gap = pick(s, GAP_MIN, hi);
  if (Math.abs(gap - s.gap) < 4) gap = gap <= (hi >> 1) ? hi : GAP_MIN;
  s.gap = gap;
  s.open = open;
  s.space = pick(s, SPACE_MIN, SPACE_MAX);
}

function spawn(s: State, x: number): void {
  if (s.pipes.length >= MAX_PIPES) return;
  s.pipes.push({ x, gap: s.gap, open: s.open, scored: false });
  placeNext(s);
}

function bob(s: State): void {
  s.wing++;
  const t = s.wing % 16;
  const tri = t < 8 ? t : 16 - t;
  s.birdY = START_Y + tri * 0.04 - 0.16;
}

function fall(s: State): void {
  s.vy += GRAVITY;
  if (s.vy > VY_MAX) s.vy = VY_MAX;
  s.birdY += s.vy;
  if (s.birdY > PLAY) {
    s.birdY = PLAY;
    s.vy = 0;
  }
}

function sound(cues: CueQueue | undefined, id: number): void {
  cues?.push(id);
}

function startHop(s: State, cues?: CueQueue): void {
  sound(cues, Cue.Flap);
  const row = s.birdY | 0;
  s.vy = 0;
  s.hop.length = 0;
  s.hop.push({
    kind: "slide",
    from: { x: BIRD_X, y: row },
    to: { x: BIRD_X, y: row - HOP },
    delay: 0,
    dur: HOP_DUR,
    age: 0,
    body: 0,
  });
  // Age 0 is the cell already on screen. Step once so this tick moves.
  fxAge(s.hop);
}

function placeHop(s: State): boolean {
  const fx = s.hop[0];
  if (!fx || fx.kind !== "slide") return false;
  const at = fxSlideAt(fx);
  if (!at) return false;
  const span = fx.to.y - fx.from.y;
  const t = span === 0 ? 1 : (at.y - fx.from.y) / span;
  s.birdY = fx.from.y + span * fxEaseOut(t);
  s.vy = 0;
  return true;
}

function step(s: State, flap: boolean, cues?: CueQueue): void {
  if (flap) startHop(s, cues);
  else fxAge(s.hop);
  if (!placeHop(s)) {
    s.vy += GRAVITY;
    if (s.vy > VY_MAX) s.vy = VY_MAX;
    s.birdY += s.vy;
  }
  if (s.birdY < 0) {
    s.birdY = 0;
    if (s.vy < 0) s.vy = 0;
  }
  s.wing++;

  for (let i = s.pipes.length - 1; i >= 0; i--) {
    const pipe = s.pipes[i]!;
    pipe.x -= SCROLL;
  }

  s.until -= SCROLL;
  if (s.until <= 0) {
    const space = s.space;
    s.until += space;
    spawn(s, W + s.until - space);
  }

  const row = s.birdY | 0;
  let hit = row >= PLAY;
  for (let i = s.pipes.length - 1; i >= 0; i--) {
    const pipe = s.pipes[i]!;
    const left = Math.floor(pipe.x);
    if (!pipe.scored && left + PIPE_W <= BIRD_X) {
      pipe.scored = true;
      if (s.score < 0xffff) s.score++;
      if (s.score > s.best) s.best = s.score;
      sound(cues, Cue.Score);
    }
    if (left + PIPE_W <= 0) {
      s.pipes.splice(i, 1);
      continue;
    }
    if (row >= 0 && BIRD_X >= left && BIRD_X < left + PIPE_W) {
      if (row < pipe.gap || row >= pipe.gap + pipe.open) hit = true;
    }
  }
  if (hit) {
    s.phase = "dead";
    s.hop.length = 0;
    sound(cues, Cue.Hit);
  }
}

function label(out: Surface, y: number, text: string): void {
  out.writeText(((out.w - text.length) / 2) | 0, y, text, Color.BrightWhite, Color.Blue);
}

function draw(s: State, out: Surface): void {
  out.fill(SKY);
  for (let i = 0; i < s.pipes.length; i++) {
    const pipe = s.pipes[i]!;
    const left = Math.floor(pipe.x);
    for (let dx = 0; dx < PIPE_W; dx++) {
      const col = left + dx;
      if (col < 0 || col >= out.w) continue;
      for (let row = 0; row < PLAY; row++) {
        if (row >= pipe.gap && row < pipe.gap + pipe.open) continue;
        const lip = row === pipe.gap - 1 || row === pipe.gap + pipe.open;
        out.set(col, row, lip ? LIP : PIPE);
      }
    }
  }
  for (let x = 0; x < out.w; x++) {
    out.set(x, PLAY, GROUND_TOP);
    for (let y = PLAY + 1; y < out.h; y++) out.set(x, y, GROUND_BOT);
  }

  let row = s.birdY | 0;
  if (row < 0) row = 0;
  if (row >= out.h) row = out.h - 1;
  const bird =
    s.phase === "dead" ? BIRD_DEAD : (s.wing & 8) !== 0 ? BIRD_UP : BIRD;
  out.set(BIRD_X, row, bird);

  const score = String(s.score);
  out.writeText(1, 0, score, Color.BrightWhite, Color.Blue);
  if (s.best > 0) {
    const hi = `HI ${s.best}`;
    out.writeText(out.w - hi.length - 1, 0, hi, Color.BrightWhite, Color.Blue);
  }
  if (s.phase === "ready") label(out, 16, "SPACE");
  else if (s.phase === "dead") label(out, 16, "DEAD");
}

function quant(n: number): number {
  const v = Math.round(n * Q);
  if (v > 32767) return 32767;
  if (v < -32768) return -32768;
  return v;
}

function writeI16(out: Uint8Array, i: number, n: number): void {
  out[i] = n & 0xff;
  out[i + 1] = (n >> 8) & 0xff;
}

function readI16(buf: Uint8Array, i: number): number {
  return (buf[i]! | (buf[i + 1]! << 8)) << 16 >> 16;
}

function writeU16(out: Uint8Array, i: number, n: number): void {
  out[i] = n & 0xff;
  out[i + 1] = (n >>> 8) & 0xff;
}

function readU16(buf: Uint8Array, i: number): number {
  return buf[i]! | (buf[i + 1]! << 8);
}

function writeState(s: State, out: Uint8Array): number {
  if (out.length < PAYLOAD) return PAYLOAD;
  out.fill(0, 0, PAYLOAD);
  out[0] = SAVE_VER;
  out[1] = s.phase === "ready" ? 0 : s.phase === "run" ? 1 : 2;
  writeU16(out, 2, s.score);
  writeU16(out, 4, s.best);
  writeI16(out, 6, quant(s.birdY));
  writeI16(out, 8, quant(s.vy));
  writeI16(out, 10, quant(s.until));
  writeU16(out, 12, s.wing & 0xffff);
  out[14] = s.seed & 0xff;
  out[15] = (s.seed >>> 8) & 0xff;
  out[16] = (s.seed >>> 16) & 0xff;
  out[17] = (s.seed >>> 24) & 0xff;
  out[18] = s.gap;
  out[19] = s.open;
  out[20] = s.space;
  out[21] = s.pipes.length;
  for (let i = 0; i < s.pipes.length; i++) {
    const pipe = s.pipes[i]!;
    const at = HEAD + i * 4;
    writeI16(out, at, quant(pipe.x));
    out[at + 2] = pipe.gap;
    out[at + 3] = (pipe.open << 1) | (pipe.scored ? 1 : 0);
  }
  return PAYLOAD;
}

function readState(s: State, blob: Uint8Array, off: number, length: number): boolean {
  if (length !== PAYLOAD || off < 0 || off + length > blob.length) return false;
  if (blob[off] !== SAVE_VER) return false;
  const phaseN = blob[off + 1]!;
  const phase: Phase | null =
    phaseN === 0 ? "ready" : phaseN === 1 ? "run" : phaseN === 2 ? "dead" : null;
  if (!phase) return false;
  const score = readU16(blob, off + 2);
  const best = readU16(blob, off + 4);
  const birdY = readI16(blob, off + 6) / Q;
  const vy = readI16(blob, off + 8) / Q;
  const until = readI16(blob, off + 10) / Q;
  const wing = readU16(blob, off + 12);
  const seed =
    (blob[off + 14]! |
      (blob[off + 15]! << 8) |
      (blob[off + 16]! << 16) |
      (blob[off + 17]! << 24)) >>>
    0;
  const gap = blob[off + 18]!;
  const open = blob[off + 19]!;
  const space = blob[off + 20]!;
  const pipeN = blob[off + 21]!;
  if (pipeN > MAX_PIPES || open < OPEN_MIN || open > OPEN_MAX) return false;
  if (gap < GAP_MIN || gap > maxTop(open)) return false;
  if (space < SPACE_MIN || space > SPACE_MAX) return false;
  if (birdY < -1 || birdY > H || until < 0 || until > SPACE_MAX + 1) return false;
  if (score > best) return false;
  const pipes: Pipe[] = [];
  for (let i = 0; i < MAX_PIPES; i++) {
    const at = off + HEAD + i * 4;
    const x = readI16(blob, at) / Q;
    const pipeGap = blob[at + 2]!;
    const packed = blob[at + 3]!;
    const pipeOpen = packed >>> 1;
    const scored = packed & 1;
    if (i >= pipeN) {
      if (blob[at] !== 0 || blob[at + 1] !== 0 || pipeGap !== 0 || packed !== 0)
        return false;
      continue;
    }
    if (pipeOpen < OPEN_MIN || pipeOpen > OPEN_MAX) return false;
    if (pipeGap < GAP_MIN || pipeGap > maxTop(pipeOpen)) return false;
    if (x < -PIPE_W - 1 || x > W + SPACE_MAX) return false;
    pipes.push({ x, gap: pipeGap, open: pipeOpen, scored: scored === 1 });
  }
  s.phase = phase;
  s.score = score;
  s.best = best;
  s.birdY = birdY;
  s.vy = vy;
  s.until = until;
  s.wing = wing;
  s.seed = seed;
  s.gap = gap;
  s.open = open;
  s.space = space;
  s.pipes = pipes;
  return true;
}

function readKeys(input: InputQueue): { flap: boolean; quit: boolean } {
  let flap = false;
  let quit = false;
  for (let i = 0; i < input.length; i++) {
    const key = keyOf(input.at(i));
    if (key === Key.CtrlC) quit = true;
    else if (key === Key.Space) flap = true;
  }
  return { flap, quit };
}

export function createFlappyApp(): App {
  const state: State = {
    phase: "ready",
    birdY: START_Y,
    vy: 0,
    until: LEAD,
    seed: 1,
    wing: 0,
    score: 0,
    best: 0,
    gap: FIRST_GAP,
    open: GAP,
    space: SPACE_MIN,
    pipes: [],
    hop: [],
  };
  reset(state);

  return {
    size: { w: W, h: H },
    tick(input, engine: Engine, cues?: CueQueue) {
      const ev = readKeys(input);
      if (ev.quit) {
        engine.stop();
        return;
      }
      if (state.phase === "dead") {
        if (!ev.flap) {
          fall(state);
          return;
        }
        const best = state.best;
        reset(state);
        state.best = best;
        state.phase = "run";
        step(state, true, cues);
        return;
      }
      if (state.phase === "ready") {
        if (!ev.flap) {
          bob(state);
          return;
        }
        state.phase = "run";
      }
      step(state, ev.flap, cues);
    },
    view(out) {
      draw(state, out);
    },
    snapshot(out) {
      return writeState(state, out);
    },
    hydrate(blob, offset, length) {
      state.hop.length = 0;
      if (!readState(state, blob, offset, length)) reset(state);
    },
  };
}
