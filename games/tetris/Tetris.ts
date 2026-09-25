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
} from "tinycell";
import { fxShakeAt, fxShift, type Shake } from "tinycell/fx";

export const Cue = {
  Move: 1,
  Rotate: 2,
  Lock: 3,
  Clear: 4,
  Tetris: 5,
  Drop: 6,
  Over: 7
  Shake: 16,
  Tune0: 8,
  Tune1: 9,
  Tune2: 10,
  Tune3: 11,
  Tune4: 12,
  Tune5: 13,
  Tune6: 14,
  Tune7: 15,
  Silence: 255,
} as const;

const TUNE = [
  Cue.Tune0,
  Cue.Tune1,
  Cue.Tune2,
  Cue.Tune3,
  Cue.Tune4,
  Cue.Tune5,
  Cue.Tune6,
  Cue.Tune7,
] as const;
const TUNE_EVERY = 6;

const COLS = 10;
const ROWS = 20;
const OX = 1;
const OY = 1;
const PANEL = 14;
const W = OX + COLS + 1 + 1 + PANEL;
const H = OY + ROWS + 1;
const PX = OX + COLS + 2;

const NONE = 255;
const KINDS = 7;
const LOCK = 8;
const CLEAR_DUR = 6;
const DAS = 4;
const ARR = 2;
const MAX_RESETS = 12;
const LINE = [0, 100, 300, 500, 800] as const;

const SAVE_VER = 1;
const BOARD_AT = 37;
const SAVE = BOARD_AT + COLS * ROWS;

const PIECE: readonly Color[] = [
  Color.Cyan,
  Color.Yellow,
  Color.Magenta,
  Color.Green,
  Color.Red,
  Color.Blue,
  Color.BrightYellow,
];

// Four rotations, eight bytes each: x,y pairs inside a 4×4.
const SHAPES: readonly (readonly number[])[] = [
  [0, 1, 1, 1, 2, 1, 3, 1, 2, 0, 2, 1, 2, 2, 2, 3, 0, 2, 1, 2, 2, 2, 3, 2, 1, 0, 1, 1, 1, 2, 1, 3],
  [1, 0, 2, 0, 1, 1, 2, 1, 1, 0, 2, 0, 1, 1, 2, 1, 1, 0, 2, 0, 1, 1, 2, 1, 1, 0, 2, 0, 1, 1, 2, 1],
  [1, 0, 0, 1, 1, 1, 2, 1, 1, 0, 1, 1, 2, 1, 1, 2, 0, 1, 1, 1, 2, 1, 1, 2, 1, 0, 0, 1, 1, 1, 1, 2],
  [1, 0, 2, 0, 0, 1, 1, 1, 1, 0, 1, 1, 2, 1, 2, 2, 1, 1, 2, 1, 0, 2, 1, 2, 0, 0, 0, 1, 1, 1, 1, 2],
  [0, 0, 1, 0, 1, 1, 2, 1, 2, 0, 1, 1, 2, 1, 1, 2, 0, 1, 1, 1, 1, 2, 2, 2, 1, 0, 0, 1, 1, 1, 0, 2],
  [0, 0, 0, 1, 1, 1, 2, 1, 1, 0, 2, 0, 1, 1, 1, 2, 0, 1, 1, 1, 2, 1, 2, 2, 1, 0, 1, 1, 0, 2, 1, 2],
  [2, 0, 0, 1, 1, 1, 2, 1, 1, 0, 1, 1, 1, 2, 2, 2, 0, 1, 1, 1, 2, 1, 0, 2, 0, 0, 1, 0, 1, 1, 1, 2],
];

const FRAME = packCell(0x20, Color.Default, Color.BrightBlack);
const DOT = packCell(0x2e, Color.BrightBlack, Color.Black);
const FLASH = packCell(0x20, Color.Black, Color.BrightWhite);
const VOID = packCell(0x20, Color.Default, Color.Black);

type Phase = "idle" | "play" | "over";

interface State {
  board: Uint8Array;
  phase: Phase;
  kind: number;
  rot: number;
  x: number;
  y: number;
  next: number;
  bag: Uint8Array;
  bagAt: number;
  level: number;
  lines: number;
  score: number;
  best: number;
  grav: number;
  lock: number;
  resets: number;
  clearAge: number;
  clearBits: number;
  tuneStep: number;
  shiftDir: number;
  shiftArm: number;
  shake: Shake | null;
}

function each(
  kind: number,
  rot: number,
  x: number,
  y: number,
  fn: (cx: number, cy: number) => void,
): void {
  const cells = SHAPES[kind]!;
  const o = (rot & 3) * 8;
  for (let i = 0; i < 8; i += 2) fn(x + cells[o + i]!, y + cells[o + i + 1]!);
}

function fits(s: State, x: number, y: number, rot: number): boolean {
  let ok = true;
  each(s.kind, rot, x, y, (cx, cy) => {
    if (!ok) return;
    if (cx < 0 || cx >= COLS || cy >= ROWS) ok = false;
    else if (cy >= 0 && s.board[cy * COLS + cx] !== 0) ok = false;
  });
  return ok;
}

function shuffle(bag: Uint8Array): void {
  for (let i = 0; i < KINDS; i++) bag[i] = i;
  for (let i = KINDS - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = bag[i]!;
    bag[i] = bag[j]!;
    bag[j] = t;
  }
}

function pull(s: State): number {
  if (s.bagAt >= KINDS) {
    shuffle(s.bag);
    s.bagAt = 0;
  }
  return s.bag[s.bagAt++]!;
}

function addScore(s: State, n: number): void {
  if (n <= 0) return;
  s.score += n;
  if (s.score > s.best) s.best = s.score;
}

function sound(cues: CueQueue | undefined, id: number): void {
  cues?.push(id);
}

function spawn(s: State, cues?: CueQueue): void {
  s.kind = s.next;
  s.rot = 0;
  s.x = 3;
  s.y = 0;
  s.next = pull(s);
  s.resets = 0;
  s.grav = 0;
  s.lock = LOCK;
  s.shiftDir = 0;
  s.shiftArm = 0;
  if (!fits(s, s.x, s.y, s.rot)) {
    s.phase = "over";
    sound(cues, Cue.Over);
  }
}

function reset(s: State, keepBest: boolean): void {
  const best = keepBest ? s.best : 0;
  s.board.fill(0);
  s.phase = keepBest ? "play" : "idle";
  s.level = 0;
  s.lines = 0;
  s.score = 0;
  s.best = best;
  s.grav = 0;
  s.lock = LOCK;
  s.resets = 0;
  s.clearAge = 0;
  s.clearBits = 0;
  s.tuneStep = 0;
  s.shiftDir = 0;
  s.shiftArm = 0;
  s.shake = null;
  shuffle(s.bag);
  s.bagAt = 0;
  s.next = pull(s);
  spawn(s);
}

function dropEvery(level: number): number {
  const n = 16 - level * 2;
  return n < 1 ? 1 : n;
}

function stamp(s: State): void {
  const mark = s.kind + 1;
  each(s.kind, s.rot, s.x, s.y, (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;
    s.board[cy * COLS + cx] = mark;
  });
}

function fullBits(s: State): number {
  let bits = 0;
  for (let y = 0; y < ROWS; y++) {
    let full = true;
    for (let x = 0; x < COLS; x++) {
      if (s.board[y * COLS + x] === 0) full = false;
    }
    if (full) bits |= 1 << y;
  }
  return bits;
}

function bitCount(bits: number): number {
  let n = 0;
  for (let y = 0; y < ROWS; y++) if ((bits & (1 << y)) !== 0) n++;
  return n;
}

function commit(s: State, cues?: CueQueue): void {
  stamp(s);
  const bits = fullBits(s);
  const n = bitCount(bits);
  s.kind = NONE;
  if (n > 0) {
    s.clearBits = bits;
    s.clearAge = CLEAR_DUR;
    s.shake = { amp: n >= 4 ? 2 : 1, delay: 0, dur: 4, age: 0 };
    sound(cues, Cue.Shake);
    sound(cues, n === 4 ? Cue.Tetris : Cue.Clear);
    return;
  }
  sound(cues, Cue.Lock);
  spawn(s, cues);
}

function finishClear(s: State, cues?: CueQueue): void {
  const kept = new Uint8Array(COLS * ROWS);
  let dst = ROWS - 1;
  const n = bitCount(s.clearBits);
  for (let y = ROWS - 1; y >= 0; y--) {
    if ((s.clearBits & (1 << y)) !== 0) continue;
    for (let x = 0; x < COLS; x++) kept[dst * COLS + x] = s.board[y * COLS + x]!;
    dst--;
  }
  s.board.set(kept);
  s.clearBits = 0;
  addScore(s, LINE[n]! * (s.level + 1));
  s.lines += n;
  const level = (s.lines / 10) | 0;
  s.level = level > 15 ? 15 : level;
  spawn(s, cues);
}

function tryMove(s: State, x: number, y: number, rot: number): boolean {
  if (!fits(s, x, y, rot)) return false;
  s.x = x;
  s.y = y;
  s.rot = rot;
  return true;
}

function hardDrop(s: State, cues?: CueQueue): void {
  let y = s.y;
  while (fits(s, s.x, y + 1, s.rot)) y++;
  const dist = y - s.y;
  if (dist > 0) {
    s.y = y;
    addScore(s, dist * 2);
    sound(cues, Cue.Drop);
  }
  commit(s, cues);
}

function readKeys(input: InputQueue): {
  quit: boolean;
  retry: boolean;
  left: boolean;
  right: boolean;
  down: boolean;
  rot: boolean;
  drop: boolean;
} {
  let quit = false;
  let retry = false;
  let left = false;
  let right = false;
  let down = false;
  let rot = false;
  let drop = false;
  let horiz = 0;
  for (let i = 0; i < input.length; i++) {
    const key = keyOf(input.at(i));
    if (key === Key.CtrlC) quit = true;
    else if (key === Key.Enter) retry = true;
    else if (key === Key.Left) {
      left = true;
      horiz = -1;
    } else if (key === Key.Right) {
      right = true;
      horiz = 1;
    } else if (key === Key.Down) down = true;
    else if (key === Key.Up) rot = true;
    else if (key === Key.Space) drop = true;
  }
  if (horiz === -1) right = false;
  else if (horiz === 1) left = false;
  else {
    left = false;
    right = false;
  }
  return { quit, retry, left, right, down, rot, drop };
}

function driveMusic(
  s: State,
  cues: CueQueue | undefined,
  silenced: { on: boolean },
): void {
  if (s.phase !== "play") {
    if (!silenced.on) {
      silenced.on = true;
      sound(cues, Cue.Silence);
    }
    return;
  }
  silenced.on = false;
  if (s.tuneStep % TUNE_EVERY === 0) {
    sound(cues, TUNE[(s.tuneStep / TUNE_EVERY) % TUNE.length]!);
  }
  s.tuneStep = (s.tuneStep + 1) & 0xffff;
}

function block(color: Color, attr: Attr = Attr.None) {
  return packCell(0x20, Color.Black, color, attr);
}

function paintMino(
  out: Surface,
  x: number,
  y: number,
  color: Color,
  attr: Attr = Attr.None,
): void {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
  out.set(OX + x, OY + y, block(color, attr));
}

function paintShape(
  out: Surface,
  kind: number,
  rot: number,
  x: number,
  y: number,
  attr: Attr,
): void {
  each(kind, rot, x, y, (cx, cy) => paintMino(out, cx, cy, PIECE[kind]!, attr));
}

function paintGhost(
  out: Surface,
  kind: number,
  rot: number,
  x: number,
  y: number,
): void {
  const cell = packCell(0x25a1, PIECE[kind]!, Color.Black);
  each(kind, rot, x, y, (cx, cy) => {
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;
    out.set(OX + cx, OY + cy, cell);
  });
}

function paintPreview(out: Surface, kind: number): void {
  const cells = SHAPES[kind]!;
  const color = block(PIECE[kind]!);
  for (let i = 0; i < 8; i += 2) out.set(PX + cells[i]!, 14 + cells[i + 1]!, color);
}

function clearing(s: State, y: number): boolean {
  return s.clearAge > 0 && (s.clearBits & (1 << y)) !== 0;
}

function draw(s: State, out: Surface): void {
  out.fill(VOID);
  for (let y = 0; y < ROWS + 2; y++) {
    for (let x = 0; x < COLS + 2; x++) {
      const edge = x === 0 || y === 0 || x === COLS + 1 || y === ROWS + 1;
      out.set(x, y, edge ? FRAME : DOT);
    }
  }
  for (let y = 0; y < ROWS; y++) {
    const flash = clearing(s, y) && (s.clearAge & 1) === 0;
    for (let x = 0; x < COLS; x++) {
      if (flash) {
        out.set(OX + x, OY + y, FLASH);
        continue;
      }
      const v = s.board[y * COLS + x]!;
      if (v !== 0) paintMino(out, x, y, PIECE[v - 1]!);
    }
  }
  if (s.kind !== NONE && s.clearAge === 0) {
    if (s.phase === "play") {
      let gy = s.y;
      while (fits(s, s.x, gy + 1, s.rot)) gy++;
      if (gy !== s.y) paintGhost(out, s.kind, s.rot, s.x, gy);
    }
    paintShape(out, s.kind, s.rot, s.x, s.y, Attr.None);
  }
  const label = Color.BrightBlack;
  const value = Color.BrightWhite;
  out.writeText(PX, 1, "SCORE", label);
  out.writeText(PX, 2, String(s.score), value);
  out.writeText(PX, 4, "BEST", label);
  out.writeText(PX, 5, String(s.best), value);
  out.writeText(PX, 7, "LINES", label);
  out.writeText(PX, 8, String(s.lines), value);
  out.writeText(PX, 10, "LEVEL", label);
  out.writeText(PX, 11, String(s.level + 1), value);
  out.writeText(PX, 13, "NEXT", label);
  paintPreview(out, s.next);
  if (s.phase === "over") {
    out.writeText(OX + 1, OY + 9, "GAME OVER", Color.BrightRed);
    out.writeText(PX, 19, "game over", Color.BrightRed);
    out.writeText(PX, 20, "enter retry", Color.BrightWhite);
  } else if (s.phase === "idle") {
    out.writeText(OX + 2, OY + 9, "READY", Color.BrightWhite);
    out.writeText(PX, 19, "any key", Color.BrightWhite);
    out.writeText(PX, 20, "to start", Color.Default);
  } else {
    out.writeText(PX, 19, "arrows move", Color.Default);
    out.writeText(PX, 20, "up / space", Color.Default);
  }
}

function writeU16(out: Uint8Array, i: number, v: number): void {
  out[i] = v & 0xff;
  out[i + 1] = (v >>> 8) & 0xff;
}

function writeU32(out: Uint8Array, i: number, v: number): void {
  out[i] = v & 0xff;
  out[i + 1] = (v >>> 8) & 0xff;
  out[i + 2] = (v >>> 16) & 0xff;
  out[i + 3] = (v >>> 24) & 0xff;
}

function readU16(buf: Uint8Array, i: number): number {
  return buf[i]! | (buf[i + 1]! << 8);
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

function writeState(s: State, out: Uint8Array): number {
  if (out.length < SAVE) return SAVE;
  out[0] = SAVE_VER;
  out[1] = s.phase === "over" ? 1 : s.phase === "idle" ? 2 : 0;
  out[2] = s.kind;
  out[3] = s.rot & 3;
  out[4] = (s.x + 8) & 0xff;
  out[5] = (s.y + 8) & 0xff;
  out[6] = s.next;
  out[7] = s.bagAt;
  out.set(s.bag, 8);
  out[15] = s.level;
  writeU16(out, 16, s.lines);
  writeU32(out, 18, s.score);
  writeU32(out, 22, s.best);
  out[26] = s.grav;
  out[27] = s.lock;
  out[28] = s.resets;
  out[29] = s.clearAge;
  out[30] = s.clearBits & 0xff;
  out[31] = (s.clearBits >>> 8) & 0xff;
  out[32] = (s.clearBits >>> 16) & 0xff;
  writeU16(out, 33, s.tuneStep);
  out[35] = s.shiftDir < 0 ? 2 : s.shiftDir;
  out[36] = s.shiftArm;
  out.set(s.board, BOARD_AT);
  return SAVE;
}

function readState(s: State, blob: Uint8Array, off: number, length: number): boolean {
  if (length !== SAVE || off < 0 || off + SAVE > blob.length) return false;
  if (blob[off] !== SAVE_VER) return false;
  const phase = blob[off + 1]!;
  const kind = blob[off + 2]!;
  const rot = blob[off + 3]!;
  const x = blob[off + 4]! - 8;
  const y = blob[off + 5]! - 8;
  const next = blob[off + 6]!;
  const bagAt = blob[off + 7]!;
  if (phase > 2 || rot > 3 || next >= KINDS || bagAt > KINDS) return false;
  if (kind !== NONE && kind >= KINDS) return false;
  if (x < -2 || x > COLS || y < -2 || y > ROWS) return false;
  const bag = blob.subarray(off + 8, off + 15);
  const seen = new Uint8Array(KINDS);
  for (let i = 0; i < KINDS; i++) {
    const v = bag[i]!;
    if (v >= KINDS || seen[v]) return false;
    seen[v] = 1;
  }
  const level = blob[off + 15]!;
  if (level > 15) return false;
  const clearAge = blob[off + 29]!;
  if (clearAge > CLEAR_DUR) return false;
  const board = blob.subarray(off + BOARD_AT, off + SAVE);
  for (let i = 0; i < board.length; i++) if (board[i]! > KINDS) return false;
  const shiftDir = blob[off + 35]!;
  const shiftArm = blob[off + 36]!;
  if (shiftDir > 2 || shiftArm > DAS) return false;
  s.phase = phase === 1 ? "over" : phase === 2 ? "idle" : "play";
  s.kind = kind;
  s.rot = rot;
  s.x = x;
  s.y = y;
  s.next = next;
  s.bag.set(bag);
  s.bagAt = bagAt;
  s.level = level;
  s.lines = readU16(blob, off + 16);
  s.score = readU32(blob, off + 18);
  s.best = readU32(blob, off + 22);
  if (s.score > s.best) s.best = s.score;
  s.grav = blob[off + 26]!;
  s.lock = blob[off + 27]!;
  s.resets = blob[off + 28]!;
  s.clearAge = clearAge;
  s.clearBits =
    blob[off + 30]! | (blob[off + 31]! << 8) | (blob[off + 32]! << 16);
  s.tuneStep = readU16(blob, off + 33);
  s.shiftDir = shiftDir === 2 ? -1 : shiftDir;
  s.shiftArm = shiftArm;
  s.board.set(board);
  s.shake = null;
  return true;
}

function shakeBoard(out: Surface, src: Uint32Array, dst: Uint32Array, dx: number, dy: number): void {
  const bw = COLS + 2 < out.w ? COLS + 2 : out.w;
  const bh = ROWS + 2 < out.h ? ROWS + 2 : out.h;
  const n = bw * bh;
  for (let y = 0; y < bh; y++) {
    src.set(out.cells.subarray(y * out.w, y * out.w + bw), y * bw);
  }
  fxShift(src.subarray(0, n), dst.subarray(0, n), bw, bh, dx, dy, VOID);
  for (let y = 0; y < bh; y++) {
    out.cells.set(dst.subarray(y * bw, y * bw + bw), y * out.w);
  }
}

function ageShake(s: State): void {
  const shake = s.shake;
  if (!shake) return;
  shake.age++;
  if (shake.age >= shake.delay + shake.dur) s.shake = null;
}

export function createTetrisApp(): App {
  const state: State = {
    board: new Uint8Array(COLS * ROWS),
    phase: "play",
    kind: 0,
    rot: 0,
    x: 3,
    y: 0,
    next: 0,
    bag: new Uint8Array(KINDS),
    bagAt: 0,
    level: 0,
    lines: 0,
    score: 0,
    best: 0,
    grav: 0,
    lock: LOCK,
    resets: 0,
    clearAge: 0,
    clearBits: 0,
    tuneStep: 0,
    shiftDir: 0,
    shiftArm: 0,
    shake: null,
  };
  let scratch = new Uint32Array(0);
  const silenced = { on: false };
  reset(state, false);

  return {
    size: { w: W, h: H },
    tick(input, engine: Engine, cues?: CueQueue) {
      ageShake(state);
      const keys = readKeys(input);
      if (keys.quit) {
        engine.stop();
        return;
      }
      if (state.phase === "over") {
        if (keys.retry) reset(state, true);
        driveMusic(state, cues, silenced);
        return;
      }
      if (state.phase === "idle") {
        const start =
          keys.left || keys.right || keys.down || keys.rot || keys.drop || keys.retry;
        if (!start) {
          driveMusic(state, cues, silenced);
          return;
        }
        state.phase = "play";
      }
      if (state.clearAge > 0) {
        state.clearAge--;
        if (state.clearAge === 0) finishClear(state, cues);
        driveMusic(state, cues, silenced);
        return;
      }
      if (state.kind === NONE || !fits(state, state.x, state.y, state.rot)) {
        state.phase = "over";
        sound(cues, Cue.Over);
        driveMusic(state, cues, silenced);
        return;
      }

      const dir = keys.left ? -1 : keys.right ? 1 : 0;
      let refreshed = false;
      const nudge = (): void => {
        if (fits(state, state.x, state.y + 1, state.rot)) return;
        if (state.resets >= MAX_RESETS) return;
        state.lock = LOCK;
        state.resets++;
        refreshed = true;
      };

      if (dir === 0) {
        state.shiftDir = 0;
        state.shiftArm = 0;
      } else if (dir !== state.shiftDir) {
        state.shiftDir = dir;
        if (tryMove(state, state.x + dir, state.y, state.rot)) {
          sound(cues, Cue.Move);
          nudge();
        }
        state.shiftArm = DAS;
      } else if (state.shiftArm === 0) {
        if (tryMove(state, state.x + dir, state.y, state.rot)) {
          sound(cues, Cue.Move);
          nudge();
        }
        state.shiftArm = ARR;
      } else {
        state.shiftArm--;
      }

      if (keys.rot) {
        const rot = (state.rot + 1) & 3;
        const kicks = [
          [0, 0],
          [-1, 0],
          [1, 0],
          [0, -1],
          [-2, 0],
          [2, 0],
        ];
        for (let i = 0; i < kicks.length; i++) {
          const kick = kicks[i]!;
          if (tryMove(state, state.x + kick[0]!, state.y + kick[1]!, rot)) {
            sound(cues, Cue.Rotate);
            nudge();
            break;
          }
        }
      }

      if (keys.drop) {
        hardDrop(state, cues);
      } else if (
        keys.down &&
        tryMove(state, state.x, state.y + 1, state.rot)
      ) {
        addScore(state, 1);
        state.grav = 0;
      } else {
        state.grav++;
        if (state.grav >= dropEvery(state.level)) {
          state.grav = 0;
          tryMove(state, state.x, state.y + 1, state.rot);
        }
      }

      if (state.phase === "play" && state.clearAge === 0 && state.kind !== NONE) {
        if (!fits(state, state.x, state.y + 1, state.rot)) {
          if (!refreshed) state.lock--;
          if (state.lock <= 0) commit(state, cues);
        } else {
          state.lock = LOCK;
        }
      }
      driveMusic(state, cues, silenced);
    },
    view(out) {
      draw(state, out);
      const off = state.shake ? fxShakeAt(state.shake) : null;
      if (!off || (off.x === 0 && off.y === 0)) return;
      const n = (COLS + 2) * (ROWS + 2);
      if (scratch.length < n * 2) scratch = new Uint32Array(n * 2);
      shakeBoard(out, scratch.subarray(0, n), scratch.subarray(n, n * 2), off.x, off.y);
    },
    snapshot(out) {
      return writeState(state, out);
    },
    hydrate(blob, offset, length) {
      if (!readState(state, blob, offset, length)) reset(state, false);
    },
  };
}
