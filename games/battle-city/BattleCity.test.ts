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
} from "tinycell";
import { BATTLE_H, BATTLE_W, createBattleCityApp, TANK_ID } from "./BattleCity.ts";

const engine = { stop() {} } as Engine;

function frames(app: App, keys: Key[], n: number): void {
  for (let i = 0; i < n; i++) {
    const input = new InputQueue();
    for (const key of keys) input.push(keyEvent(key));
    app.tick(input, engine);
  }
}

function paint(app: App): Surface {
  const surface = new Surface(app.size.w, app.size.h);
  app.view(surface);
  return surface;
}

function countBg(app: App, bg: number): number {
  const surface = paint(app);
  let n = 0;
  for (let i = 0; i < surface.cells.length; i++) {
    if (cellBg(surface.cells[i]!) === bg) n++;
  }
  return n;
}

function rowText(app: App, y: number): string {
  const surface = paint(app);
  let row = "";
  for (let x = 0; x < surface.w; x++) {
    const ch = cellChar(surface.cells[y * surface.w + x]!);
    row += ch >= 32 && ch < 127 ? String.fromCharCode(ch) : " ";
  }
  return row;
}

function snap(app: App): Uint8Array {
  const need = app.snapshot(new Uint8Array(0));
  const buf = new Uint8Array(need);
  assert.equal(app.snapshot(buf), need);
  return buf;
}

test("grid is the field plus the enemy column", () => {
  const app = createBattleCityApp();
  assert.equal(app.size.w, BATTLE_W);
  assert.equal(app.size.h, BATTLE_H);
  assert.match(rowText(app, 12), /BATTLE CITY/);
});

test("the tank is four picture ids facing up", () => {
  const app = createBattleCityApp();
  frames(app, [Key.Enter], 1);
  frames(app, [], 80);
  const surface = paint(app);
  const ids = TANK_ID[0]![0]!;
  for (let i = 0; i < 4; i++) {
    const x = 9 + (i % 2);
    const y = 25 + ((i / 2) | 0);
    assert.equal(cellChar(surface.cells[y * surface.w + x]!), ids[i]);
  }
});

test("enter starts a stage and arrows drive the tank", () => {
  const app = createBattleCityApp();
  frames(app, [Key.Enter], 1);
  frames(app, [], 40);
  const before = snap(app);
  assert.equal(before[1], 2);
  assert.equal(before[11], 8);
  frames(app, [Key.Left], 6);
  const after = snap(app);
  assert.ok(after[11]! < before[11]!);
  assert.equal(after[12], before[12]);
});

test("space breaks the brick in front of the tank", () => {
  const app = createBattleCityApp();
  frames(app, [Key.Enter], 1);
  frames(app, [], 40);
  const bricks = countBg(app, Color.Red);
  frames(app, [Key.Space], 1);
  assert.ok(countBg(app, Color.Red) < bricks);
});

test("snapshot round-trips the stage and the tank", () => {
  const app = createBattleCityApp();
  frames(app, [Key.Enter], 1);
  frames(app, [], 40);
  frames(app, [Key.Left], 4);
  const saved = snap(app);
  const next = createBattleCityApp();
  next.hydrate(saved, 0, saved.length);
  const again = snap(next);
  assert.deepEqual(again, saved);
  assert.match(rowText(next, 23), /01/);
});
