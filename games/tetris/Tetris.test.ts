import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Color,
  CueQueue,
  InputQueue,
  Key,
  Surface,
  cellBg,
  cellChar,
  keyEvent,
  type App,
  type Engine,
} from "tinycell";
import { Cue, createTetrisApp } from "./Tetris.ts";

const engine = { stop() {} } as Engine;
const COLS = 10;
const ROWS = 20;
const SAVE = 237;
const BOARD = 37;

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
    (buf[i]! | (buf[i + 1]! << 8) | (buf[i + 2]! << 16) | (buf[i + 3]! << 24)) >>>
    0
  );
}

function encode(opts: {
  kind?: number;
  rot?: number;
  x?: number;
  y?: number;
  lock?: number;
  score?: number;
  best?: number;
  phase?: number;
  board?: (x: number, y: number) => number;
}): Uint8Array {
  const out = new Uint8Array(SAVE);
  out[0] = 1;
  out[1] = opts.phase ?? 0;
  out[2] = opts.kind ?? 0;
  out[3] = opts.rot ?? 0;
  out[4] = (opts.x ?? 3) + 8;
  out[5] = (opts.y ?? 0) + 8;
  out[6] = 1;
  out[7] = 0;
  for (let i = 0; i < 7; i++) out[8 + i] = i;
  out[27] = opts.lock ?? 8;
  writeU32(out, 18, opts.score ?? 0);
  writeU32(out, 22, opts.best ?? 0);
  const paint = opts.board;
  if (paint) {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) out[BOARD + y * COLS + x] = paint(x, y);
    }
  }
  return out;
}

function load(app: App, opts: Parameters<typeof encode>[0]): void {
  const blob = encode(opts);
  app.hydrate(blob, 0, blob.length);
}

function snap(app: App): Uint8Array {
  const n = app.snapshot(new Uint8Array(0));
  const buf = new Uint8Array(n);
  assert.equal(app.snapshot(buf), n);
  return buf;
}

function heard(app: App, key: Key | null): number[] {
  const input = new InputQueue();
  if (key) input.push(keyEvent(key));
  const cues = new CueQueue();
  app.tick(input, engine, cues);
  const ids: number[] = [];
  for (let i = 0; i < cues.length; i++) ids.push(cues.at(i));
  return ids;
}

function paint(app: App): Surface {
  const surface = new Surface(app.size.w, app.size.h);
  app.view(surface);
  return surface;
}

function cellsOf(app: App, bg: Color): Array<{ x: number; y: number }> {
  const surface = paint(app);
  const found: Array<{ x: number; y: number }> = [];
  for (let y = 1; y <= ROWS; y++) {
    for (let x = 1; x <= COLS; x++) {
      if (cellBg(surface.cells[y * surface.w + x]!) === bg) found.push({ x, y });
    }
  }
  return found;
}

function minX(cells: Array<{ x: number }>): number {
  let x = COLS;
  for (const cell of cells) if (cell.x < x) x = cell.x;
  return x;
}

test("idle holds the piece until a key", () => {
  const app = createTetrisApp();
  const first = snap(app);
  assert.equal(first[1], 2);
  for (let i = 0; i < 40; i++) heard(app, null);
  const held = snap(app);
  assert.equal(held[1], 2);
  assert.equal(held[4], first[4]);
  assert.equal(held[5], first[5]);
  heard(app, Key.Left);
  const moved = snap(app);
  assert.equal(moved[1], 0);
  assert.notEqual(moved[4], first[4]);
});

test("left shifts the falling piece", () => {
  const app = createTetrisApp();
  load(app, { kind: 2, x: 4, y: 5, lock: 8 });
  const before = minX(cellsOf(app, Color.Magenta));
  const ids = heard(app, Key.Left);
  assert.equal(minX(cellsOf(app, Color.Magenta)), before - 1);
  assert.ok(ids.includes(Cue.Move));
});

test("up rotates the falling piece", () => {
  const app = createTetrisApp();
  load(app, { kind: 2, x: 4, y: 5, lock: 8 });
  const before = cellsOf(app, Color.Magenta)
    .map((c) => `${c.x},${c.y}`)
    .sort()
    .join(" ");
  const ids = heard(app, Key.Up);
  const after = cellsOf(app, Color.Magenta)
    .map((c) => `${c.x},${c.y}`)
    .sort()
    .join(" ");
  assert.notEqual(after, before);
  assert.ok(ids.includes(Cue.Rotate));
});

test("space hard-drops onto the floor", () => {
  const app = createTetrisApp();
  load(app, { kind: 0, x: 3, y: 0, lock: 8 });
  const ids = heard(app, Key.Space);
  const saved = snap(app);
  assert.equal(readU32(saved, 18), 36);
  for (let x = 3; x <= 6; x++) assert.equal(saved[BOARD + 19 * COLS + x], 1);
  assert.ok(ids.includes(Cue.Drop));
  assert.ok(ids.includes(Cue.Lock));
});

test("a filled row clears and the stack drops", () => {
  const app = createTetrisApp();
  load(app, {
    kind: 0,
    x: 3,
    y: 18,
    lock: 1,
    board(x, y) {
      if (y === 18 && x === 0) return 3;
      if (y === 19 && (x < 3 || x > 6)) return 3;
      return 0;
    },
  });
  for (let i = 0; i < 8; i++) heard(app, null);
  const saved = snap(app);
  assert.equal(readU16(saved, 16), 1);
  assert.equal(readU32(saved, 18), 100);
  assert.equal(saved[BOARD + 19 * COLS], 3);
  assert.equal(saved[BOARD + 18 * COLS], 0);
});

test("a line clear shakes the board", () => {
  const app = createTetrisApp();
  load(app, {
    kind: 0,
    x: 3,
    y: 18,
    lock: 1,
    board(x, y) {
      if (y === 19 && (x < 3 || x > 6)) return 3;
      return 0;
    },
  });
  const ids = heard(app, null);
  const surface = paint(app);
  assert.ok(ids.includes(Cue.Shake));
  assert.equal(cellBg(surface.cells[0]!), Color.Black);
  assert.equal(cellBg(surface.cells[1]!), Color.BrightBlack);
  assert.equal(cellChar(surface.cells[1 * surface.w + 13]!), 0x53);
});

test("four lines fire the tetris cue", () => {
  const app = createTetrisApp();
  load(app, {
    kind: 0,
    rot: 1,
    x: 1,
    y: 16,
    lock: 1,
    board(x, y) {
      if (y >= 16 && x !== 3) return 2;
      return 0;
    },
  });
  const ids = heard(app, null);
  assert.ok(ids.includes(Cue.Tetris));
});

test("a blocked spawn ends the game", () => {
  const app = createTetrisApp();
  load(app, {
    kind: 0,
    x: 3,
    y: 0,
    board() {
      return 1;
    },
  });
  const ids = heard(app, null);
  assert.equal(snap(app)[1], 1);
  assert.ok(ids.includes(Cue.Over));
  assert.ok(ids.includes(Cue.Silence));
});

test("enter retries and keeps the best score", () => {
  const app = createTetrisApp();
  load(app, {
    kind: 0,
    phase: 1,
    score: 40,
    best: 90,
    board() {
      return 1;
    },
  });
  heard(app, Key.Enter);
  const saved = snap(app);
  assert.equal(saved[1], 0);
  assert.equal(readU32(saved, 18), 0);
  assert.equal(readU32(saved, 22), 90);
});

test("snapshot round-trips a mid-game board", () => {
  const app = createTetrisApp();
  load(app, {
    kind: 5,
    rot: 2,
    x: 4,
    y: 8,
    lock: 5,
    score: 12,
    best: 40,
    board(x, y) {
      return y > 16 && x % 2 === 0 ? 4 : 0;
    },
  });
  const first = snap(app);
  const next = createTetrisApp();
  next.hydrate(first, 0, first.length);
  assert.deepEqual(snap(next), first);
});

test("ctrl-c stops the engine", () => {
  let stopped = false;
  const app = createTetrisApp();
  const input = new InputQueue();
  input.push(keyEvent(Key.CtrlC));
  app.tick(input, { stop() { stopped = true; } } as Engine);
  assert.equal(stopped, true);
});
