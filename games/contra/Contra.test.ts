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
import { createContraApp } from "./Contra.ts";

const engine = { stop() {} } as Engine;

function heard(app: App, keys: Key[]): number[] {
  const input = new InputQueue();
  for (const key of keys) input.push(keyEvent(key));
  const cues = new CueQueue();
  app.tick(input, engine, cues);
  const ids: number[] = [];
  for (let i = 0; i < cues.length; i++) ids.push(cues.at(i));
  return ids;
}

function frames(app: App, keys: Key[], n: number): void {
  for (let i = 0; i < n; i++) heard(app, keys);
}

function paint(app: App): Surface {
  const surface = new Surface(app.size.w, app.size.h);
  app.view(surface);
  return surface;
}

function cells(app: App, bg: number): Array<{ x: number; y: number }> {
  const surface = paint(app);
  const found: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < surface.h; y++) {
    for (let x = 0; x < surface.w; x++) {
      if (cellBg(surface.cells[y * surface.w + x]!) === bg) found.push({ x, y });
    }
  }
  return found;
}

function playerTop(app: App): number {
  const body = cells(app, Color.BrightCyan);
  assert.ok(body.length > 0);
  return Math.min(...body.map((c) => c.y));
}

function playerLeft(app: App): number {
  const body = cells(app, Color.BrightCyan);
  assert.ok(body.length > 0);
  return Math.min(...body.map((c) => c.x));
}

function scoreOf(app: App): number {
  const surface = paint(app);
  let s = "";
  for (let x = 0; x < surface.w; x++) {
    const ch = cellChar(surface.cells[x]!);
    s += ch >= 32 && ch < 127 ? String.fromCharCode(ch) : " ";
  }
  const m = /(\d+)/.exec(s);
  return m ? Number(m[1]) : -1;
}

function rowText(surface: Surface, y: number): string {
  let row = "";
  for (let x = 0; x < surface.w; x++) {
    const ch = cellChar(surface.cells[y * surface.w + x]!);
    row += ch >= 32 && ch < 127 ? String.fromCharCode(ch) : " ";
  }
  return row;
}

function worldX(app: App): number {
  const blob = snap(app);
  return (blob[8]! | (blob[9]! << 8)) << 16 >> 16;
}

function snap(app: App): Uint8Array {
  const need = app.snapshot(new Uint8Array(0));
  const buf = new Uint8Array(need);
  assert.equal(app.snapshot(buf), need);
  return buf;
}

test("enter jumps straight up and left or right walks", () => {
  const app = createContraApp();
  frames(app, [Key.Enter], 1);
  frames(app, [], 1);
  const before = playerTop(app);
  const left = playerLeft(app);
  frames(app, [Key.Enter], 1);
  frames(app, [], 3);
  assert.ok(playerTop(app) < before);
  assert.equal(playerLeft(app), left);
  frames(app, [Key.Right], 4);
  assert.ok(playerLeft(app) > left);
});

test("space shoots on the ground and in the air", () => {
  const grounded = createContraApp();
  frames(grounded, [Key.Enter], 1);
  const cues = heard(grounded, [Key.Space]);
  assert.ok(cues.includes(1));
  assert.ok(cells(grounded, Color.BrightWhite).length > 0);

  const air = createContraApp();
  frames(air, [Key.Enter], 1);
  frames(air, [], 1);
  const standing = playerTop(air);
  frames(air, [Key.Enter], 1);
  frames(air, [Key.Space], 1);
  assert.ok(playerTop(air) < standing);
  assert.ok(cells(air, Color.BrightWhite).length > 0);
});

test("ground and air enemies enter from the right", () => {
  const app = createContraApp();
  frames(app, [Key.Enter], 1);
  let ground = 0;
  let air = 0;
  for (let i = 0; i < 220 && (ground === 0 || air === 0); i++) {
    frames(app, [], 1);
    if (cells(app, Color.BrightRed).length > 0) ground++;
    if (cells(app, Color.BrightMagenta).length > 0) air++;
  }
  assert.ok(ground > 0);
  assert.ok(air > 0);
});

test("a shot raises the score", () => {
  const app = createContraApp();
  frames(app, [Key.Enter], 1);
  frames(app, [Key.Right], 8);
  let scored = false;
  for (let i = 0; i < 400 && !scored; i++) {
    frames(app, [Key.Space, Key.Right], 1);
    if (scoreOf(app) > 0) scored = true;
  }
  assert.equal(scored, true);
});

test("the gun shows horizontal, vertical, and diagonal aim", () => {
  const app = createContraApp();
  frames(app, [Key.Enter], 1);
  frames(app, [], 1);
  const right = gunChar(app);
  assert.equal(right, 0x3e);
  frames(app, [Key.Down], 1);
  assert.equal(gunChar(app), 0x76);
  frames(app, [], 1);
  assert.equal(gunChar(app), 0x76);
  frames(app, [Key.Up, Key.Right], 1);
  assert.equal(gunChar(app), 0x2f);
  frames(app, [Key.Left], 1);
  assert.equal(gunChar(app), 0x3c);
});

test("escape pauses the world and paints PAUSED", () => {
  const app = createContraApp();
  frames(app, [Key.Enter], 1);
  frames(app, [], 1);
  const left = playerLeft(app);
  frames(app, [Key.Escape], 1);
  frames(app, [Key.Right], 4);
  assert.equal(playerLeft(app), left);
  const surface = paint(app);
  const row = rowText(surface, 11);
  assert.ok(row.includes("PAUSED"));
  assert.ok(rowText(surface, 13).includes("> RESUME"));
  assert.ok(rowText(surface, 15).includes("RESTART"));
  assert.equal(rowText(surface, 15).includes(">"), false);
  frames(app, [Key.Escape], 1);
  frames(app, [Key.Right], 4);
  assert.ok(playerLeft(app) > left);
});

test("pause menu restart drops progress", () => {
  const app = createContraApp();
  frames(app, [Key.Enter], 1);
  frames(app, [Key.Right], 30);
  const moved = worldX(app);
  assert.ok(moved > 4 * 32);
  frames(app, [Key.Escape], 1);
  frames(app, [Key.Enter], 1);
  assert.equal(worldX(app), moved);
  frames(app, [Key.Escape], 1);
  frames(app, [Key.Down], 1);
  const picked = paint(app);
  assert.ok(rowText(picked, 15).includes("> RESTART"));
  frames(app, [Key.Enter], 1);
  assert.equal(worldX(app), 4 * 32);
  const left = playerLeft(app);
  frames(app, [Key.Right], 4);
  assert.ok(playerLeft(app) > left);
});

test("the boss opens after the leap and can be beaten", () => {
  const app = createContraApp();
  frames(app, [Key.Enter], 1);
  const blob = snap(app);
  const cam = 220 * 32;
  const px = 230 * 32;
  blob[8] = px & 255;
  blob[9] = (px >> 8) & 255;
  blob[16] = cam & 255;
  blob[17] = (cam >> 8) & 255;
  app.hydrate(blob, 0, blob.length);
  frames(app, [], 1);
  const body = () => cells(app, Color.BrightRed).filter((c) => c.y > 2);
  assert.ok(body().length > 20);
  assert.equal(cells(app, Color.BrightRed).filter((c) => c.y === 1).length, 12);
  const start = Math.max(...body().map((c) => c.x));
  let moved = false;
  let chipped = false;
  let won = false;
  for (let i = 0; i < 900 && !won; i++) {
    const cues = heard(app, [Key.Space]);
    const red = body();
    const edge = red.length ? Math.max(...red.map((c) => c.x)) : start;
    if (Math.abs(edge - start) > 2) moved = true;
    const bar = cells(app, Color.BrightRed).filter((c) => c.y === 1).length;
    if (bar > 0 && bar < 12) chipped = true;
    if (cues.includes(6)) won = true;
  }
  assert.equal(moved, true);
  assert.equal(chipped, true);
  assert.equal(won, true);
  const surface = paint(app);
  assert.ok(rowText(surface, 12).includes("YOU WIN"));
});

test("tab ducks under a standing hitbox", () => {
  const app = createContraApp();
  frames(app, [Key.Enter], 1);
  frames(app, [], 1);
  const standing = playerTop(app);
  frames(app, [Key.Tab], 1);
  assert.ok(playerTop(app) > standing);
});

function gunChar(app: App): number {
  const surface = paint(app);
  for (let y = 0; y < surface.h; y++) {
    for (let x = 0; x < surface.w; x++) {
      const cell = surface.cells[y * surface.w + x]!;
      if (cellBg(cell) !== Color.BrightWhite) continue;
      const ch = cellChar(cell);
      if (ch !== 0x20) return ch;
    }
  }
  return 0;
}

test("snapshot round-trips a jump", () => {
  const app = createContraApp();
  frames(app, [Key.Enter], 1);
  frames(app, [], 1);
  frames(app, [Key.Enter], 1);
  frames(app, [], 3);
  const blob = snap(app);
  const next = createContraApp();
  next.hydrate(blob, 0, blob.length);
  assert.equal(playerTop(next), playerTop(app));
  assert.equal(playerLeft(next), playerLeft(app));
});
