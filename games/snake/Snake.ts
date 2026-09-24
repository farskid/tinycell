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

export const Cue = {
  Eat: 1,
  Bonus: 2,
  Die: 3,
  Tune0: 4,
  Tune1: 5,
  Tune2: 6,
  Tune3: 7,
  Tune4: 8,
  Tune5: 9,
  Tune6: 10,
  Tune7: 11,
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
const TUNE_EVERY = 12;

const W = 32;
const H = 32;
const HUD_H = 7;
const CAP = W * H;
const MOVE_EVERY = 4;
/** Length per interval drop. Larger = slower ramp. */
const ACCEL = 10;
const MAX_FOOD = 4;
const ROCK_N = 8;
const BONUS_PRIZE = 3;
const BONUS_TTL = 90;
const BONUS_WAIT = 50;

const FLOOR_A = packCell(0x20, Color.Default, Color.White);
const FLOOR_B = packCell(0x20, Color.Default, Color.BrightWhite);
const BODY = packCell(0x20, Color.Default, Color.Black);
const FOOD = packCell(0x20, Color.Default, Color.Red);
const BONUS_A = packCell(0x20, Color.Default, Color.Yellow);
const BONUS_B = packCell(0x20, Color.Default, Color.BrightRed);
const ROCK = packCell(0x20, Color.Default, Color.Blue);

const SNAKE = 1;
const ROCK_MARK = 2;

type Point = { x: number; y: number };
type Phase = "idle" | "run" | "dead";
type WallMode = "solid" | "wrap";
type FoodMode = "single" | "multiple";
type Obstacles = "off" | "static" | "moving";
type SpeedMode = "flat" | "ramp";
type Feat = "wall" | "food" | "bonus" | "obstacles" | "speed" | "laser";

interface Features {
  wall: WallMode;
  food: FoodMode;
  bonus: boolean;
  obstacles: Obstacles;
  speed: SpeedMode;
  laser: boolean;
}

const FEATS: Feat[] = ["wall", "food", "bonus", "obstacles", "speed", "laser"];

interface GameState {
  phase: Phase;
  features: Features;
  feat: number;
  xs: Int16Array;
  ys: Int16Array;
  occ: Uint8Array;
  head: number;
  tail: number;
  len: number;
  pending: number;
  dir: Point | null;
  queued: Point | null;
  foodsX: Int16Array;
  foodsY: Int16Array;
  foodN: number;
  bonus: { x: number; y: number; ttl: number } | null;
  bonusWait: number;
  rocksX: Int16Array;
  rocksY: Int16Array;
  rocksDx: Int16Array;
  rocksDy: Int16Array;
  rockN: number;
  score: number;
  step: number;
}

function wallAt(f: Features, x: number, y: number): Point | null {
  if (f.wall === "wrap") {
    return { x: ((x % W) + W) % W, y: ((y % H) + H) % H };
  }
  if (x < 0 || y < 0 || x >= W || y >= H) return null;
  return { x, y };
}

function foodTarget(f: Features): number {
  return f.food === "multiple" ? MAX_FOOD : 1;
}

function moveEvery(c: GameState): number {
  if (c.features.speed === "flat") return MOVE_EVERY;
  const n = MOVE_EVERY - (((c.len - 2) / ACCEL) | 0);
  return n < 1 ? 1 : n;
}

function cell(x: number, y: number): number {
  return y * W + x;
}

function next(i: number): number {
  i++;
  return i === CAP ? 0 : i;
}

function dirOf(key: Key | 0): Point | null {
  if (key === Key.Up) return { x: 0, y: -1 };
  if (key === Key.Down) return { x: 0, y: 1 };
  if (key === Key.Left) return { x: -1, y: 0 };
  if (key === Key.Right) return { x: 1, y: 0 };
  return null;
}

function lastDir(input: InputQueue): Point | null {
  let dir: Point | null = null;
  for (let i = 0; i < input.length; i++) {
    const d = dirOf(keyOf(input.at(i)));
    if (d) dir = d;
  }
  return dir;
}

function packPair(left: number, right: number) {
  return packCell(
    ((right & 0xff) << 8) | (left & 0xff),
    Color.BrightWhite,
    Color.BrightBlack,
  );
}

function headCell(dir: Point | null) {
  const d = dir ?? { x: 1, y: 0 };
  if (d.y < 0) return packPair(0x27, 0x27);
  if (d.y > 0) return packPair(0x2e, 0x2e);
  if (d.x < 0) return packPair(0x3a, 0x20);
  return packPair(0x20, 0x3a);
}

function opposite(a: Point, b: Point): boolean {
  return a.x === -b.x && a.y === -b.y;
}

function queueDir(c: GameState, nextDir: Point | null): void {
  if (!nextDir) return;
  const cur = c.queued ?? c.dir;
  if (cur && opposite(cur, nextDir)) return;
  c.queued = nextDir;
}

function isFood(c: GameState, x: number, y: number): number {
  for (let i = 0; i < c.foodN; i++) {
    if (c.foodsX[i] === x && c.foodsY[i] === y) return i;
  }
  return -1;
}

function isBonus(c: GameState, x: number, y: number): boolean {
  return c.bonus !== null && c.bonus.x === x && c.bonus.y === y;
}

function pickEmpty(c: GameState): number {
  let free = 0;
  for (let i = 0; i < CAP; i++) {
    if (c.occ[i] !== 0) continue;
    const x = i % W;
    const y = (i / W) | 0;
    if (isFood(c, x, y) >= 0 || isBonus(c, x, y)) continue;
    free++;
  }
  if (free <= 0) return -1;
  let n = (Math.random() * free) | 0;
  for (let i = 0; i < CAP; i++) {
    if (c.occ[i] !== 0) continue;
    const x = i % W;
    const y = (i / W) | 0;
    if (isFood(c, x, y) >= 0 || isBonus(c, x, y)) continue;
    if (n === 0) return i;
    n--;
  }
  return -1;
}

function addFood(c: GameState): void {
  if (c.foodN >= foodTarget(c.features)) return;
  const i = pickEmpty(c);
  if (i < 0) return;
  c.foodsX[c.foodN] = i % W;
  c.foodsY[c.foodN] = (i / W) | 0;
  c.foodN++;
}

function dropFood(c: GameState, idx: number): void {
  c.foodN--;
  c.foodsX[idx] = c.foodsX[c.foodN]!;
  c.foodsY[idx] = c.foodsY[c.foodN]!;
}

function fillFood(c: GameState): void {
  const want = foodTarget(c.features);
  while (c.foodN > want) c.foodN--;
  while (c.foodN < want) addFood(c);
}

function clearRocks(c: GameState): void {
  for (let i = 0; i < c.rockN; i++) {
    const p = cell(c.rocksX[i]!, c.rocksY[i]!);
    if (c.occ[p] === ROCK_MARK) c.occ[p] = 0;
  }
  c.rockN = 0;
}

function addRock(c: GameState): void {
  if (c.rockN >= ROCK_N) return;
  const i = pickEmpty(c);
  if (i < 0) return;
  const k = c.rockN;
  c.rocksX[k] = i % W;
  c.rocksY[k] = (i / W) | 0;
  c.rocksDx[k] = k & 1 ? 1 : -1;
  c.rocksDy[k] = 0;
  c.occ[i] = ROCK_MARK;
  c.rockN++;
}

function fillRocks(c: GameState): void {
  if (c.features.obstacles === "off") {
    clearRocks(c);
    return;
  }
  while (c.rockN < ROCK_N) addRock(c);
}

function spawnBonus(c: GameState): void {
  if (!c.features.bonus || c.bonus) return;
  const i = pickEmpty(c);
  if (i < 0) return;
  c.bonus = { x: i % W, y: (i / W) | 0, ttl: BONUS_TTL };
  c.bonusWait = 0;
}

function syncFeatures(c: GameState): void {
  fillFood(c);
  fillRocks(c);
  if (!c.features.bonus) {
    c.bonus = null;
    c.bonusWait = 0;
  }
}

function reset(c: GameState): void {
  const hx = (W / 2) | 0;
  const hy = (H / 2) | 0;
  c.occ.fill(0);
  c.tail = 0;
  c.head = 1;
  c.len = 2;
  c.pending = 0;
  c.xs[0] = hx - 1;
  c.ys[0] = hy;
  c.xs[1] = hx;
  c.ys[1] = hy;
  c.occ[cell(hx - 1, hy)] = SNAKE;
  c.occ[cell(hx, hy)] = SNAKE;
  c.dir = null;
  c.queued = null;
  c.foodN = 0;
  c.bonus = null;
  c.bonusWait = 0;
  c.rockN = 0;
  c.score = 0;
  c.step = 0;
  c.phase = "idle";
  syncFeatures(c);
}

function cycleFeat(c: GameState): void {
  const f = c.features;
  const name = FEATS[c.feat]!;
  if (name === "wall") f.wall = f.wall === "solid" ? "wrap" : "solid";
  else if (name === "food")
    f.food = f.food === "single" ? "multiple" : "single";
  else if (name === "bonus") f.bonus = !f.bonus;
  else if (name === "obstacles") {
    f.obstacles =
      f.obstacles === "off"
        ? "static"
        : f.obstacles === "static"
          ? "moving"
          : "off";
  } else if (name === "speed") f.speed = f.speed === "flat" ? "ramp" : "flat";
  else f.laser = !f.laser;
  syncFeatures(c);
}

function sound(cues: CueQueue | undefined, id: number): void {
  cues?.push(id);
}

function moveRocks(c: GameState): void {
  if (c.features.obstacles !== "moving" || c.phase !== "run") return;
  for (let i = 0; i < c.rockN; i++) {
    const p = cell(c.rocksX[i]!, c.rocksY[i]!);
    if (c.occ[p] === ROCK_MARK) c.occ[p] = 0;
  }
  for (let i = 0; i < c.rockN; i++) {
    const x = c.rocksX[i]!;
    const y = c.rocksY[i]!;
    let dx = c.rocksDx[i]!;
    let dy = c.rocksDy[i]!;
    let dest = wallAt(c.features, x + dx, y + dy);
    if (!dest) {
      dx = -dx;
      dy = -dy;
      dest = wallAt(c.features, x + dx, y + dy);
    }
    if (!dest) {
      c.occ[cell(x, y)] = ROCK_MARK;
      continue;
    }
    const ni = cell(dest.x, dest.y);
    const blocked =
      c.occ[ni] !== 0 ||
      isFood(c, dest.x, dest.y) >= 0 ||
      isBonus(c, dest.x, dest.y);
    if (c.occ[ni] === SNAKE) {
      c.phase = "dead";
      c.occ[cell(x, y)] = ROCK_MARK;
      return;
    }
    if (blocked) {
      c.rocksDx[i] = -dx;
      c.rocksDy[i] = -dy;
      c.occ[cell(x, y)] = ROCK_MARK;
      continue;
    }
    c.rocksX[i] = dest.x;
    c.rocksY[i] = dest.y;
    c.rocksDx[i] = dx;
    c.rocksDy[i] = dy;
    c.occ[ni] = ROCK_MARK;
  }
}

function stepMove(c: GameState, f: Features, cues?: CueQueue): void {
  if (!c.dir) return;
  const hit = wallAt(f, c.xs[c.head]! + c.dir.x, c.ys[c.head]! + c.dir.y);
  if (!hit) {
    c.phase = "dead";
    return;
  }
  const ni = cell(hit.x, hit.y);
  const food = isFood(c, hit.x, hit.y);
  const bonus = isBonus(c, hit.x, hit.y);
  const taili = cell(c.xs[c.tail]!, c.ys[c.tail]!);
  let grow = 0;
  if (food >= 0) {
    dropFood(c, food);
    grow = 1;
    c.score++;
    sound(cues, Cue.Eat);
  }
  if (bonus && c.bonus) {
    grow += c.bonus.ttl > 0 ? BONUS_PRIZE : 0;
    c.score += BONUS_PRIZE;
    c.bonus = null;
    sound(cues, Cue.Bonus);
  }
  const stayTail = c.pending + grow > 0;
  if (c.occ[ni] === ROCK_MARK) {
    c.phase = "dead";
    return;
  }
  if (c.occ[ni] === SNAKE && (stayTail || ni !== taili)) {
    c.phase = "dead";
    return;
  }
  c.pending += grow;
  if (c.pending > 0) {
    c.pending--;
    c.len++;
  } else {
    c.occ[taili] = 0;
    c.tail = next(c.tail);
  }
  c.head = next(c.head);
  c.xs[c.head] = hit.x;
  c.ys[c.head] = hit.y;
  c.occ[ni] = SNAKE;
  fillFood(c);
  moveRocks(c);
}

function tickBonus(c: GameState, f: Features): void {
  if (!f.bonus) return;
  if (c.bonus) {
    c.bonus.ttl--;
    if (c.bonus.ttl <= 0) c.bonus = null;
    return;
  }
  c.bonusWait++;
  if (c.bonusWait >= BONUS_WAIT) spawnBonus(c);
}

function writeHud(
  out: Surface,
  x: number,
  y: number,
  s: string,
  fg: Color = Color.Default,
  bg: Color = Color.Default,
): void {
  let col = x;
  for (let i = 0; i < s.length && col < out.w; i += 2) {
    const a = s.charCodeAt(i) & 0xff;
    const b = i + 1 < s.length ? s.charCodeAt(i + 1) & 0xff : 0x20;
    out.set(col, y, packCell((b << 8) | a, fg, bg));
    col++;
  }
}

function box(on: boolean): string {
  return on ? "[x]" : "[ ]";
}

function featLine(c: GameState, name: Feat): string {
  const f = c.features;
  if (name === "wall") {
    return `wall   ${box(f.wall === "solid")} solid  ${box(f.wall === "wrap")} wrap`;
  }
  if (name === "food") {
    return `food   ${box(f.food === "single")} single  ${box(f.food === "multiple")} multiple`;
  }
  if (name === "bonus") {
    return `bonus  ${box(!f.bonus)} off  ${box(f.bonus)} on`;
  }
  if (name === "obstacles") {
    return `rocks  ${box(f.obstacles === "off")} off  ${box(f.obstacles === "static")} static  ${box(f.obstacles === "moving")} moving`;
  }
  if (name === "speed") {
    return `speed  ${box(f.speed === "flat")} flat  ${box(f.speed === "ramp")} ramp`;
  }
  return `laser  ${box(!f.laser)} off  ${box(f.laser)} on`;
}

function laserCell(x: number, y: number, horiz: boolean) {
  const bg = ((x + y) & 1) === 0 ? Color.White : Color.BrightWhite;
  const pair = horiz ? 0x2d2d : 0xff5c;
  return packCell(pair, Color.Red, bg, Attr.Dim);
}

function drawLaser(c: GameState, out: Surface): void {
  if (!c.features.laser) return;
  const d = c.dir ?? { x: 1, y: 0 };
  const max = d.x !== 0 ? W : H;
  let x = c.xs[c.head]! + d.x;
  let y = c.ys[c.head]! + d.y;
  const horiz = d.x !== 0;
  for (let n = 0; n < max; n++) {
    const p = wallAt(c.features, x, y);
    if (!p) break;
    if (c.occ[cell(p.x, p.y)] !== 0) break;
    if (isFood(c, p.x, p.y) < 0 && !isBonus(c, p.x, p.y)) {
      out.set(p.x, p.y, laserCell(p.x, p.y, horiz));
    }
    x = p.x + d.x;
    y = p.y + d.y;
  }
}

function drawBoard(c: GameState, out: Surface): void {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      out.set(x, y, ((x + y) & 1) === 0 ? FLOOR_A : FLOOR_B);
    }
  }
  drawLaser(c, out);
  for (let i = 0; i < c.foodN; i++) {
    out.set(c.foodsX[i]!, c.foodsY[i]!, FOOD);
  }
  if (c.bonus) {
    const flash = ((c.bonus.ttl / 3) | 0) & 1;
    out.set(c.bonus.x, c.bonus.y, flash ? BONUS_A : BONUS_B);
  }
  for (let i = 0; i < c.rockN; i++) {
    out.set(c.rocksX[i]!, c.rocksY[i]!, ROCK);
  }
  let i = c.tail;
  for (let k = 0; k < c.len; k++) {
    out.set(c.xs[i]!, c.ys[i]!, i === c.head ? headCell(c.dir) : BODY);
    i = next(i);
  }
  if (c.phase === "dead") {
    const label = `dead ${c.score}`;
    writeHud(
      out,
      ((W * 2 - label.length) / 4) | 0,
      (H / 2) | 0,
      label,
      Color.BrightRed,
      Color.White,
    );
  }
  const blank = packCell(0x20);
  for (let y = H; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) out.set(x, y, blank);
  }
  writeHud(
    out,
    0,
    H,
    "arrows start  tab feat  space cycle  enter retry  ^C quit",
  );
  for (let r = 0; r < FEATS.length; r++) {
    const focus = r === c.feat;
    writeHud(
      out,
      0,
      H + 1 + r,
      `${focus ? ">" : " "} ${featLine(c, FEATS[r]!)}`,
      focus ? Color.Black : Color.Default,
      focus ? Color.White : Color.Default,
    );
  }
}

const SAVE_VER = 1;

function phaseCode(p: Phase): number {
  if (p === "run") return 1;
  if (p === "dead") return 2;
  return 0;
}

function phaseOf(n: number): Phase | null {
  if (n === 0) return "idle";
  if (n === 1) return "run";
  if (n === 2) return "dead";
  return null;
}

function writeU16(out: Uint8Array, i: number, v: number): void {
  out[i] = v & 0xff;
  out[i + 1] = (v >>> 8) & 0xff;
}

function writeU32(out: Uint8Array, i: number, v: number): void {
  writeU16(out, i, v);
  writeU16(out, i + 2, v >>> 16);
}

function writeI16(out: Uint8Array, i: number, v: number): void {
  writeU16(out, i, v);
}

function readU16(buf: Uint8Array, i: number): number {
  return (buf[i]! | (buf[i + 1]! << 8)) & 0xffff;
}

function readU32(buf: Uint8Array, i: number): number {
  return (readU16(buf, i) | (readU16(buf, i + 2) << 16)) >>> 0;
}

function readI16(buf: Uint8Array, i: number): number {
  const u = readU16(buf, i);
  return u > 32767 ? u - 65536 : u;
}

function inCell(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < W && y < H;
}

function payloadLen(c: GameState): number {
  return 28 + (c.bonus ? 6 : 0) + 1 + c.foodN * 4 + 1 + c.rockN * 8 + c.len * 4;
}

function writeState(c: GameState, out: Uint8Array): number {
  const n = payloadLen(c);
  if (out.length < n) return n;
  let i = 0;
  out[i++] = SAVE_VER;
  out[i++] = phaseCode(c.phase);
  out[i++] = c.feat;
  out[i++] = c.features.wall === "wrap" ? 1 : 0;
  out[i++] = c.features.food === "multiple" ? 1 : 0;
  out[i++] = c.features.bonus ? 1 : 0;
  out[i++] =
    c.features.obstacles === "moving"
      ? 2
      : c.features.obstacles === "static"
        ? 1
        : 0;
  out[i++] = c.features.speed === "flat" ? 0 : 1;
  out[i++] = c.features.laser ? 1 : 0;
  writeU16(out, i, c.len);
  i += 2;
  writeU16(out, i, c.pending);
  i += 2;
  writeU32(out, i, c.score);
  i += 4;
  writeU16(out, i, c.step);
  i += 2;
  if (c.dir) {
    out[i++] = 1;
    out[i++] = c.dir.x;
    out[i++] = c.dir.y;
  } else {
    out[i++] = 0;
    out[i++] = 0;
    out[i++] = 0;
  }
  if (c.queued) {
    out[i++] = 1;
    out[i++] = c.queued.x;
    out[i++] = c.queued.y;
  } else {
    out[i++] = 0;
    out[i++] = 0;
    out[i++] = 0;
  }
  writeU16(out, i, c.bonusWait);
  i += 2;
  if (c.bonus) {
    out[i++] = 1;
    writeI16(out, i, c.bonus.x);
    writeI16(out, i + 2, c.bonus.y);
    writeU16(out, i + 4, c.bonus.ttl);
    i += 6;
  } else {
    out[i++] = 0;
  }
  out[i++] = c.foodN;
  for (let k = 0; k < c.foodN; k++) {
    writeI16(out, i, c.foodsX[k]!);
    writeI16(out, i + 2, c.foodsY[k]!);
    i += 4;
  }
  out[i++] = c.rockN;
  for (let k = 0; k < c.rockN; k++) {
    writeI16(out, i, c.rocksX[k]!);
    writeI16(out, i + 2, c.rocksY[k]!);
    writeI16(out, i + 4, c.rocksDx[k]!);
    writeI16(out, i + 6, c.rocksDy[k]!);
    i += 8;
  }
  let s = c.tail;
  for (let k = 0; k < c.len; k++) {
    writeI16(out, i, c.xs[s]!);
    writeI16(out, i + 2, c.ys[s]!);
    i += 4;
    s = next(s);
  }
  return n;
}

function readState(c: GameState, blob: Uint8Array, off: number, length: number): boolean {
  if (length < 28) return false;
  const end = off + length;
  if (end > blob.length) return false;
  let i = off;
  if (blob[i++] !== SAVE_VER) return false;
  const phase = phaseOf(blob[i++]!);
  if (!phase) return false;
  const feat = blob[i++]!;
  if (feat >= FEATS.length) return false;
  const wall = blob[i++]!;
  const food = blob[i++]!;
  const bonusOn = blob[i++]!;
  const rocks = blob[i++]!;
  const speed = blob[i++]!;
  const laser = blob[i++]!;
  if (wall > 1 || food > 1 || bonusOn > 1 || rocks > 2 || speed > 1 || laser > 1)
    return false;
  const len = readU16(blob, i);
  i += 2;
  const pending = readU16(blob, i);
  i += 2;
  const score = readU32(blob, i);
  i += 4;
  const step = readU16(blob, i);
  i += 2;
  const hasDir = blob[i++]!;
  const dx = blob[i++]! << 24 >> 24;
  const dy = blob[i++]! << 24 >> 24;
  const hasQ = blob[i++]!;
  const qx = blob[i++]! << 24 >> 24;
  const qy = blob[i++]! << 24 >> 24;
  const bonusWait = readU16(blob, i);
  i += 2;
  const hasBonus = blob[i++]!;
  if (len < 1 || len > CAP || pending > CAP) return false;
  if (hasDir > 1 || hasQ > 1 || hasBonus > 1) return false;
  if (hasDir && (dx < -1 || dx > 1 || dy < -1 || dy > 1 || (dx === 0 && dy === 0)))
    return false;
  if (hasQ && (qx < -1 || qx > 1 || qy < -1 || qy > 1 || (qx === 0 && qy === 0)))
    return false;
  let bonus: GameState["bonus"] = null;
  if (hasBonus) {
    if (i + 6 > end) return false;
    const bx = readI16(blob, i);
    const by = readI16(blob, i + 2);
    const ttl = readU16(blob, i + 4);
    i += 6;
    if (!inCell(bx, by)) return false;
    bonus = { x: bx, y: by, ttl };
  }
  if (i >= end) return false;
  const foodN = blob[i++]!;
  if (foodN > MAX_FOOD || i + foodN * 4 > end) return false;
  const fx = new Int16Array(MAX_FOOD);
  const fy = new Int16Array(MAX_FOOD);
  for (let k = 0; k < foodN; k++) {
    fx[k] = readI16(blob, i);
    fy[k] = readI16(blob, i + 2);
    i += 4;
    if (!inCell(fx[k]!, fy[k]!)) return false;
  }
  if (i >= end) return false;
  const rockN = blob[i++]!;
  if (rockN > ROCK_N || i + rockN * 8 + len * 4 > end) return false;
  const rx = new Int16Array(ROCK_N);
  const ry = new Int16Array(ROCK_N);
  const rdx = new Int16Array(ROCK_N);
  const rdy = new Int16Array(ROCK_N);
  for (let k = 0; k < rockN; k++) {
    rx[k] = readI16(blob, i);
    ry[k] = readI16(blob, i + 2);
    rdx[k] = readI16(blob, i + 4);
    rdy[k] = readI16(blob, i + 6);
    i += 8;
    if (!inCell(rx[k]!, ry[k]!)) return false;
  }
  c.occ.fill(0);
  c.tail = 0;
  c.head = len - 1;
  c.len = len;
  for (let k = 0; k < len; k++) {
    const x = readI16(blob, i);
    const y = readI16(blob, i + 2);
    i += 4;
    if (!inCell(x, y)) return false;
    c.xs[k] = x;
    c.ys[k] = y;
    c.occ[cell(x, y)] = SNAKE;
  }
  for (let k = 0; k < rockN; k++) {
    c.occ[cell(rx[k]!, ry[k]!)] = ROCK_MARK;
    c.rocksX[k] = rx[k]!;
    c.rocksY[k] = ry[k]!;
    c.rocksDx[k] = rdx[k]!;
    c.rocksDy[k] = rdy[k]!;
  }
  c.rockN = rockN;
  c.foodsX.set(fx);
  c.foodsY.set(fy);
  c.foodN = foodN;
  c.phase = phase;
  c.feat = feat;
  c.features.wall = wall ? "wrap" : "solid";
  c.features.food = food ? "multiple" : "single";
  c.features.bonus = bonusOn === 1;
  c.features.obstacles =
    rocks === 2 ? "moving" : rocks === 1 ? "static" : "off";
  c.features.speed = speed ? "ramp" : "flat";
  c.features.laser = laser === 1;
  c.pending = pending;
  c.score = score;
  c.step = step;
  c.dir = hasDir ? { x: dx, y: dy } : null;
  c.queued = hasQ ? { x: qx, y: qy } : null;
  c.bonusWait = bonusWait;
  c.bonus = bonus;
  return true;
}

export function createSnakeApp(): App {
  const gameState: GameState = {
    phase: "idle",
    features: {
      wall: "solid",
      food: "single",
      bonus: false,
      obstacles: "off",
      speed: "ramp",
      laser: false,
    },
    feat: 0,
    xs: new Int16Array(CAP),
    ys: new Int16Array(CAP),
    occ: new Uint8Array(CAP),
    head: 0,
    tail: 0,
    len: 0,
    pending: 0,
    dir: null,
    queued: null,
    foodsX: new Int16Array(MAX_FOOD),
    foodsY: new Int16Array(MAX_FOOD),
    foodN: 0,
    bonus: null,
    bonusWait: 0,
    rocksX: new Int16Array(ROCK_N),
    rocksY: new Int16Array(ROCK_N),
    rocksDx: new Int16Array(ROCK_N),
    rocksDy: new Int16Array(ROCK_N),
    rockN: 0,
    score: 0,
    step: 0,
  };
  reset(gameState);

  let tuneAt = 0;
  let tuneStep = 0;
  let tuneOn = false;

  function driveMusic(phase: Phase, cues?: CueQueue): void {
    if (phase !== "run") {
      if (tuneOn) sound(cues, Cue.Silence);
      tuneOn = false;
      tuneAt = 0;
      tuneStep = 0;
      return;
    }
    if (tuneOn && tuneAt < TUNE_EVERY) {
      tuneAt++;
      return;
    }
    sound(cues, TUNE[tuneStep]!);
    tuneStep = (tuneStep + 1) % TUNE.length;
    tuneAt = 0;
    tuneOn = true;
  }

  return {
    size: { w: W, h: H + HUD_H },
    tick(input, engine: Engine, cues?: CueQueue) {
      for (let i = 0; i < input.length; i++) {
        const k = keyOf(input.at(i));
        if (k === Key.CtrlC) {
          engine.stop();
          return;
        }
        if (gameState.phase === "run") continue;
        if (k === Key.Tab) {
          gameState.feat++;
          if (gameState.feat === FEATS.length) gameState.feat = 0;
        } else if (k === Key.Space) {
          cycleFeat(gameState);
        }
      }
      if (gameState.phase === "dead") {
        for (let i = 0; i < input.length; i++) {
          if (keyOf(input.at(i)) === Key.Enter) reset(gameState);
        }
        driveMusic(gameState.phase, cues);
        return;
      }
      if (gameState.phase === "idle") {
        const d = lastDir(input);
        if (!d) {
          driveMusic(gameState.phase, cues);
          return;
        }
        gameState.dir = d;
        gameState.step = moveEvery(gameState) - 1;
        gameState.phase = "run";
        driveMusic(gameState.phase, cues);
        return;
      }
      queueDir(gameState, lastDir(input));
      tickBonus(gameState, gameState.features);
      gameState.step++;
      if (gameState.step < moveEvery(gameState)) {
        driveMusic(gameState.phase, cues);
        return;
      }
      gameState.step = 0;
      if (gameState.queued) {
        gameState.dir = gameState.queued;
        gameState.queued = null;
      }
      stepMove(gameState, gameState.features, cues);
      if (gameState.phase !== "run") sound(cues, Cue.Die);
      driveMusic(gameState.phase, cues);
    },
    view(out) {
      drawBoard(gameState, out);
    },
    snapshot(out) {
      return writeState(gameState, out);
    },
    hydrate(blob, offset, length) {
      if (!readState(gameState, blob, offset, length)) reset(gameState);
    },
  };
}
