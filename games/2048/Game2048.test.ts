import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Attr,
  Color,
  CueQueue,
  InputQueue,
  Key,
  Surface,
  cellAttrs,
  cellBg,
  cellChar,
  cellFg,
  keyEvent,
  type App,
  type Engine,
} from "../../src/engine.ts";
import { Cue, createGame2048App } from "./Game2048.ts";

const engine = { stop() {} } as Engine;
const SAVE = 29;

const STUCK = [
  2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2,
];

/** One left-merge that leaves a full board with no further moves. */
const LAST_MOVE = [
  2, 4, 8, 16, 4, 8, 16, 32, 8, 16, 32, 64, 16, 32, 128, 128,
];

function writeU32(out: Uint8Array, i: number, v: number): void {
  out[i] = v & 0xff;
  out[i + 1] = (v >>> 8) & 0xff;
  out[i + 2] = (v >>> 16) & 0xff;
  out[i + 3] = (v >>> 24) & 0xff;
}

function readU32(buf: Uint8Array, i: number): number {
  return (
    (buf[i]! | (buf[i + 1]! << 8) | (buf[i + 2]! << 16) | (buf[i + 3]! << 24)) >>>
    0
  );
}

function encode(
  board: readonly number[],
  extra: {
    phase?: number;
    won?: number;
    score?: number;
    best?: number;
    born?: number;
    ttl?: number;
  } = {},
): Uint8Array {
  const out = new Uint8Array(SAVE);
  out[0] = 1;
  out[1] = extra.phase ?? 0;
  out[2] = extra.won ?? 0;
  out[3] = extra.born ?? 255;
  writeU32(out, 4, extra.score ?? 0);
  writeU32(out, 8, extra.best ?? 0);
  out[12] = extra.ttl ?? 0;
  for (let i = 0; i < 16; i++) {
    const v = board[i] ?? 0;
    out[13 + i] = v === 0 ? 0 : 31 - Math.clz32(v);
  }
  return out;
}

function load(
  app: App,
  board: readonly number[],
  extra?: Parameters<typeof encode>[1],
): void {
  const blob = encode(board, extra);
  app.hydrate(blob, 0, blob.length);
}

function snap(app: App): Uint8Array {
  const n = app.snapshot(new Uint8Array(0));
  const buf = new Uint8Array(n);
  assert.equal(app.snapshot(buf), n);
  return buf;
}

function decode(buf: Uint8Array) {
  const board: number[] = [];
  for (let i = 0; i < 16; i++) {
    const exp = buf[13 + i]!;
    board.push(exp === 0 ? 0 : 2 ** exp);
  }
  return {
    phase: buf[1]!,
    won: buf[2] === 1,
    born: buf[3] === 255 ? -1 : buf[3]!,
    score: readU32(buf, 4),
    best: readU32(buf, 8),
    ttl: buf[12]!,
    board,
  };
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

function press(app: App, ...keys: Key[]): void {
  const input = new InputQueue();
  for (const key of keys) input.push(keyEvent(key));
  app.tick(input, engine);
}

function idle(app: App, n: number): void {
  for (let i = 0; i < n; i++) press(app);
}

function paint(app: App): Surface {
  const surface = new Surface(app.size.w, app.size.h);
  app.view(surface);
  return surface;
}

function textOf(surface: Surface): string {
  let s = "";
  for (let y = 0; y < surface.h; y++) {
    for (let x = 0; x < surface.w; x++) {
      const ch = cellChar(surface.cells[y * surface.w + x]!);
      s += ch >= 32 && ch < 127 ? String.fromCharCode(ch) : " ";
    }
    s += "\n";
  }
  return s;
}

test("grid is 33 by 27", () => {
  const app = createGame2048App();
  assert.equal(app.size.w, 33);
  assert.equal(app.size.h, 27);
});

test("left merges a pair once", () => {
  const app = createGame2048App();
  load(app, [2, 2, 2, 0]);
  press(app, Key.Left);
  const d = decode(snap(app));
  assert.equal(d.board[0], 4);
  assert.equal(d.board[1], 2);
  assert.equal(d.score, 4);
  assert.equal(d.best, 4);
  const rest = d.board.slice(2).filter((v) => v !== 0);
  assert.equal(rest.length, 1);
  assert.ok(rest[0] === 2 || rest[0] === 4);
});

test("left merges two pairs and does not chain", () => {
  const app = createGame2048App();
  load(app, [2, 2, 2, 2]);
  press(app, Key.Left);
  const d = decode(snap(app));
  assert.equal(d.board[0], 4);
  assert.equal(d.board[1], 4);
  assert.equal(d.score, 8);

  load(app, [4, 4, 8, 0]);
  press(app, Key.Left);
  const chained = decode(snap(app));
  assert.equal(chained.board[0], 8);
  assert.equal(chained.board[1], 8);
  assert.equal(chained.score, 8);
});

test("a slide with no merge still spawns", () => {
  const app = createGame2048App();
  load(app, [2, 0, 0, 0]);
  press(app, Key.Right);
  const d = decode(snap(app));
  assert.equal(d.board[3], 2);
  assert.equal(d.score, 0);
  assert.equal(d.board.filter((v) => v !== 0).length, 2);
});

test("a blocked slide does not change state", () => {
  const app = createGame2048App();
  load(app, [2, 4, 8, 16]);
  const before = snap(app);
  press(app, Key.Left);
  assert.deepEqual(snap(app), before);
  const surface = paint(app);
  assert.equal(cellChar(surface.cells[3 * surface.w + 4]!), 0x32);
  assert.equal(cellBg(surface.cells[1 * surface.w + 1]!), Color.White);
  idle(app, 1);
  const bumped = paint(app);
  assert.deepEqual(snap(app), before);
  assert.equal(cellChar(bumped.cells[3 * bumped.w + 3]!), 0x32);
  idle(app, 4);
  assert.equal(cellChar(paint(app).cells[3 * surface.w + 4]!), 0x32);
});

test("up and down slide a column", () => {
  const app = createGame2048App();
  const up = new Array<number>(16).fill(0);
  up[1] = 2;
  up[5] = 2;
  load(app, up);
  press(app, Key.Up);
  assert.equal(decode(snap(app)).board[1], 4);
  assert.equal(decode(snap(app)).score, 4);

  const down = new Array<number>(16).fill(0);
  down[0] = 2;
  down[4] = 2;
  load(app, down);
  press(app, Key.Down);
  const d = decode(snap(app));
  assert.equal(d.board[12], 4);
  assert.equal(d.score, 4);
});

test("last arrow in the tick wins", () => {
  const app = createGame2048App();
  load(app, [2, 0, 0, 2]);
  press(app, Key.Left, Key.Right);
  const d = decode(snap(app));
  assert.equal(d.board[3], 4);
  assert.equal(d.score, 4);
});

test("reaching 2048 keeps the board in play", () => {
  const app = createGame2048App();
  load(app, [1024, 1024]);
  press(app, Key.Left);
  const d = decode(snap(app));
  assert.equal(d.board[0], 2048);
  assert.equal(d.won, true);
  assert.equal(d.phase, 0);
  assert.equal(d.score, 2048);
  assert.equal(d.best, 2048);
  assert.match(textOf(paint(app)), /arrows slide/);
  assert.doesNotMatch(textOf(paint(app)), /2048 {3}arrows slide/);
  idle(app, 7);
  assert.match(textOf(paint(app)), /2048 {3}arrows slide/);
});

test("a stuck board is over and enter keeps best", () => {
  const app = createGame2048App();
  load(app, STUCK, { score: 12, best: 30 });
  const before = snap(app);
  assert.equal(decode(before).phase, 1);
  press(app, Key.Left);
  assert.deepEqual(snap(app), before);
  press(app, Key.Enter);
  const d = decode(snap(app));
  assert.equal(d.phase, 0);
  assert.equal(d.won, false);
  assert.equal(d.score, 0);
  assert.equal(d.best, 30);
  assert.equal(d.board.filter((v) => v !== 0).length, 2);
});

test("enter during play does not reset", () => {
  const app = createGame2048App();
  load(app, [2, 8], { score: 6, best: 6 });
  const before = snap(app);
  press(app, Key.Enter);
  assert.deepEqual(snap(app), before);
});

test("ctrl+c stops without sliding", () => {
  const app = createGame2048App();
  load(app, [2, 2]);
  let stops = 0;
  const input = new InputQueue();
  input.push(keyEvent(Key.CtrlC));
  input.push(keyEvent(Key.Left));
  app.tick(input, { stop() { stops++; } } as Engine);
  const d = decode(snap(app));
  assert.equal(stops, 1);
  assert.equal(d.board[0], 2);
  assert.equal(d.board[1], 2);
  assert.equal(d.score, 0);
});

test("view paints the tile and the hud", () => {
  const app = createGame2048App();
  load(app, [2]);
  const surface = paint(app);
  const w = surface.w;
  assert.equal(cellChar(surface.cells[3 * w + 4]!), 0x32);
  assert.equal(cellBg(surface.cells[3 * w + 4]!), Color.White);
  assert.equal(cellBg(surface.cells[0]!), Color.Black);
  assert.equal(cellChar(surface.cells[25 * w + 1]!), 0x73);
  assert.equal(cellFg(surface.cells[25 * w + 1]!), Color.BrightWhite);
  const text = textOf(surface);
  assert.match(text, /score 0  best 0/);
  assert.match(text, /arrows slide/);

  load(app, [2048], { won: 1 });
  const won = paint(app);
  assert.equal(cellChar(won.cells[3 * won.w + 2]!), 0x32);
  assert.equal(cellBg(won.cells[3 * won.w + 2]!), Color.Magenta);
  assert.match(textOf(won), /2048 {3}arrows slide/);

  load(app, STUCK);
  const over = paint(app);
  assert.equal(cellChar(over.cells[26 * over.w + 1]!), 0x6e);
  assert.equal(cellFg(over.cells[26 * over.w + 1]!), Color.BrightRed);
  assert.match(textOf(over), /no moves {3}enter retry/);
});

test("a slide travels from its source and a queued arrow waits", () => {
  const app = createGame2048App();
  load(app, [2, 0, 0, 0]);
  press(app, Key.Right);
  const frame = paint(app);
  // Ease-out: a 3-well slide is offset 6 cells, then 11.
  assert.equal(cellChar(frame.cells[3 * frame.w + 10]!), 0x32);
  idle(app, 1);
  const next = paint(app);
  assert.equal(cellChar(next.cells[3 * next.w + 15]!), 0x32);
  assert.equal(cellBg(frame.cells[1 * frame.w + 25]!), Color.BrightBlack);
  assert.equal(cellChar(frame.cells[3 * frame.w + 28]!), 0x20);

  const mid = snap(app);
  const settled = createGame2048App();
  settled.hydrate(mid, 0, mid.length);
  const shown = paint(settled);
  assert.equal(cellChar(shown.cells[3 * shown.w + 28]!), 0x32);
  assert.equal(cellBg(shown.cells[1 * shown.w + 25]!), Color.White);

  press(app, Key.Left);
  assert.deepEqual(snap(app), mid);
  // The queued move fires when the slide ends.
  idle(app, 5);
  assert.deepEqual(snap(app), mid);
  idle(app, 1);
  assert.notDeepEqual(snap(app), mid);
});

test("a merge pops the new value after the slide", () => {
  const app = createGame2048App();
  load(app, [2, 2, 0, 0]);
  press(app, Key.Left);
  const start = paint(app);
  assert.equal(cellChar(start.cells[3 * start.w + 4]!), 0x32);
  assert.match(textOf(start), /score 1  best 1/);

  idle(app, 6);
  const mid = paint(app);
  assert.equal(cellBg(mid.cells[3 * mid.w + 4]!), Color.White);

  idle(app, 1);
  const pop = paint(app);
  assert.equal(cellChar(pop.cells[3 * pop.w + 4]!), 0x34);
  assert.equal(cellAttrs(pop.cells[3 * pop.w + 4]!) & Attr.Inverse, Attr.Inverse);
  assert.match(textOf(pop), /score 4  best 4/);
  assert.equal(cellBg(pop.cells[1 * pop.w + 1]!), Color.BrightWhite);

  idle(app, 1);
  const done = paint(app);
  assert.equal(cellChar(done.cells[3 * done.w + 4]!), 0x34);
  assert.equal(cellAttrs(done.cells[3 * done.w + 4]!), Attr.None);
  assert.equal(cellBg(done.cells[1 * done.w + 1]!), Color.BrightWhite);
});

test("snapshot round-trips and rejects a short or bad buffer", () => {
  const app = createGame2048App();
  const tiny = new Uint8Array(4);
  assert.equal(app.snapshot(tiny), SAVE);
  assert.deepEqual(tiny, new Uint8Array(4));

  load(app, [2, 2, 2, 2], { score: 3, best: 1 });
  assert.equal(decode(snap(app)).best, 3);
  press(app, Key.Left);
  const saved = snap(app);
  const next = createGame2048App();
  next.hydrate(saved, 0, saved.length);
  assert.deepEqual(snap(next), saved);

  const payload = encode([8, 16]);
  const blob = new Uint8Array(5 + payload.length);
  blob.set(payload, 5);
  next.hydrate(blob, 5, payload.length);
  assert.equal(decode(snap(next)).board[0], 8);
  assert.equal(decode(snap(next)).board[1], 16);

  const bad = encode([32, 32], { score: 9, best: 9 });
  bad[0] = 4;
  next.hydrate(bad, 0, bad.length);
  const dealt = decode(snap(next));
  assert.equal(dealt.score, 0);
  assert.equal(dealt.board.filter((v) => v !== 0).length, 2);
});

test("a merging slide pushes Slide and Merge", () => {
  const app = createGame2048App();
  assert.deepEqual(heard(app, null), [Cue.Pad]);
  load(app, [2, 2, 0, 0]);
  assert.deepEqual(heard(app, Key.Left), [Cue.Slide, Cue.Merge]);
});

test("a rejected move pushes only Bump", () => {
  const app = createGame2048App();
  heard(app, null);
  load(app, [2, 4, 8, 16]);
  assert.deepEqual(heard(app, Key.Left), [Cue.Bump]);
});

test("won flips once to Win", () => {
  const app = createGame2048App();
  heard(app, null);
  load(app, [1024, 1024]);
  const win = heard(app, Key.Left);
  assert.deepEqual(win, [Cue.Slide, Cue.Merge, Cue.Win, Cue.PadWin]);
  idle(app, 8);
  const again = heard(app, Key.Right);
  assert.ok(!again.includes(Cue.Win));
  assert.ok(again.includes(Cue.Slide) || again.includes(Cue.Bump));
});

test("a board that cannot move after the slide pushes Over once", () => {
  const app = createGame2048App();
  heard(app, null);
  load(app, LAST_MOVE);
  const over = heard(app, Key.Left);
  assert.deepEqual(over, [Cue.Slide, Cue.Merge, Cue.Over, Cue.Silence]);
  assert.equal(decode(snap(app)).phase, 1);
  assert.deepEqual(heard(app, null), []);
  assert.deepEqual(heard(app, Key.Left), []);
});

test("music themes push once per change", () => {
  const app = createGame2048App();
  assert.deepEqual(heard(app, null), [Cue.Pad]);
  assert.deepEqual(heard(app, null), []);
  load(app, [1024, 1024]);
  assert.deepEqual(heard(app, Key.Left), [
    Cue.Slide,
    Cue.Merge,
    Cue.Win,
    Cue.PadWin,
  ]);
  assert.deepEqual(heard(app, null), []);
  load(app, LAST_MOVE);
  assert.deepEqual(heard(app, Key.Left), [
    Cue.Slide,
    Cue.Merge,
    Cue.Over,
    Cue.Silence,
  ]);
  assert.deepEqual(heard(app, null), []);
});
