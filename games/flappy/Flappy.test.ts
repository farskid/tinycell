import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Color,
  InputQueue,
  Key,
  Surface,
  cellBg,
  cellChar,
  keyEvent,
  type App,
  type Engine,
} from "../../src/engine.ts";
import { createFlappyApp } from "./Flappy.ts";

const engine = { stop() {} } as Engine;

function frames(app: App, key: Key | null, n: number): void {
  for (let i = 0; i < n; i++) {
    const input = new InputQueue();
    if (key) input.push(keyEvent(key));
    app.tick(input, engine);
  }
}

function paint(app: App): Surface {
  const surface = new Surface(app.size.w, app.size.h);
  app.view(surface);
  return surface;
}

function rowText(surface: Surface, y: number): string {
  let s = "";
  for (let x = 0; x < surface.w; x++) {
    const ch = cellChar(surface.cells[y * surface.w + x]!);
    s += ch >= 32 && ch < 127 ? String.fromCharCode(ch) : " ";
  }
  return s;
}

function scoreOf(app: App): number {
  const line = rowText(paint(app), 0).trim();
  const m = /^(\d+)/.exec(line);
  return m ? Number(m[1]) : -1;
}

function bestOf(app: App): number {
  const m = /HI\s+(\d+)/.exec(rowText(paint(app), 0));
  return m ? Number(m[1]) : 0;
}

function bird(app: App): { row: number; dead: boolean } | null {
  const surface = paint(app);
  for (let y = 0; y < surface.h; y++) {
    for (let x = 0; x < surface.w; x++) {
      const bg = cellBg(surface.cells[y * surface.w + x]!);
      if (bg === Color.BrightYellow) return { row: y, dead: false };
      if (bg === Color.BrightRed) return { row: y, dead: true };
    }
  }
  return null;
}

function snap(app: App): Uint8Array {
  const need = app.snapshot(new Uint8Array(0));
  const buf = new Uint8Array(need);
  assert.equal(app.snapshot(buf), need);
  return buf;
}

function hover(app: App, n: number): void {
  for (let i = 0; i < n; i++) {
    const at = bird(app);
    frames(app, !at || at.dead || at.row > 8 ? Key.Space : null, 1);
  }
}

test("a flap leaves the row on that tick", () => {
  const app = createFlappyApp();
  assert.equal(bird(app)?.row, 9);
  frames(app, Key.Space, 1);
  const at = bird(app);
  assert.equal(at?.dead, false);
  assert.ok(at !== null && at.row <= 7);
});

test("no flap falls into the ground", () => {
  const app = createFlappyApp();
  frames(app, Key.Space, 1);
  let row = -1;
  for (let i = 0; i < 200 && row < 0; i++) {
    frames(app, null, 1);
    const at = bird(app);
    if (at?.dead) row = at.row;
  }
  assert.ok(row >= app.size.h - 2);
  assert.equal(scoreOf(app), 0);
});

test("holding the ceiling hits the first pipe", () => {
  const app = createFlappyApp();
  let row = -1;
  for (let i = 0; i < 400 && row < 0; i++) {
    frames(app, Key.Space, 1);
    const at = bird(app);
    if (at?.dead) row = at.row;
  }
  assert.equal(row, 0);
  assert.equal(scoreOf(app), 0);
});

test("staying in the gap scores and a retry keeps the best", () => {
  const app = createFlappyApp();
  let scored = false;
  for (let i = 0; i < 500 && !scored; i++) {
    const at = bird(app);
    assert.equal(at?.dead, false);
    frames(app, !at || at.row > 8 ? Key.Space : null, 1);
    scored = scoreOf(app) >= 1;
  }
  assert.equal(scored, true);
  assert.equal(bestOf(app), 1);

  let dead = false;
  for (let i = 0; i < 200 && !dead; i++) {
    frames(app, null, 1);
    dead = bird(app)?.dead === true;
  }
  assert.equal(dead, true);
  assert.ok(rowText(paint(app), 16).includes("DEAD"));

  frames(app, Key.Space, 1);
  const restarted = bird(app);
  assert.equal(restarted?.dead, false);
  assert.equal(scoreOf(app), 0);
  assert.equal(bestOf(app), 1);
});

test("snapshot roundtrips and a bad blob returns to ready", () => {
  const app = createFlappyApp();
  hover(app, 80);
  const saved = snap(app);
  const score = scoreOf(app);
  const at = bird(app);
  frames(app, null, 30);

  const next = createFlappyApp();
  next.hydrate(saved, 0, saved.length);
  assert.equal(scoreOf(next), score);
  assert.equal(bird(next)?.row, at?.row);
  assert.equal(bird(next)?.dead, at?.dead);

  next.hydrate(new Uint8Array(8), 0, 8);
  assert.equal(scoreOf(next), 0);
  assert.ok(rowText(paint(next), 16).includes("SPACE"));
});
