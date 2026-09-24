import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Color,
  CueQueue,
  InputQueue,
  Key,
  Surface,
  cellBg,
  keyEvent,
  type App,
  type Engine,
} from "../../src/engine.ts";
import { Cue, createSnakeApp } from "./Snake.ts";

const engine = { stop() {} } as Engine;
const PLAY_H = 32;

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

function findBg(app: App, bg: Color): { x: number; y: number } | null {
  const surface = paint(app);
  for (let y = 0; y < PLAY_H; y++) {
    for (let x = 0; x < surface.w; x++) {
      if (cellBg(surface.cells[y * surface.w + x]!) === bg) return { x, y };
    }
  }
  return null;
}

function headOf(app: App): { x: number; y: number } | null {
  return findBg(app, Color.BrightBlack);
}

function opposite(a: Key, b: Key): boolean {
  return (
    (a === Key.Left && b === Key.Right) ||
    (a === Key.Right && b === Key.Left) ||
    (a === Key.Up && b === Key.Down) ||
    (a === Key.Down && b === Key.Up)
  );
}

function toward(
  from: { x: number; y: number },
  to: { x: number; y: number },
  facing: Key,
): Key {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const horiz = dx < 0 ? Key.Left : Key.Right;
  const vert = dy < 0 ? Key.Up : Key.Down;
  const primary = Math.abs(dx) >= Math.abs(dy) ? horiz : vert;
  const secondary = Math.abs(dx) >= Math.abs(dy) ? vert : horiz;
  if (!opposite(primary, facing)) return primary;
  if (dx !== 0 && dy !== 0 && !opposite(secondary, facing)) return secondary;
  return facing === Key.Left || facing === Key.Right ? Key.Down : Key.Right;
}

test("idle ticks stay silent", () => {
  const app = createSnakeApp();
  for (let i = 0; i < 40; i++) {
    assert.deepEqual(heard(app, null), []);
  }
});

test("Eat fires on food", () => {
  const app = createSnakeApp();
  assert.ok(findBg(app, Color.Red));
  let facing = Key.Right;
  let ids: number[] = [];
  ids.push(...heard(app, facing));
  for (let i = 0; i < 800 && !ids.includes(Cue.Eat); i++) {
    const head = headOf(app);
    const target = findBg(app, Color.Red);
    if (head && target) facing = toward(head, target, facing);
    ids.push(...heard(app, facing));
  }
  assert.ok(ids.includes(Cue.Eat));
});

test("Bonus fires on the prize cell", () => {
  const app = createSnakeApp();
  const blob = new Uint8Array(44);
  blob[0] = 1;
  blob[1] = 1;
  blob[5] = 1;
  blob[9] = 2;
  blob[17] = 3;
  blob[19] = 1;
  blob[20] = 1;
  blob[27] = 1;
  blob[28] = 17;
  blob[30] = 16;
  blob[32] = 90;
  blob[36] = 15;
  blob[38] = 16;
  blob[40] = 16;
  blob[42] = 16;
  app.hydrate(blob, 0, blob.length);
  const ids = heard(app, null);
  assert.ok(ids.includes(Cue.Bonus));
});

test("Die fires once on wall hit and silences music", () => {
  const app = createSnakeApp();
  heard(app, Key.Right);
  let death: number[] | null = null;
  for (let i = 0; i < 400 && !death; i++) {
    const ids = heard(app, Key.Right);
    if (ids.includes(Cue.Die)) death = ids;
  }
  assert.ok(death);
  assert.equal(death!.filter((id) => id === Cue.Die).length, 1);
  assert.ok(death!.includes(Cue.Silence));
  assert.equal(death!.some((id) => id >= Cue.Tune0 && id <= Cue.Tune7), false);
  for (let i = 0; i < 20; i++) {
    const idle = heard(app, null);
    assert.equal(idle.includes(Cue.Die), false);
    assert.equal(idle.some((id) => id >= Cue.Tune0 && id <= Cue.Tune7), false);
    assert.equal(idle.includes(Cue.Silence), false);
  }
});

test("run loops the tune", () => {
  const app = createSnakeApp();
  const start = heard(app, Key.Down);
  assert.ok(start.includes(Cue.Tune0));
  const ids: number[] = [];
  for (let i = 0; i < 40 && !ids.includes(Cue.Tune2); i++) {
    ids.push(...heard(app, Key.Down));
  }
  const a = ids.indexOf(Cue.Tune1);
  const b = ids.indexOf(Cue.Tune2);
  assert.ok(a >= 0);
  assert.ok(b > a);
  assert.equal(ids.includes(Cue.Silence), false);
});
