import {
  Attr,
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
import {
  fxAge,
  fxCovers,
  fxEaseOut,
  fxPopU,
  fxSlideAt,
  type Fx,
  type Slide,
} from "../fx.ts";

export const Cue = {
  Slide: 1,
  Merge: 2,
  Bump: 3,
  Win: 4,
  Over: 5,
  Pad: 6,
  PadWin: 7,
  Silence: 255,
} as const;

const N = 4;
const TW = 7;
const TH = 5;
const GAP = 1;
const PITCH_X = TW + GAP;
const PITCH_Y = TH + GAP;
const BOARD_W = GAP + N * PITCH_X;
const BOARD_H = GAP + N * PITCH_Y;
const GRID_H = BOARD_H + 2;
const CELLS = N * N;
const SLIDE_DUR = 9;
const SLIDE_SKIP = 1;
const POP_AT = SLIDE_DUR - SLIDE_SKIP - 1;
const SPAWN_DUR = 3;
const NUDGE_DUR = 5;
const SAVE = 29;
const SAVE_VER = 1;

const TILE_BG: readonly Color[] = [
  Color.BrightBlack,
  Color.White,
  Color.BrightWhite,
  Color.Yellow,
  Color.BrightYellow,
  Color.Red,
  Color.BrightRed,
  Color.Green,
  Color.BrightGreen,
  Color.Cyan,
  Color.BrightCyan,
  Color.Magenta,
  Color.BrightMagenta,
  Color.Blue,
  Color.BrightBlue,
];

type Phase = "play" | "over";

interface Body {
  value: number;
  grow: boolean;
}

interface Nudge {
  x: number;
  y: number;
  age: number;
  dur: number;
}

interface State {
  board: Uint32Array;
  score: number;
  best: number;
  scoreFrom: number;
  bestFrom: number;
  phase: Phase;
  won: boolean;
  fx: Fx<Body>[];
  pending: Key | 0;
  nudge: Nudge | null;
}

function isArrow(key: Key | 0): boolean {
  return (
    key === Key.Up || key === Key.Down || key === Key.Left || key === Key.Right
  );
}

function expOf(value: number): number {
  if (value <= 0) return 0;
  return 31 - Math.clz32(value);
}

function tileBg(exp: number): Color {
  if (exp < TILE_BG.length) return TILE_BG[exp]!;
  return TILE_BG[11 + ((exp - 11) % 4)]!;
}

function tileFg(exp: number): Color {
  if (exp === 0) return Color.Default;
  if (exp <= 4 || (exp >= 7 && exp <= 10)) return Color.Black;
  return Color.BrightWhite;
}

function writeIndices(dir: Key, line: number, ix: number[]): void {
  if (dir === Key.Left) {
    const row = line * N;
    for (let x = 0; x < N; x++) ix[x] = row + x;
    return;
  }
  if (dir === Key.Right) {
    const row = line * N;
    for (let x = 0; x < N; x++) ix[x] = row + (N - 1 - x);
    return;
  }
  if (dir === Key.Up) {
    for (let y = 0; y < N; y++) ix[y] = y * N + line;
    return;
  }
  for (let y = 0; y < N; y++) ix[y] = (N - 1 - y) * N + line;
}

function pushSlide(
  fx: Fx<Body>[],
  from: number,
  to: number,
  value: number,
): void {
  fx.push({
    kind: "slide",
    from: { x: from % N, y: (from / N) | 0 },
    to: { x: to % N, y: (to / N) | 0 },
    delay: 0,
    dur: SLIDE_DUR,
    age: SLIDE_SKIP,
    body: { value, grow: false },
  });
}

function pushPop(
  fx: Fx<Body>[],
  at: number,
  value: number,
  delay: number,
  grow: boolean,
): void {
  fx.push({
    kind: "pop",
    at: { x: at % N, y: (at / N) | 0 },
    delay,
    dur: grow ? SPAWN_DUR : 1,
    age: 0,
    body: { value, grow },
  });
}

// Fresh merges do not chain. [4,4,8] becomes [8,8], not [16].
function slide(
  board: Uint32Array,
  dir: Key,
  fx: Fx<Body>[],
): { gained: number; moved: boolean } {
  const ix = [0, 0, 0, 0];
  let gained = 0;
  let moved = false;
  for (let line = 0; line < N; line++) {
    writeIndices(dir, line, ix);
    const src: number[] = [];
    for (let k = 0; k < N; k++) if (board[ix[k]!]!) src.push(ix[k]!);
    const out = [0, 0, 0, 0];
    let w = 0;
    for (let i = 0; i < src.length; i++) {
      const a = board[src[i]!]!;
      const b = i + 1 < src.length ? board[src[i + 1]!]! : 0;
      const dest = ix[w]!;
      if (b !== 0 && a === b) {
        const v = a * 2;
        out[w] = v;
        gained += v;
        pushSlide(fx, src[i]!, dest, a);
        pushSlide(fx, src[i + 1]!, dest, a);
        pushPop(fx, dest, v, POP_AT, false);
        i++;
      } else {
        out[w] = a;
        if (src[i] !== dest) pushSlide(fx, src[i]!, dest, a);
      }
      w++;
    }
    for (let k = 0; k < N; k++) {
      if (board[ix[k]!] !== out[k]!) moved = true;
      board[ix[k]!] = out[k]!;
    }
  }
  return { gained, moved };
}

function canMove(board: Uint32Array): boolean {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = board[y * N + x]!;
      if (v === 0) return true;
      if (x + 1 < N && board[y * N + x + 1] === v) return true;
      if (y + 1 < N && board[(y + 1) * N + x] === v) return true;
    }
  }
  return false;
}

function has2048(board: Uint32Array): boolean {
  for (let i = 0; i < CELLS; i++) if (board[i]! >= 2048) return true;
  return false;
}

function pickEmpty(board: Uint32Array): number {
  let free = 0;
  for (let i = 0; i < CELLS; i++) if (board[i] === 0) free++;
  if (free === 0) return -1;
  let k = (Math.random() * free) | 0;
  for (let i = 0; i < CELLS; i++) {
    if (board[i] !== 0) continue;
    if (k === 0) return i;
    k--;
  }
  return -1;
}

function spawn(state: State, delay: number): void {
  const i = pickEmpty(state.board);
  if (i < 0) return;
  const value = Math.random() < 0.9 ? 2 : 4;
  state.board[i] = value;
  pushPop(state.fx, i, value, delay, true);
}

function reset(state: State, keepBest: boolean): void {
  const best = keepBest ? state.best : 0;
  state.board.fill(0);
  state.score = 0;
  state.best = best;
  state.scoreFrom = 0;
  state.bestFrom = best;
  state.phase = "play";
  state.won = false;
  state.fx.length = 0;
  state.pending = 0;
  state.nudge = null;
  spawn(state, 0);
  spawn(state, 0);
}

function sliding(fx: readonly Fx<Body>[]): boolean {
  for (let i = 0; i < fx.length; i++) if (fx[i]!.kind === "slide") return true;
  return false;
}

function sound(cues: CueQueue | undefined, id: number): void {
  cues?.push(id);
}

function themeOf(state: State): number {
  if (state.phase === "over") return Cue.Silence;
  if (state.won) return Cue.PadWin;
  return Cue.Pad;
}

function driveMusic(
  state: State,
  cues: CueQueue | undefined,
  lastTheme: { id: number },
): void {
  const next = themeOf(state);
  if (next === lastTheme.id) return;
  lastTheme.id = next;
  sound(cues, next);
}

function play(state: State, dir: Key, cues?: CueQueue): void {
  const moved = slide(state.board, dir, state.fx);
  if (!moved.moved) {
    sound(cues, Cue.Bump);
    state.nudge = nudgeBy(dir);
    return;
  }
  sound(cues, Cue.Slide);
  if (moved.gained > 0) sound(cues, Cue.Merge);
  state.nudge = null;
  state.scoreFrom = state.score;
  state.bestFrom = state.best;
  state.score += moved.gained;
  if (state.score > state.best) state.best = state.score;
  if (!state.won && has2048(state.board)) {
    state.won = true;
    sound(cues, Cue.Win);
  }
  spawn(state, POP_AT);
  if (!canMove(state.board)) {
    state.phase = "over";
    state.pending = 0;
    sound(cues, Cue.Over);
  }
}

function along(dist: number, t: number): number {
  if (t >= 1 || dist === 0) return dist;
  const u = fxEaseOut(t);
  const sign = dist < 0 ? -1 : 1;
  const mag = dist < 0 ? -dist : dist;
  const off = Math.round(mag * u);
  if (off <= 0) return 0;
  return sign * (off > mag ? mag : off);
}

function slideOrigin(fx: Slide<Body>): { x: number; y: number } | null {
  const at = fxSlideAt(fx);
  if (!at) return null;
  const sx = fx.to.x - fx.from.x;
  const sy = fx.to.y - fx.from.y;
  const t =
    sx !== 0 ? (at.x - fx.from.x) / sx : sy !== 0 ? (at.y - fx.from.y) / sy : 1;
  return {
    x: GAP + fx.from.x * PITCH_X + along(sx * PITCH_X, t),
    y: GAP + fx.from.y * PITCH_Y + along(sy * PITCH_Y, t),
  };
}

function paintTile(
  out: Surface,
  x0: number,
  y0: number,
  value: number,
  inset: number,
  attr: Attr,
): void {
  const tw = TW - inset * 2;
  const th = TH - inset * 2;
  if (tw <= 0 || th <= 0) return;
  const exp = expOf(value);
  const bg = tileBg(exp);
  const fg = tileFg(exp);
  x0 += inset;
  y0 += inset;
  const blank = packCell(0x20, fg, bg, attr);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) out.set(x0 + x, y0 + y, blank);
  }
  if (value === 0) return;
  const s = String(value);
  const x = x0 + ((tw - s.length) >> 1);
  const y = y0 + (th >> 1);
  for (let i = 0; i < s.length; i++) {
    const xx = x + i;
    if (xx < x0 || xx >= x0 + tw) continue;
    out.set(xx, y, packCell(s.charCodeAt(i) & 0xff, fg, bg, attr));
  }
}

function motionT(list: readonly Fx<Body>[]): number | null {
  for (let i = 0; i < list.length; i++) {
    const fx = list[i]!;
    if (fx.kind !== "slide") continue;
    const at = fxSlideAt(fx);
    if (!at) continue;
    const sx = fx.to.x - fx.from.x;
    const sy = fx.to.y - fx.from.y;
    if (sx !== 0) return (at.x - fx.from.x) / sx;
    if (sy !== 0) return (at.y - fx.from.y) / sy;
  }
  return null;
}

function shown(from: number, to: number, t: number | null): number {
  if (t === null) return to;
  return from + Math.round((to - from) * fxEaseOut(t));
}

function ageNudge(state: State): void {
  const nudge = state.nudge;
  if (!nudge) return;
  nudge.age++;
  if (nudge.age >= nudge.dur) state.nudge = null;
}

function nudgeBy(dir: Key): Nudge {
  const x = dir === Key.Left ? -1 : dir === Key.Right ? 1 : 0;
  const y = dir === Key.Up ? -1 : dir === Key.Down ? 1 : 0;
  return { x, y, age: 0, dur: NUDGE_DUR };
}

// Out and back. Peaks at 1 in the middle frame.
function nudgeOff(nudge: Nudge | null): { x: number; y: number } {
  if (!nudge || nudge.dur <= 1) return { x: 0, y: 0 };
  const t = nudge.age / (nudge.dur - 1);
  const mag = Math.round(4 * t * (1 - t));
  return { x: nudge.x * mag, y: nudge.y * mag };
}

function landed(state: State): boolean {
  if (!sliding(state.fx)) return true;
  const t = motionT(state.fx);
  return t !== null && t >= 1;
}

function statusLine(state: State): string {
  const done = landed(state);
  const mark = done && state.won ? "2048   " : "";
  const tail =
    done && state.phase === "over" ? "no moves   enter retry" : "arrows slide";
  return mark + tail;
}

function statusFg(state: State): Color {
  if (!landed(state)) return Color.Default;
  if (state.phase === "over") return Color.BrightRed;
  if (state.won) return Color.BrightYellow;
  return Color.Default;
}

function draw(state: State, out: Surface): void {
  out.fill(packCell(0x20, Color.Default, Color.Black));
  const bump = nudgeOff(state.nudge);
  const bumping = bump.x !== 0 || bump.y !== 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const covered = fxCovers(state.fx, x, y);
      const value = covered ? 0 : state.board[y * N + x]!;
      const x0 = GAP + x * PITCH_X;
      const y0 = GAP + y * PITCH_Y;
      if (bumping && value !== 0) {
        paintTile(out, x0, y0, 0, 0, Attr.None);
        paintTile(out, x0 + bump.x, y0 + bump.y, value, 0, Attr.None);
      } else {
        paintTile(out, x0, y0, value, 0, Attr.None);
      }
    }
  }
  for (let i = 0; i < state.fx.length; i++) {
    const fx = state.fx[i]!;
    if (fx.kind === "slide") {
      const at = slideOrigin(fx);
      if (at) paintTile(out, at.x, at.y, fx.body.value, 0, Attr.None);
    } else {
      const linear = fxPopU(fx);
      if (linear === null) continue;
      const u = fx.body.grow ? fxEaseOut(linear) : 1;
      const inset = fx.body.grow ? Math.round((1 - u) * 2) : 0;
      const attr = !fx.body.grow || u < 1 ? Attr.Inverse : Attr.None;
      paintTile(
        out,
        GAP + fx.at.x * PITCH_X + bump.x,
        GAP + fx.at.y * PITCH_Y + bump.y,
        fx.body.value,
        inset,
        attr,
      );
    }
  }
  const t = motionT(state.fx);
  const score = shown(state.scoreFrom, state.score, t);
  const best = shown(state.bestFrom, state.best, t);
  out.writeText(1, BOARD_H, `score ${score}  best ${best}`, Color.BrightWhite);
  out.writeText(1, BOARD_H + 1, statusLine(state), statusFg(state));
}

function readKeys(input: InputQueue): {
  quit: boolean;
  retry: boolean;
  dir: Key | 0;
} {
  let quit = false;
  let retry = false;
  let dir: Key | 0 = 0;
  for (let i = 0; i < input.length; i++) {
    const key = keyOf(input.at(i));
    if (key === Key.CtrlC) quit = true;
    else if (key === Key.Enter) retry = true;
    else if (isArrow(key)) dir = key;
  }
  return { quit, retry, dir };
}

function writeU32(out: Uint8Array, i: number, v: number): void {
  out[i] = v & 0xff;
  out[i + 1] = (v >>> 8) & 0xff;
  out[i + 2] = (v >>> 16) & 0xff;
  out[i + 3] = (v >>> 24) & 0xff;
}

function readU32(buf: Uint8Array, i: number): number {
  return (
    (buf[i]! |
      (buf[i + 1]! << 8) |
      (buf[i + 2]! << 16) |
      (buf[i + 3]! << 24)) >>>
    0
  );
}

function writeState(state: State, out: Uint8Array): number {
  if (out.length < SAVE) return SAVE;
  out[0] = SAVE_VER;
  out[1] = state.phase === "over" ? 1 : 0;
  out[2] = state.won ? 1 : 0;
  // Bytes 3 and 12 were the spawn highlight. Old saves still load; effects do not.
  out[3] = 255;
  writeU32(out, 4, state.score);
  writeU32(out, 8, state.best);
  out[12] = 0;
  for (let i = 0; i < CELLS; i++) out[13 + i] = expOf(state.board[i]!);
  return SAVE;
}

function readState(
  state: State,
  blob: Uint8Array,
  off: number,
  length: number,
): boolean {
  if (length !== SAVE || off < 0 || off + SAVE > blob.length) return false;
  if (blob[off] !== SAVE_VER) return false;
  const phase = blob[off + 1]!;
  const won = blob[off + 2]!;
  const born = blob[off + 3]!;
  if (phase > 1 || won > 1) return false;
  if (born !== 255 && born >= CELLS) return false;
  const score = readU32(blob, off + 4);
  const best = readU32(blob, off + 8);
  const board = new Uint32Array(CELLS);
  for (let i = 0; i < CELLS; i++) {
    const exp = blob[off + 13 + i]!;
    if (exp > 26) return false;
    board[i] = exp === 0 ? 0 : 2 ** exp;
  }
  state.board.set(board);
  state.score = score;
  state.best = score > best ? score : best;
  state.scoreFrom = state.score;
  state.bestFrom = state.best;
  state.nudge = null;
  state.phase = phase === 1 || !canMove(state.board) ? "over" : "play";
  state.won = won === 1 || has2048(state.board);
  state.fx.length = 0;
  state.pending = 0;
  return true;
}

export function createGame2048App(): App {
  const state: State = {
    board: new Uint32Array(CELLS),
    score: 0,
    best: 0,
    scoreFrom: 0,
    bestFrom: 0,
    phase: "play",
    won: false,
    fx: [],
    pending: 0,
    nudge: null,
  };
  const lastTheme = { id: 0 };
  reset(state, false);

  return {
    size: { w: BOARD_W, h: GRID_H },
    tick(input, engine: Engine, cues?: CueQueue) {
      fxAge(state.fx);
      ageNudge(state);
      const keys = readKeys(input);
      if (keys.quit) {
        engine.stop();
        return;
      }
      if (state.phase === "over") {
        if (keys.retry) reset(state, true);
      } else {
        if (keys.dir) state.pending = keys.dir;
        if (!sliding(state.fx) && state.pending) {
          state.fx.length = 0;
          const dir = state.pending;
          state.pending = 0;
          play(state, dir, cues);
        }
      }
      driveMusic(state, cues, lastTheme);
    },
    view(out) {
      draw(state, out);
    },
    snapshot(out) {
      return writeState(state, out);
    },
    hydrate(blob, offset, length) {
      state.fx.length = 0;
      state.pending = 0;
      state.nudge = null;
      if (!readState(state, blob, offset, length)) reset(state, false);
    },
  };
}
