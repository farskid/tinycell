// Battle City. Tanks, walls, and the eagle are cells on a 26×26 field.
import {
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

export const Cue = {
  Shot: 1,
  Hit: 2,
  Die: 3,
  Power: 4,
  Blast: 5,
  Win: 6,
  Lose: 7,
  Eagle: 8,
  Steel: 9,
  Armor: 10,
  Enemy: 11,
  Appear: 12,
  Engine: 13,
  Idle: 14,
} as const;

const FIELD = 26;
const OX = 1;
const OY = 1;
const HUD = 8;
export const BATTLE_W = OX + FIELD + 1 + HUD;
export const BATTLE_H = OY + FIELD + 1;

const EMPTY = 0;
const BRICK = 1;
const STEEL = 2;
const WATER = 3;
const BUSH = 4;
const ICE = 5;
const EAGLE = 6;

const UP = 0;
const RIGHT = 1;
const DOWN = 2;
const LEFT = 3;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

const PHASE_TITLE = 0;
const PHASE_INTRO = 1;
const PHASE_PLAY = 2;
const PHASE_CLEAR = 3;
const PHASE_OVER = 4;

const ENEMY_N = 20;
const MAX_ON = 4;
const MAX_BULLETS = 6;
const LIVES = 3;
const SAVE_VER = 1;
const POINTS = [100, 200, 300, 400];

/** [set][dir][quad]. Set 0 is the player. Sets 1–4 are the four enemy kinds. */
export const TANK_ID: number[][][] = [];
let pic = 0xe100;
for (let set = 0; set < 5; set++) {
  const dirs: number[][] = [];
  for (let dir = 0; dir < 4; dir++) {
    const quads: number[] = [];
    for (let q = 0; q < 4; q++) quads.push(pic++);
    dirs.push(quads);
  }
  TANK_ID.push(dirs);
}

export const TILE = {
  brick: pic++,
  steel: pic++,
  water: pic++,
  water2: pic++,
  bush: pic++,
  ice: pic++,
  eagle: [pic++, pic++, pic++, pic++],
} as const;

function takePics(n: number): number[] {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) ids.push(pic++);
  return ids;
}

/** Bullet, kill burst, and the 100/200/300/400 popup. Quads are row-major. */
export const FX = {
  bullet: pic++,
  small: [takePics(4), takePics(4), takePics(4)],
  big: [takePics(16), takePics(16)],
  score: [takePics(2), takePics(2), takePics(2), takePics(2)],
} as const;

const GROUND = packCell(0x20, Color.Default, Color.Black);
const BRICK_CELL = packCell(TILE.brick, Color.BrightRed, Color.Red);
const STEEL_CELL = packCell(TILE.steel, Color.BrightWhite, Color.White);
const WATER_CELL = packCell(TILE.water, Color.BrightCyan, Color.Blue);
const BUSH_CELL = packCell(TILE.bush, Color.BrightGreen, Color.Green);
const ICE_CELL = packCell(TILE.ice, Color.BrightWhite, Color.Cyan);
const EAGLE_DEAD = packCell(0x2716, Color.BrightWhite, Color.Red);
const FRAME = packCell(0x20, Color.Default, Color.BrightBlack);
const PLAYER_CELL = packCell(0x20, Color.Default, Color.BrightYellow);
const BULLET_CELL = packCell(FX.bullet, Color.BrightWhite, Color.Black);
const SMALL_END = 6;
const BIG_END = 10;
const BOOM_END = 22;
const ENEMY_BG = [
  Color.BrightWhite,
  Color.BrightGreen,
  Color.BrightRed,
  Color.BrightCyan,
];

type Bullet = {
  x: number;
  y: number;
  dir: number;
  player: boolean;
  power: boolean;
  alive: boolean;
};

type Foe = {
  x: number;
  y: number;
  dir: number;
  kind: number;
  hp: number;
  cool: number;
  think: number;
  fire: number;
  flash: boolean;
  spawn: number;
  alive: boolean;
};

type Item = { x: number; y: number; kind: number; left: number };

type Boom = { x: number; y: number; age: number; points: number };

type State = {
  phase: number;
  stage: number;
  lives: number;
  power: number;
  score: number;
  left: number;
  spawned: number;
  spawnIn: number;
  intro: number;
  shield: number;
  freeze: number;
  shovel: number;
  pause: boolean;
  eagle: boolean;
  px: number;
  py: number;
  pdir: number;
  pcool: number;
  pfire: number;
  respawn: number;
  seed: number;
  tick: number;
  tiles: Uint8Array;
  foes: Foe[];
  bullets: Bullet[];
  item: Item | null;
  booms: Boom[];
  rolling: boolean;
};

const STAGES: readonly (readonly string[])[] = [
  [
    "....##..##...",
    "....##..##...",
    "....##@@##...",
    "....##..##...",
    "....##..##...",
    ".............",
    "##..##..##..#",
    "...##..##....",
    "...##..##....",
    "...##..##....",
    "...##..##....",
    "....####.....",
    ".....#.#.....",
  ],
  [
    ".............",
    ".##.##.##.##.",
    "..#..#..#..#.",
    ".##.##.##.##.",
    ".............",
    "@@.........@@",
    "....##.##....",
    "....#...#....",
    "....##.##....",
    "~~~.......~~~",
    "%%..##.##..%%",
    "....####.....",
    ".....#.#.....",
  ],
  [
    "@@.........@@",
    "..##.....##..",
    "..#~~~~~~~#..",
    "..#.~###~.#..",
    "....~#.#~....",
    ".##.~...~.##.",
    "....~###~....",
    "..#~~~~~~~#..",
    "..##.....##..",
    ".............",
    "%##%.....%##%",
    "....####.....",
    ".....#.#.....",
  ],
  [
    "###.......###",
    "#.#.#####.#.#",
    "#.#.#...#.#.#",
    "....#.@.#....",
    "##..#...#..##",
    "......#......",
    "##..#...#..##",
    "....#.@.#....",
    "#.#.#...#.#.#",
    "#.#.#####.#.#",
    "###.......###",
    "....####.....",
    ".....#.#.....",
  ],
  [
    "-------------",
    "--##-----##--",
    "--#-------#--",
    "----@@@@@----",
    "------#------",
    "###-------###",
    "------#------",
    "----@@@@@----",
    "--#-------#--",
    "--##-----##--",
    "-------------",
    "....####.....",
    ".....#.#.....",
  ],
  [
    "%#%.......%#%",
    "#.#.~~~~~.#.#",
    "....~###~....",
    "##..~#.#~..##",
    "....~###~....",
    "@@.........@@",
    "....~###~....",
    "##..~#.#~..##",
    "....~###~....",
    "#.#.~~~~~.#.#",
    "%#%.......%#%",
    "....####.....",
    ".....#.#.....",
  ],
  [
    "@@@.......@@@",
    "@#@.##.##.@#@",
    ".............",
    "##.#######.##",
    "#...........#",
    "#.@@.....@@.#",
    "#...........#",
    "##.#######.##",
    ".............",
    "~~~.##.##.~~~",
    "%%%.##.##.%%%",
    "....####.....",
    ".....#.#.....",
  ],
  [
    "#############",
    "#...........#",
    "#.@@@...@@@.#",
    "#.@#@...@#@.#",
    "#.@@@...@@@.#",
    "#.....~.....#",
    "#.###.~.###.#",
    "#.#...~...#.#",
    "#.###.~.###.#",
    "#...........#",
    "#############",
    "....####.....",
    ".....#.#.....",
  ],
];

function fresh(): State {
  const s = blank();
  loadStage(s);
  return s;
}

function blank(): State {
  return {
    phase: PHASE_TITLE,
    stage: 0,
    lives: LIVES,
    power: 0,
    score: 0,
    left: ENEMY_N,
    spawned: 0,
    spawnIn: 10,
    intro: 0,
    shield: 0,
    freeze: 0,
    shovel: 0,
    pause: false,
    eagle: true,
    px: 8,
    py: 24,
    pdir: UP,
    pcool: 0,
    pfire: 0,
    respawn: 0,
    seed: 1,
    tick: 0,
    tiles: new Uint8Array(FIELD * FIELD),
    foes: [],
    bullets: [],
    item: null,
    booms: [],
    rolling: false,
  };
}

function loadStage(s: State): void {
  const rows = STAGES[s.stage % STAGES.length]!;
  const tiles = new Uint8Array(FIELD * FIELD);
  for (let r = 0; r < 13; r++) {
    const row = rows[r] ?? "";
    for (let c = 0; c < 13; c++) {
      const kind = tileOf(row[c] ?? ".");
      stamp(tiles, c * 2, r * 2, kind);
    }
  }
  stamp(tiles, 12, 24, EAGLE);
  clearPad(tiles, 8, 24);
  clearPad(tiles, 0, 0);
  clearPad(tiles, 12, 0);
  clearPad(tiles, 24, 0);
  s.tiles = tiles;
  s.foes = [];
  s.bullets = [];
  s.item = null;
  s.booms = [];
  s.rolling = false;
  s.left = ENEMY_N;
  s.spawned = 0;
  s.spawnIn = 8;
  s.px = 8;
  s.py = 24;
  s.pdir = UP;
  s.pcool = 0;
  s.pfire = 0;
  s.respawn = 0;
  s.shield = 40;
  s.freeze = 0;
  s.shovel = 0;
  s.eagle = true;
  s.pause = false;
}

function tileOf(ch: string): number {
  if (ch === "#") return BRICK;
  if (ch === "@") return STEEL;
  if (ch === "~") return WATER;
  if (ch === "%") return BUSH;
  if (ch === "-") return ICE;
  return EMPTY;
}

function stamp(tiles: Uint8Array, x: number, y: number, kind: number): void {
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) tiles[(y + dy) * FIELD + x + dx] = kind;
  }
}

function clearPad(tiles: Uint8Array, x: number, y: number): void {
  stamp(tiles, x, y, EMPTY);
}

function at(s: State, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= FIELD || y >= FIELD) return STEEL;
  return s.tiles[y * FIELD + x]!;
}

function setAt(s: State, x: number, y: number, kind: number): void {
  if (x < 0 || y < 0 || x >= FIELD || y >= FIELD) return;
  s.tiles[y * FIELD + x] = kind;
}

function rnd(s: State): number {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed;
}

function sound(cues: CueQueue | undefined, id: number): void {
  cues?.push(id);
}

function haltEngine(s: State, cues: CueQueue | undefined): void {
  if (!s.rolling) return;
  s.rolling = false;
  sound(cues, Cue.Idle);
}

function rollEngine(s: State, cues: CueQueue | undefined): void {
  if (s.rolling) return;
  s.rolling = true;
  sound(cues, Cue.Engine);
}

function spawnBoom(s: State, x: number, y: number, points: number): void {
  if (s.booms.length >= 8) s.booms.shift();
  s.booms.push({ x, y, age: 0, points });
}

function stepBooms(s: State): void {
  if (s.booms.length === 0) return;
  const keep: Boom[] = [];
  for (const boom of s.booms) {
    boom.age++;
    const end = boom.points > 0 ? BOOM_END : BIG_END;
    if (boom.age < end) keep.push(boom);
  }
  s.booms = keep;
}

function drawBoom(out: Surface, boom: Boom): void {
  if (boom.age < SMALL_END) {
    stampIds(out, boom.x, boom.y, 2, FX.small[(boom.age / 2) | 0] ?? FX.small[0]);
    return;
  }
  if (boom.age < BIG_END) {
    const frame = FX.big[((boom.age - SMALL_END) / 2) | 0] ?? FX.big[0];
    stampIds(out, boom.x - 1, boom.y - 1, 4, frame);
    return;
  }
  const row = FX.score[((POINTS.indexOf(boom.points) % 4) + 4) % 4] ?? FX.score[0];
  stampIds(out, boom.x, boom.y, 2, row);
}

function stampIds(
  out: Surface,
  x: number,
  y: number,
  cols: number,
  ids: readonly number[],
): void {
  for (let i = 0; i < ids.length; i++) {
    const fx = x + (i % cols);
    const fy = y + ((i / cols) | 0);
    if (fx < 0 || fy < 0 || fx >= FIELD || fy >= FIELD) continue;
    out.set(OX + fx, OY + fy, packCell(ids[i]!, Color.BrightWhite, Color.Black));
  }
}

function tankBlocked(s: State, x: number, y: number, self: Foe | null): boolean {
  if (x < 0 || y < 0 || x + 2 > FIELD || y + 2 > FIELD) return true;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const t = at(s, x + dx, y + dy);
      if (t === BRICK || t === STEEL || t === WATER || t === EAGLE) return true;
    }
  }
  if (self !== null && s.respawn === 0 && overlap(x, y, s.px, s.py)) return true;
  for (const foe of s.foes) {
    if (!foe.alive || foe === self) continue;
    if (overlap(x, y, foe.x, foe.y)) return true;
  }
  return false;
}

function overlap(ax: number, ay: number, bx: number, by: number): boolean {
  return ax < bx + 2 && ax + 2 > bx && ay < by + 2 && ay + 2 > by;
}

function covers(x: number, y: number, cx: number, cy: number): boolean {
  return cx >= x && cx < x + 2 && cy >= y && cy < y + 2;
}

function stepPeriod(power: number, kind: number, player: boolean): number {
  if (player) return power === 0 ? 3 : 2;
  return kind === 1 ? 2 : 4;
}

function onIce(s: State, x: number, y: number): boolean {
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      if (at(s, x + dx, y + dy) === ICE) return true;
    }
  }
  return false;
}

function tryStep(
  s: State,
  x: number,
  y: number,
  dir: number,
  self: Foe | null,
): { x: number; y: number; dir: number } | null {
  const nx = x + (DX[dir] ?? 0);
  const ny = y + (DY[dir] ?? 0);
  if (tankBlocked(s, nx, ny, self)) return null;
  return { x: nx, y: ny, dir };
}

function foeKind(s: State): number {
  const n = s.stage;
  const r = rnd(s) % 10;
  if (n < 2) return r > 7 ? 1 : 0;
  if (r > 8) return 3;
  if (r > 6) return 2;
  if (r > 3) return 1;
  return 0;
}

function spawnFoe(s: State): void {
  const pads = [0, 12, 24];
  const start = rnd(s) % 3;
  for (let i = 0; i < 3; i++) {
    const x = pads[(start + i) % 3]!;
    if (tankBlocked(s, x, 0, null)) continue;
    if (s.respawn === 0 && overlap(x, 0, s.px, s.py)) continue;
    const kind = foeKind(s);
    s.foes.push({
      x,
      y: 0,
      dir: DOWN,
      kind,
      hp: kind === 3 ? 4 : 1,
      cool: 8,
      think: 4 + (rnd(s) % 10),
      fire: 10 + (rnd(s) % 10),
      flash: s.spawned === 3 || s.spawned === 10 || s.spawned === 17,
      spawn: 16,
      alive: true,
    });
    s.spawned++;
    s.left--;
    s.spawnIn = 28;
    return;
  }
}

function aliveFoes(s: State): number {
  let n = 0;
  for (const foe of s.foes) if (foe.alive) n++;
  return n;
}

function bulletCount(s: State, player: boolean): number {
  let n = 0;
  for (const b of s.bullets) if (b.alive && b.player === player) n++;
  return n;
}

function shoot(
  s: State,
  x: number,
  y: number,
  dir: number,
  player: boolean,
  power: boolean,
  cues: CueQueue | undefined,
): void {
  const cap = player ? (s.power >= 2 ? 2 : 1) : 1;
  if (bulletCount(s, player) >= cap) return;
  let bx = x;
  let by = y;
  if (dir === UP) by = y - 1;
  else if (dir === DOWN) by = y + 2;
  else if (dir === LEFT) bx = x - 1;
  else bx = x + 2;
  if (dir === UP || dir === DOWN) bx = x;
  const bullet: Bullet = { x: bx, y: by, dir, player, power, alive: true };
  if (!strike(s, bullet, cues)) s.bullets.push(bullet);
  sound(cues, player ? Cue.Shot : Cue.Enemy);
}

function killEagle(s: State, cues: CueQueue | undefined): void {
  if (!s.eagle) return;
  s.eagle = false;
  spawnBoom(s, 12, 24, 0);
  sound(cues, Cue.Eagle);
  s.phase = PHASE_OVER;
  s.intro = 0;
  sound(cues, Cue.Lose);
}

function killFoe(s: State, foe: Foe, cues: CueQueue | undefined): void {
  foe.alive = false;
  const points = POINTS[foe.kind] ?? 100;
  s.score += points;
  sound(cues, Cue.Die);
  spawnBoom(s, foe.x, foe.y, points);
  if (!foe.flash) return;
  s.item = { x: foe.x, y: foe.y, kind: rnd(s) % 6, left: 200 };
  sound(cues, Cue.Appear);
}

function killPlayer(s: State, cues: CueQueue | undefined): void {
  if (s.respawn > 0 || s.shield > 0) return;
  s.lives--;
  s.respawn = 36;
  s.power = 0;
  haltEngine(s, cues);
  sound(cues, Cue.Die);
  spawnBoom(s, s.px, s.py, 0);
  if (s.lives <= 0) {
    s.phase = PHASE_OVER;
    sound(cues, Cue.Lose);
  }
}

function applyItem(s: State, cues: CueQueue | undefined): void {
  const item = s.item;
  if (!item) return;
  s.item = null;
  sound(cues, Cue.Power);
  if (item.kind === 0) s.power = Math.min(3, s.power + 1);
  else if (item.kind === 1) s.lives = Math.min(9, s.lives + 1);
  else if (item.kind === 2) s.shield = 160;
  else if (item.kind === 3) {
    s.shovel = 220;
    fortify(s, STEEL);
  } else if (item.kind === 4) s.freeze = 160;
  else {
    sound(cues, Cue.Blast);
    for (const foe of s.foes) {
      if (!foe.alive) continue;
      foe.alive = false;
      const points = POINTS[foe.kind] ?? 100;
      s.score += points;
      spawnBoom(s, foe.x, foe.y, points);
    }
  }
}

const FORT = [
  [11, 23],
  [12, 23],
  [13, 23],
  [14, 23],
  [11, 24],
  [11, 25],
  [14, 24],
  [14, 25],
];

function fortify(s: State, kind: number): void {
  for (const [x, y] of FORT) {
    if (at(s, x!, y!) === EAGLE) continue;
    setAt(s, x!, y!, kind);
  }
}

function stepBullets(s: State, cues: CueQueue | undefined): void {
  const next: Array<{ x: number; y: number }> = [];
  for (const b of s.bullets) {
    if (!b.alive) {
      next.push({ x: b.x, y: b.y });
      continue;
    }
    const nx = b.x + (DX[b.dir] ?? 0);
    const ny = b.y + (DY[b.dir] ?? 0);
    next.push({ x: nx, y: ny });
    b.x = nx;
    b.y = ny;
    if (strike(s, b, cues)) b.alive = false;
  }
  for (let i = 0; i < s.bullets.length; i++) {
    const a = s.bullets[i]!;
    if (!a.alive) continue;
    for (let j = i + 1; j < s.bullets.length; j++) {
      const c = s.bullets[j]!;
      if (!c.alive || a.player === c.player) continue;
      const hit =
        (a.x === c.x && a.y === c.y) ||
        (next[i]!.x === c.x && next[i]!.y === c.y && next[j]!.x === a.x && next[j]!.y === a.y);
      if (!hit) continue;
      a.alive = false;
      c.alive = false;
    }
  }
  for (const b of s.bullets) {
    if (!b.alive) continue;
    if (b.player) {
      for (const foe of s.foes) {
        if (!foe.alive || foe.spawn > 0) continue;
        if (!covers(foe.x, foe.y, b.x, b.y)) continue;
        b.alive = false;
        foe.hp--;
        if (foe.hp <= 0) killFoe(s, foe, cues);
        else sound(cues, Cue.Armor);
        break;
      }
    } else if (s.respawn === 0 && s.shield === 0 && covers(s.px, s.py, b.x, b.y)) {
      b.alive = false;
      killPlayer(s, cues);
    }
  }
  s.bullets = s.bullets.filter((b) => b.alive);
}

function strike(s: State, b: Bullet, cues: CueQueue | undefined): boolean {
  if (b.x < 0 || b.y < 0 || b.x >= FIELD || b.y >= FIELD) return true;
  const t = at(s, b.x, b.y);
  if (t === BRICK) {
    setAt(s, b.x, b.y, EMPTY);
    if (b.power) punch(s, b.x, b.y, b.dir);
    sound(cues, Cue.Hit);
    return true;
  }
  if (t === STEEL) {
    if (b.power) {
      setAt(s, b.x, b.y, EMPTY);
      sound(cues, Cue.Hit);
    } else sound(cues, Cue.Steel);
    return true;
  }
  if (t === EAGLE) {
    killEagle(s, cues);
    return true;
  }
  return false;
}

function punch(s: State, x: number, y: number, dir: number): void {
  const nx = x + (DX[dir] ?? 0);
  const ny = y + (DY[dir] ?? 0);
  if (at(s, nx, ny) === BRICK) setAt(s, nx, ny, EMPTY);
}

function thinkDir(s: State, foe: Foe): number {
  const roll = rnd(s) % 10;
  let tx = 12;
  let ty = 24;
  if (roll < 4 && s.respawn === 0) {
    tx = s.px;
    ty = s.py;
  } else if (roll < 7) {
    tx = 12;
    ty = 24;
  } else return rnd(s) % 4;
  if (Math.abs(tx - foe.x) > Math.abs(ty - foe.y)) return tx < foe.x ? LEFT : RIGHT;
  return ty < foe.y ? UP : DOWN;
}

function stepFoes(s: State, cues: CueQueue | undefined): void {
  if (s.freeze > 0) {
    s.freeze--;
    return;
  }
  for (const foe of s.foes) {
    if (!foe.alive) continue;
    if (foe.spawn > 0) {
      foe.spawn--;
      continue;
    }
    if (foe.fire > 0) foe.fire--;
    const lined =
      foe.x === s.px ||
      foe.y === s.py ||
      (foe.x === 12 && foe.dir === DOWN);
    if (foe.fire === 0 && (lined || rnd(s) % 8 === 0)) {
      shoot(s, foe.x, foe.y, foe.dir, false, foe.kind === 2, cues);
      foe.fire = foe.kind === 2 ? 8 : 18;
    }
    if (foe.cool > 0) {
      foe.cool--;
      continue;
    }
    foe.think--;
    let dir = foe.dir;
    if (foe.think <= 0) {
      dir = thinkDir(s, foe);
      foe.think = 6 + (rnd(s) % 14);
    }
    const moved = tryStep(s, foe.x, foe.y, dir, foe);
    if (moved) {
      foe.x = moved.x;
      foe.y = moved.y;
      foe.dir = moved.dir;
    } else {
      foe.dir = rnd(s) % 4;
      foe.think = 2;
    }
    foe.cool = stepPeriod(0, foe.kind, false) - 1;
  }
}

function stepPlayer(s: State, dir: number, fire: boolean, cues: CueQueue | undefined): void {
  if (s.respawn > 0) {
    haltEngine(s, cues);
    s.respawn--;
    if (s.respawn === 0 && s.lives > 0 && s.phase === PHASE_PLAY) {
      s.px = 8;
      s.py = 24;
      s.pdir = UP;
      s.shield = 40;
      if (tankBlocked(s, s.px, s.py, null)) s.respawn = 8;
    }
    return;
  }
  if (s.shield > 0) s.shield--;
  if (s.pfire > 0) s.pfire--;
  if (fire && s.pfire === 0) {
    shoot(s, s.px, s.py, s.pdir, true, s.power >= 3, cues);
    s.pfire = s.power >= 2 ? 4 : 6;
  }
  const held = dir >= 0;
  const slip = !held && onIce(s, s.px, s.py);
  const want = held ? dir : slip ? s.pdir : -1;
  if (want < 0) {
    haltEngine(s, cues);
    return;
  }
  if (s.pcool > 0) {
    s.pcool--;
    if (held) s.pdir = want;
    return;
  }
  const moved = tryStep(s, s.px, s.py, want, null);
  if (moved) {
    s.px = moved.x;
    s.py = moved.y;
    s.pdir = moved.dir;
    rollEngine(s, cues);
  } else {
    if (held) s.pdir = want;
    haltEngine(s, cues);
  }
  s.pcool = stepPeriod(s.power, 0, true) - 1;
}

function keysOf(input: InputQueue): { dir: number; fire: boolean; start: boolean; pause: boolean } {
  let dir = -1;
  let fire = false;
  let start = false;
  let pause = false;
  for (let i = 0; i < input.length; i++) {
    const key = keyOf(input.at(i));
    if (key === Key.Up) dir = UP;
    else if (key === Key.Right) dir = RIGHT;
    else if (key === Key.Down) dir = DOWN;
    else if (key === Key.Left) dir = LEFT;
    else if (key === Key.Space) fire = true;
    else if (key === Key.Enter) start = true;
    else if (key === Key.Escape) pause = true;
  }
  return { dir, fire, start, pause };
}

function tickPlay(s: State, dir: number, fire: boolean, cues: CueQueue | undefined): void {
  stepBooms(s);
  s.tick++;
  if (s.shovel > 0) {
    s.shovel--;
    if (s.shovel === 0) fortify(s, BRICK);
  }
  stepBullets(s, cues);
  if (s.phase !== PHASE_PLAY) return;
  stepPlayer(s, dir, fire, cues);
  if (s.phase !== PHASE_PLAY) return;
  stepFoes(s, cues);
  if (s.item && s.respawn === 0 && covers(s.px, s.py, s.item.x, s.item.y)) applyItem(s, cues);
  if (s.item) {
    s.item.left--;
    if (s.item.left <= 0) s.item = null;
  }
  if (s.left > 0 && aliveFoes(s) < MAX_ON) {
    s.spawnIn--;
    if (s.spawnIn <= 0) spawnFoe(s);
  }
  if (s.left === 0 && aliveFoes(s) === 0 && s.phase === PHASE_PLAY) {
    s.phase = PHASE_CLEAR;
    s.intro = 50;
    haltEngine(s, cues);
    sound(cues, Cue.Win);
  }
}

function beginStage(s: State): void {
  loadStage(s);
  s.phase = PHASE_INTRO;
  s.intro = 36;
}

export function createBattleCityApp(): App {
  const s = fresh();

  return {
    size: { w: BATTLE_W, h: BATTLE_H },

    tick(input: InputQueue, _engine: Engine, cues?: CueQueue): void {
      const keys = keysOf(input);
      if (keys.pause && s.phase === PHASE_PLAY) {
        s.pause = !s.pause;
        if (s.pause) haltEngine(s, cues);
      }
      if (s.pause) return;
      if (s.phase === PHASE_TITLE) {
        if (keys.start) {
          const score = 0;
          const seed = s.seed;
          Object.assign(s, blank());
          s.score = score;
          s.seed = seed;
          beginStage(s);
        }
        return;
      }
      if (s.phase === PHASE_OVER) {
        stepBooms(s);
        if (keys.start) {
          const seed = s.seed;
          Object.assign(s, blank());
          s.seed = seed;
        }
        return;
      }
      if (s.phase === PHASE_INTRO) {
        s.intro--;
        if (s.intro <= 0) s.phase = PHASE_PLAY;
        return;
      }
      if (s.phase === PHASE_CLEAR) {
        stepBooms(s);
        s.intro--;
        if (s.intro <= 0) {
          s.stage++;
          beginStage(s);
        }
        return;
      }
      tickPlay(s, keys.dir, keys.fire, cues);
    },

    view(out: Surface): void {
      out.fill(GROUND);
      for (let y = 0; y < BATTLE_H; y++) {
        out.set(0, y, FRAME);
        out.set(OX + FIELD, y, FRAME);
      }
      for (let x = 0; x < OX + FIELD + 1; x++) {
        out.set(x, 0, FRAME);
        out.set(x, OY + FIELD, FRAME);
      }
      for (let y = 0; y < FIELD; y++) {
        for (let x = 0; x < FIELD; x++) {
          const t = s.tiles[y * FIELD + x]!;
          if (t === EAGLE) {
            const bg = s.eagle ? Color.BrightYellow : Color.Red;
            const qx = x - 12;
            const qy = y - 24;
            const ch =
              s.eagle && qx >= 0 && qx < 2 && qy >= 0 && qy < 2
                ? TILE.eagle[qy * 2 + qx]!
                : x === 12 && y === 24
                  ? 0x58
                  : 0x20;
            out.set(OX + x, OY + y, packCell(ch, Color.Black, bg));
            continue;
          }
          const cell = terrain(t, s.eagle, s.tick);
          if (cell !== 0 && t !== BUSH) out.set(OX + x, OY + y, cell);
        }
      }
      if (s.phase !== PHASE_TITLE && s.respawn === 0)
        drawTank(
          out,
          s.px,
          s.py,
          s.pdir,
          PLAYER_CELL,
          s.shield > 0 && (s.tick & 2) === 0,
          0,
        );
      for (const foe of s.foes) {
        if (!foe.alive) continue;
        if (foe.spawn > 0 && (s.tick & 2) === 0) continue;
        const bg = foe.flash && (s.tick & 4) === 0 ? Color.BrightRed : ENEMY_BG[foe.kind]!;
        const cell = packCell(0x20, Color.Default, bg);
        drawTank(out, foe.x, foe.y, foe.dir, cell, false, foe.kind + 1);
      }
      for (const b of s.bullets) {
        if (!b.alive) continue;
        if (b.x < 0 || b.y < 0 || b.x >= FIELD || b.y >= FIELD) continue;
        out.set(OX + b.x, OY + b.y, BULLET_CELL);
      }
      if (s.item && (s.tick & 4) === 0) {
        const ch = ITEM_CH[s.item.kind] ?? 0x3f;
        out.set(OX + s.item.x, OY + s.item.y, packCell(ch, Color.Black, Color.BrightMagenta));
      }
      for (let y = 0; y < FIELD; y++) {
        for (let x = 0; x < FIELD; x++) {
          if (s.tiles[y * FIELD + x] !== BUSH) continue;
          out.set(OX + x, OY + y, BUSH_CELL);
        }
      }
      for (const boom of s.booms) drawBoom(out, boom);
      drawHud(out, s);
      if (s.phase === PHASE_TITLE) overlay(out, "BATTLE CITY", "ENTER");
      else if (s.phase === PHASE_INTRO) overlay(out, `STAGE ${s.stage + 1}`, "");
      else if (s.phase === PHASE_CLEAR) overlay(out, "CLEARED", "");
      else if (s.phase === PHASE_OVER) overlay(out, s.eagle ? "GAME OVER" : "EAGLE LOST", "ENTER");
      else if (s.pause) overlay(out, "PAUSED", "");
    },

    snapshot(out: Uint8Array): number {
      const need = payloadSize();
      if (out.length < need) return need;
      let i = writeHead(out, s);
      out.set(s.tiles, i);
      i += FIELD * FIELD;
      for (const foe of padFoes(s.foes)) {
        out[i++] = foe.alive ? 1 : 0;
        out[i++] = foe.x;
        out[i++] = foe.y;
        out[i++] = foe.dir;
        out[i++] = foe.kind;
        out[i++] = foe.hp;
        out[i++] = foe.flash ? 1 : 0;
        out[i++] = foe.spawn;
      }
      const bullets = s.bullets.filter((b) => b.alive).slice(0, MAX_BULLETS);
      for (let n = 0; n < MAX_BULLETS; n++) {
        const b = bullets[n];
        out[i++] = b?.alive ? 1 : 0;
        out[i++] = b?.x ?? 0;
        out[i++] = b?.y ?? 0;
        out[i++] = b?.dir ?? 0;
        out[i++] = b?.player ? 1 : 0;
        out[i++] = b?.power ? 1 : 0;
      }
      out[i++] = s.item ? 1 : 0;
      out[i++] = s.item?.x ?? 0;
      out[i++] = s.item?.y ?? 0;
      out[i++] = s.item?.kind ?? 0;
      out[i++] = s.item?.left ?? 0;
      return i;
    },

    hydrate(blob: Uint8Array, offset: number, length: number): void {
      if (length < payloadSize()) return;
      const next = blank();
      let i = offset;
      if (blob[i++] !== SAVE_VER) return;
      next.phase = blob[i++]!;
      next.stage = blob[i++]!;
      next.lives = blob[i++]!;
      next.power = blob[i++]!;
      next.score = blob[i]! | (blob[i + 1]! << 8) | (blob[i + 2]! << 16) | (blob[i + 3]! << 24);
      i += 4;
      next.left = blob[i++]!;
      next.spawned = blob[i++]!;
      next.px = blob[i++]!;
      next.py = blob[i++]!;
      next.pdir = blob[i++]! % 4;
      next.shield = blob[i++]!;
      next.freeze = blob[i++]!;
      next.shovel = blob[i++]!;
      next.eagle = blob[i++]! === 1;
      next.pause = blob[i++]! === 1;
      next.respawn = blob[i++]!;
      next.intro = blob[i++]!;
      next.seed = blob[i]! | (blob[i + 1]! << 8) | (blob[i + 2]! << 16) | (blob[i + 3]! << 24);
      i += 4;
      next.tiles = blob.slice(i, i + FIELD * FIELD);
      i += FIELD * FIELD;
      next.foes = [];
      for (let n = 0; n < MAX_ON; n++) {
        const alive = blob[i++]! === 1;
        const foe: Foe = {
          x: blob[i++]!,
          y: blob[i++]!,
          dir: blob[i++]! % 4,
          kind: blob[i++]! % 4,
          hp: blob[i++]!,
          cool: 0,
          think: 4,
          fire: 8,
          flash: blob[i++]! === 1,
          spawn: blob[i++]!,
          alive,
        };
        if (alive) next.foes.push(foe);
      }
      next.bullets = [];
      for (let n = 0; n < MAX_BULLETS; n++) {
        const alive = blob[i++]! === 1;
        const b: Bullet = {
          x: blob[i++]!,
          y: blob[i++]!,
          dir: blob[i++]! % 4,
          player: blob[i++]! === 1,
          power: blob[i++]! === 1,
          alive,
        };
        if (alive) next.bullets.push(b);
      }
      if (blob[i++]! === 1) {
        next.item = {
          x: blob[i++]!,
          y: blob[i++]!,
          kind: blob[i++]!,
          left: blob[i++]!,
        };
      }
      Object.assign(s, next);
    },
  };
}

const ITEM_CH = [0x2b, 0x54, 0x48, 0x53, 0x43, 0x42];

function terrain(t: number, eagle: boolean, tick: number): number {
  if (t === BRICK) return BRICK_CELL;
  if (t === STEEL) return STEEL_CELL;
  if (t === WATER)
    return (tick & 8) === 0
      ? WATER_CELL
      : packCell(TILE.water2, Color.Cyan, Color.Blue);
  if (t === ICE) return ICE_CELL;
  if (t === EAGLE) return eagle ? 0 : EAGLE_DEAD;
  if (t === BUSH) return BUSH_CELL;
  return 0;
}

function drawTank(
  out: Surface,
  x: number,
  y: number,
  dir: number,
  body: number,
  hide: boolean,
  set: number,
): void {
  if (hide) return;
  const bg = body === PLAYER_CELL ? Color.BrightYellow : cellBgOf(body);
  const ids = TANK_ID[set]?.[dir] ?? TANK_ID[0]![UP]!;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      out.set(
        OX + x + dx,
        OY + y + dy,
        packCell(ids[dy * 2 + dx]!, Color.Black, bg),
      );
    }
  }
}

function cellBgOf(cell: number): number {
  return (cell >>> 20) & 0x0f | ((cell & (1 << 29)) !== 0 ? 0x10 : 0);
}

function drawHud(out: Surface, s: State): void {
  const x = OX + FIELD + 2;
  out.writeText(x, 1, "ENEMY", Color.BrightWhite, Color.Black);
  let n = s.left;
  for (let i = 0; i < ENEMY_N; i++) {
    const col = i % 2;
    const row = (i / 2) | 0;
    const mark = i < n ? packCell(0x25a0, Color.BrightWhite, Color.Black) : GROUND;
    out.set(x + col * 2, 3 + row, mark);
  }
  out.writeText(x, 15, "P1", Color.BrightYellow, Color.Black);
  out.writeText(x, 16, `x${Math.max(0, s.lives - 1)}`, Color.BrightWhite, Color.Black);
  out.writeText(x, 18, "SCORE", Color.BrightWhite, Color.Black);
  out.writeText(x, 19, String(s.score).padStart(6, "0"), Color.BrightYellow, Color.Black);
  out.writeText(x, 22, "STAGE", Color.BrightWhite, Color.Black);
  out.writeText(x, 23, String(s.stage + 1).padStart(2, "0"), Color.BrightWhite, Color.Black);
  if (s.power > 0) out.writeText(x, 25, `STAR${s.power}`, Color.BrightYellow, Color.Black);
}

function overlay(out: Surface, title: string, sub: string): void {
  const y = 12;
  const x = OX + ((FIELD - title.length) >> 1);
  out.writeText(x - 1, y, ` ${title} `, Color.BrightWhite, Color.Black);
  if (sub) out.writeText(OX + ((FIELD - sub.length) >> 1), y + 2, sub, Color.BrightYellow, Color.Black);
}

const HEAD = 25;
const FOE_BYTES = 8;
function payloadSize(): number {
  return HEAD + FIELD * FIELD + MAX_ON * FOE_BYTES + MAX_BULLETS * 6 + 5;
}

function writeHead(out: Uint8Array, s: State): number {
  let i = 0;
  out[i++] = SAVE_VER;
  out[i++] = s.phase;
  out[i++] = s.stage;
  out[i++] = s.lives;
  out[i++] = s.power;
  out[i++] = s.score & 0xff;
  out[i++] = (s.score >>> 8) & 0xff;
  out[i++] = (s.score >>> 16) & 0xff;
  out[i++] = (s.score >>> 24) & 0xff;
  out[i++] = s.left;
  out[i++] = s.spawned;
  out[i++] = s.px;
  out[i++] = s.py;
  out[i++] = s.pdir;
  out[i++] = s.shield;
  out[i++] = s.freeze;
  out[i++] = s.shovel;
  out[i++] = s.eagle ? 1 : 0;
  out[i++] = s.pause ? 1 : 0;
  out[i++] = s.respawn;
  out[i++] = s.intro;
  out[i++] = s.seed & 0xff;
  out[i++] = (s.seed >>> 8) & 0xff;
  out[i++] = (s.seed >>> 16) & 0xff;
  out[i++] = (s.seed >>> 24) & 0xff;
  return i;
}

function padFoes(foes: Foe[]): Foe[] {
  const out: Foe[] = [];
  for (const foe of foes) {
    if (out.length === MAX_ON) break;
    if (foe.alive) out.push(foe);
  }
  while (out.length < MAX_ON) {
    out.push({
      x: 0,
      y: 0,
      dir: DOWN,
      kind: 0,
      hp: 0,
      cool: 0,
      think: 0,
      fire: 0,
      flash: false,
      spawn: 0,
      alive: false,
    });
  }
  return out;
}
