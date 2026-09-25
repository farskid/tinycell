import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CueQueue,
  InputQueue,
  Key,
  charEvent,
  keyEvent,
  type App,
  type Engine,
} from "tinycell";
import { Cue, createBlockBlastApp } from "./BlockBlast.ts";

const engine = { stop() {} } as Engine;
const COLS = 8;
const BOARD = 20;

function writeU32(out: Uint8Array, i: number, v: number): void {
  out[i] = v & 0xff;
  out[i + 1] = (v >>> 8) & 0xff;
  out[i + 2] = (v >>> 16) & 0xff;
  out[i + 3] = (v >>> 24) & 0xff;
}

function readU32(buf: Uint8Array, i: number): number {
  return (
    (buf[i]! | (buf[i + 1]! << 8) | (buf[i + 2]! << 16) | (buf[i + 3]! << 24)) >>> 0
  );
}

function snap(app: App): Uint8Array {
  const n = app.snapshot(new Uint8Array(0));
  const buf = new Uint8Array(n);
  assert.equal(app.snapshot(buf), n);
  return buf;
}

function load(
  app: App,
  opts: {
    phase?: number;
    x?: number;
    y?: number;
    slot?: number;
    streak?: number;
    score?: number;
    best?: number;
    hand?: [number, number, number];
    board?: (x: number, y: number) => number;
  },
): void {
  const buf = snap(app);
  if (opts.phase !== undefined) buf[1] = opts.phase;
  if (opts.x !== undefined) buf[2] = opts.x;
  if (opts.y !== undefined) buf[3] = opts.y;
  if (opts.slot !== undefined) buf[4] = opts.slot;
  if (opts.streak !== undefined) buf[5] = opts.streak;
  if (opts.hand) {
    buf[6] = opts.hand[0];
    buf[7] = opts.hand[1];
    buf[8] = opts.hand[2];
  }
  writeU32(buf, 12, opts.score ?? readU32(buf, 12));
  writeU32(buf, 16, opts.best ?? readU32(buf, 16));
  if (opts.board) {
    for (let y = 0; y < COLS; y++) {
      for (let x = 0; x < COLS; x++) buf[BOARD + y * COLS + x] = opts.board(x, y);
    }
  } else {
    buf.fill(0, BOARD, BOARD + COLS * COLS);
  }
  app.hydrate(buf, 0, buf.length);
}

function heard(app: App, key: Key | number | null): number[] {
  const input = new InputQueue();
  if (typeof key === "number" && key > Key.CtrlC) input.push(charEvent(key));
  else if (key) input.push(keyEvent(key as Key));
  const cues = new CueQueue();
  app.tick(input, engine, cues);
  const ids: number[] = [];
  for (let i = 0; i < cues.length; i++) ids.push(cues.at(i));
  return ids;
}

test("space places the selected piece and scores its cells", () => {
  const app = createBlockBlastApp();
  load(app, { x: 3, y: 4, hand: [0, 255, 255] });
  const ids = heard(app, Key.Space);
  const saved = snap(app);
  assert.equal(saved[BOARD + 4 * COLS + 3], 1);
  assert.equal(readU32(saved, 12), 1);
  assert.ok(ids.includes(Cue.Place));
});

test("a full row clears and pays the line bonus", () => {
  const app = createBlockBlastApp();
  load(app, {
    hand: [0, 255, 255],
    board(x, y) {
      if (y === 0 && x > 0) return 2;
      return 0;
    },
  });
  const ids = heard(app, Key.Space);
  const saved = snap(app);
  assert.equal(saved[BOARD], 0);
  assert.equal(saved[BOARD + 1], 0);
  assert.equal(readU32(saved, 12), 11);
  assert.equal(saved[5], 1);
  assert.ok(ids.includes(Cue.Clear));
});

test("a row and a column together are a combo", () => {
  const app = createBlockBlastApp();
  load(app, {
    x: 7,
    y: 7,
    hand: [0, 255, 255],
    board(x, y) {
      if (y === 7 && x < 7) return 3;
      if (x === 7 && y < 7) return 3;
      return 0;
    },
  });
  const ids = heard(app, Key.Space);
  const saved = snap(app);
  assert.equal(saved[BOARD + 7 * COLS + 7], 0);
  assert.equal(saved[BOARD + 7 * COLS], 0);
  assert.equal(saved[BOARD + 7], 0);
  assert.equal(readU32(saved, 12), 31);
  assert.ok(ids.includes(Cue.Combo));
});

test("space on a blocked cell does not place", () => {
  const app = createBlockBlastApp();
  load(app, {
    hand: [0, 1, 2],
    board(x, y) {
      return x === 0 && y === 0 ? 4 : 0;
    },
  });
  const ids = heard(app, Key.Space);
  const saved = snap(app);
  assert.equal(saved[BOARD], 4);
  assert.equal(readU32(saved, 12), 0);
  assert.equal(ids.includes(Cue.Place), false);
});

test("arrows move the cursor and tab changes piece", () => {
  const app = createBlockBlastApp();
  load(app, { hand: [0, 1, 2] });
  heard(app, Key.Right);
  heard(app, Key.Down);
  let saved = snap(app);
  assert.equal(saved[2], 1);
  assert.equal(saved[3], 1);
  heard(app, Key.Tab);
  saved = snap(app);
  assert.equal(saved[4], 1);
  heard(app, 0x33);
  saved = snap(app);
  assert.equal(saved[4], 2);
});

test("no legal placement ends the game", () => {
  const app = createBlockBlastApp();
  load(app, {
    hand: [0, 1, 2],
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
  const app = createBlockBlastApp();
  load(app, { phase: 1, score: 40, best: 90, hand: [0, 1, 2] });
  heard(app, Key.Enter);
  const saved = snap(app);
  assert.equal(saved[1], 0);
  assert.equal(readU32(saved, 12), 0);
  assert.equal(readU32(saved, 16), 90);
});

test("snapshot round-trips a mid-game board", () => {
  const app = createBlockBlastApp();
  load(app, {
    x: 2,
    y: 3,
    slot: 1,
    streak: 2,
    score: 12,
    best: 40,
    hand: [4, 9, 255],
    board(x, y) {
      return y > 5 && x % 2 === 0 ? 4 : 0;
    },
  });
  const first = snap(app);
  const next = createBlockBlastApp();
  next.hydrate(first, 0, first.length);
  assert.deepEqual(snap(next), first);
});

test("ctrl-c stops the engine", () => {
  let stopped = false;
  const app = createBlockBlastApp();
  const input = new InputQueue();
  input.push(keyEvent(Key.CtrlC));
  app.tick(input, {
    stop() {
      stopped = true;
    },
  } as Engine);
  assert.equal(stopped, true);
});
