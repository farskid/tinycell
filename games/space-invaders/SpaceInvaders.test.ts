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
} from "../../src/engine.ts";
import { Cue, createSpaceInvadersApp } from "./SpaceInvaders.ts";

const engine = { stop() {} } as Engine;

function frames(app: App, key: Key | null, n: number): void {
  for (let i = 0; i < n; i++) heard(app, key);
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

function rowText(surface: Surface, y: number): string {
  let s = "";
  for (let x = 0; x < surface.w; x++) {
    const ch = cellChar(surface.cells[y * surface.w + x]!);
    const left = ch & 0xff;
    const right = (ch >>> 8) & 0xff;
    if (
      ch > 0x7e &&
      left >= 0x20 &&
      left <= 0x7e &&
      right >= 0x20 &&
      right <= 0x7e
    ) {
      s += String.fromCharCode(left, right);
    } else {
      s += ch >= 32 && ch < 127 ? String.fromCharCode(ch) : " ";
    }
  }
  return s;
}

function scoreOf(app: App): number {
  const line = rowText(paint(app), app.size.h - 2);
  const m = /SCORE\s+(\d+)/.exec(line);
  return m ? Number(m[1]) : -1;
}

function countBg(surface: Surface, color: Color): number {
  let n = 0;
  for (let i = 0; i < surface.cells.length; i++) {
    if (cellBg(surface.cells[i]!) === color) n++;
  }
  return n;
}

function playerXs(surface: Surface): number[] {
  const xs: number[] = [];
  for (let y = 24; y < surface.h; y++) {
    for (let x = 0; x < surface.w; x++) {
      if (cellBg(surface.cells[y * surface.w + x]!) === Color.BrightGreen)
        xs.push(x);
    }
  }
  return xs;
}

function snap(app: App): Uint8Array {
  const need = app.snapshot(new Uint8Array(0));
  const buf = new Uint8Array(need);
  assert.equal(app.snapshot(buf), need);
  return buf;
}

test("a centered shot scores before the fleet steps", () => {
  const app = createSpaceInvadersApp();
  frames(app, Key.Enter, 1);
  frames(app, Key.Space, 15);
  assert.equal(scoreOf(app), 10);
});

test("a shot, an alien, and the march each push a cue", () => {
  const app = createSpaceInvadersApp();
  assert.deepEqual(heard(app, Key.Enter), []);
  const ids: number[] = [];
  for (let i = 0; i < 20; i++) ids.push(...heard(app, Key.Space));
  assert.ok(ids.includes(Cue.Shot));
  assert.ok(ids.includes(Cue.Alien));
  assert.ok(ids.includes(Cue.March0));
});

test("a diver leaves the formation, curves down, and cues the dive", () => {
  const app = createSpaceInvadersApp();
  frames(app, Key.Enter, 1);
  const ids: number[] = [];
  let y0 = -1;
  for (let i = 0; i < 200 && !ids.includes(Cue.Dive); i++) {
    ids.push(...heard(app, Key.Left));
  }
  assert.ok(ids.includes(Cue.Dive));
  for (let i = 0; i < 24; i++) heard(app, null);
  const surface = paint(app);
  for (let y = 12; y < app.size.h - 2; y++) {
    for (let x = 0; x < surface.w; x++) {
      const bg = cellBg(surface.cells[y * surface.w + x]!);
      if (bg === Color.BrightYellow || bg === Color.BrightGreen) {
        y0 = y;
        break;
      }
    }
    if (y0 >= 0) break;
  }
  assert.ok(y0 >= 12);
});

test("a bunker eats a shot aimed at it", () => {
  const app = createSpaceInvadersApp();
  const before = countBg(paint(app), Color.White);
  frames(app, Key.Enter, 1);
  frames(app, Key.Right, 3);
  frames(app, Key.Space, 6);
  assert.equal(scoreOf(app), 0);
  assert.ok(countBg(paint(app), Color.White) < before);
});

test("the cannon stays inside the grid", () => {
  const left = createSpaceInvadersApp();
  frames(left, Key.Enter, 1);
  frames(left, Key.Left, 80);
  const xs = playerXs(paint(left));
  assert.deepEqual(xs, [0, 1, 2]);

  const right = createSpaceInvadersApp();
  frames(right, Key.Enter, 1);
  frames(right, Key.Right, 80);
  const end = playerXs(paint(right));
  assert.equal(end.length, 3);
  assert.equal(end[2], right.size.w - 1);
});

test("snapshot roundtrips and a bad blob resets", () => {
  const app = createSpaceInvadersApp();
  const fresh = snap(app);
  frames(app, Key.Enter, 1);
  frames(app, Key.Space, 15);
  const saved = snap(app);
  assert.notDeepEqual(saved, fresh);
  const other = createSpaceInvadersApp();
  other.hydrate(saved, 0, saved.length);
  assert.deepEqual(snap(other), saved);
  assert.equal(scoreOf(other), 10);

  other.hydrate(new Uint8Array(saved.length), 0, saved.length);
  assert.equal(scoreOf(other), 0);
  assert.deepEqual(snap(other), fresh);
});

test("an untouched run ends", () => {
  const app = createSpaceInvadersApp();
  frames(app, Key.Enter, 1);
  const input = new InputQueue();
  let ended = false;
  for (let i = 0; i < 8000 && !ended; i++) {
    app.tick(input, engine);
    ended = rowText(paint(app), app.size.h - 1).includes("ENTER RETRY");
  }
  assert.equal(ended, true);
});

test("ctrl+c stops the engine", () => {
  const app = createSpaceInvadersApp();
  const input = new InputQueue();
  input.push(keyEvent(Key.CtrlC));
  let stopped = false;
  app.tick(input, {
    stop() {
      stopped = true;
    },
  } as Engine);
  assert.equal(stopped, true);
});

function hud(app: App): string {
  return rowText(paint(app), app.size.h - 2);
}

function withRandom(fn: () => number, body: () => void): void {
  const real = Math.random;
  Math.random = fn;
  try {
    body();
  } finally {
    Math.random = real;
  }
}

function countBand(app: App, color: Color, y0: number, y1: number): number {
  const surface = paint(app);
  let n = 0;
  for (let row = y0; row < y1; row++) {
    for (let x = 0; x < surface.w; x++) {
      if (cellBg(surface.cells[row * surface.w + x]!) === color) n++;
    }
  }
  return n;
}

test("a caught drop arms a gun, then it expires", () => {
  withRandom(
    () => 0,
    () => {
      const app = createSpaceInvadersApp();
      frames(app, Key.Enter, 1);
      let armed = false;
      for (let i = 0; i < 500 && !armed; i++) {
        frames(app, Key.Space, 1);
        armed = hud(app).includes("FAST");
      }
      assert.equal(armed, true);
      const saved = snap(app);
      const other = createSpaceInvadersApp();
      other.hydrate(saved, 0, saved.length);
      assert.equal(hud(other).includes("FAST"), true);

      frames(app, Key.Left, 30);
      assert.equal(hud(app).includes("FAST"), true);
      let gone = false;
      for (let i = 0; i < 400 && !gone; i++) {
        frames(app, null, 1);
        gone = !hud(app).includes("FAST");
      }
      assert.equal(gone, true);
    },
  );
});

test("splash fires a cone", () => {
  let n = 0;
  withRandom(
    () => {
      n++;
      return n === 2 ? 0.5 : 0;
    },
    () => {
      const app = createSpaceInvadersApp();
      frames(app, Key.Enter, 1);
      let armed = false;
      for (let i = 0; i < 500 && !armed; i++) {
        frames(app, Key.Space, 1);
        armed = hud(app).includes("SPLASH");
      }
      assert.equal(armed, true);
      frames(app, null, 40);
      assert.equal(countBand(app, Color.BrightMagenta, 26, 30), 0);
      frames(app, Key.Space, 1);
      assert.equal(countBand(app, Color.BrightMagenta, 26, 30), 3);
    },
  );
});

test("pierce keeps scoring through a column", () => {
  let n = 0;
  withRandom(
    () => {
      n++;
      return n === 2 ? 0.9 : 0;
    },
    () => {
      const app = createSpaceInvadersApp();
      frames(app, Key.Enter, 1);
      let armed = false;
      for (let i = 0; i < 500 && !armed; i++) {
        frames(app, Key.Space, 1);
        armed = hud(app).includes("PIERCE");
      }
      assert.equal(armed, true);
      frames(app, null, 40);
      const before = scoreOf(app);
      frames(app, Key.Space, 1);
      frames(app, null, 20);
      assert.ok(scoreOf(app) >= before + 20);
    },
  );
});
