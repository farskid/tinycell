// Side-view run and gun. Motion is fractional; the picture is cells.
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
  Jump: 2,
  Kill: 3,
  Hurt: 4,
  Dead: 5,
  Win: 6,
} as const;

const W = 64;
const H = 28;
const FLOOR = 24;
const PW = 3;
const PH = 3;
const GRAV = 0.07;
const JUMP = -1.12;
const VY_MAX = 0.85;
const WALK = 0.42;
const COYOTE = 6;
const FIRE_GAP = 5;
const SHOT_V = 1.15;
const MAX_SHOTS = 4;
const MAX_FOES = 6;
const MAX_ENEMY_SHOTS = 8;
const Q = 32;
const SAVE_VER = 1;
const HEAD = 36;
const SHOT_BYTES = 8;
const FOE_BYTES = 10;
const PAYLOAD =
  HEAD +
  3 +
  MAX_SHOTS * SHOT_BYTES +
  MAX_FOES * FOE_BYTES +
  MAX_ENEMY_SHOTS * SHOT_BYTES;

const SKY = packCell(0x20, Color.Default, Color.Blue);
const STAR = packCell(0x2e, Color.BrightWhite, Color.Blue);
const GROUND_TOP = packCell(0x20, Color.Default, Color.BrightGreen);
const GROUND = packCell(0x20, Color.Default, Color.Green);
const PLAT = packCell(0x20, Color.Default, Color.BrightYellow);
const HEAD_CELL = packCell(0x20, Color.Default, Color.BrightYellow);
const BODY = packCell(0x20, Color.Default, Color.BrightCyan);
const GUN_R = packCell(0x3e, Color.Black, Color.BrightWhite);
const GUN_L = packCell(0x3c, Color.Black, Color.BrightWhite);
const GUN_U = packCell(0x5e, Color.Black, Color.BrightWhite);
const GUN_D = packCell(0x76, Color.Black, Color.BrightWhite);
const GUN_UR = packCell(0x2f, Color.Black, Color.BrightWhite);
const GUN_UL = packCell(0x5c, Color.Black, Color.BrightWhite);
const GUN_DR = packCell(0x5c, Color.Black, Color.BrightWhite);
const GUN_DL = packCell(0x2f, Color.Black, Color.BrightWhite);
const HURT = packCell(0x20, Color.Default, Color.BrightRed);
const SOLDIER_W = 3;
const SOLDIER_H = 3;
const BIRD_W = 3;
const BIRD_H = 2;
const PIX_HEAD = packCell(0x20, Color.Default, Color.BrightYellow);
const PIX_BODY = packCell(0x20, Color.Default, Color.BrightRed);
const PIX_GUN = packCell(0x20, Color.Default, Color.BrightWhite);
const PIX_WING = packCell(0x20, Color.Default, Color.BrightMagenta);
const PIX_BEAK = packCell(0x20, Color.Default, Color.BrightWhite);
const ARENA = 220;
const BW = 8;
const BH = 12;
const BOSS_HP = 12;
const BOSS_CYCLE = 150;
const BOSS_BODY = packCell(0x20, Color.Default, Color.BrightRed);
const BOSS_BAR_OFF = packCell(0x20, Color.Default, Color.Red);
const BOSS_EYE = packCell(0x20, Color.Default, Color.BrightYellow);
const BOSS_CORE = packCell(0x20, Color.Default, Color.BrightWhite);
const BOSS_ROWS = [
  0b01100110, 0b01100110, 0b11111111, 0b11111111, 0b11011011, 0b11111111,
  0b11111111, 0b11111111, 0b10111101, 0b11111111, 0b11111111, 0b01100110,
];
const HEART = packCell(0x2665, Color.BrightRed, Color.Blue);
const SHOT = packCell(0x25cf, Color.BrightWhite, Color.Blue);
const ESHOT = packCell(0x25cf, Color.BrightRed, Color.Blue);

type Phase = "ready" | "run" | "dead" | "won";

type Shot = { x: number; y: number; vx: number; vy: number };

type Foe = {
  x: number;
  y: number;
  vx: number;
  kind: number;
  hp: number;
  cool: number;
  bob: number;
};

type State = {
  phase: Phase;
  px: number;
  py: number;
  vx: number;
  vy: number;
  face: number;
  aimX: number;
  aimY: number;
  grounded: boolean;
  jumpWas: boolean;
  duck: boolean;
  paused: boolean;
  coyote: number;
  cam: number;
  score: number;
  best: number;
  lives: number;
  invuln: number;
  fireCool: number;
  spawnIn: number;
  seed: number;
  anim: number;
  shots: Shot[];
  foes: Foe[];
  enemyShots: Shot[];
  boss: number;
  bossHp: number;
  bossT: number;
  bossX: number;
  bossY: number;
};

type Keys = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
  jump: boolean;
  duck: boolean;
  quit: boolean;
  pause: boolean;
};

function fresh(): State {
  const s: State = {
    phase: "ready",
    px: 4,
    py: FLOOR - PH,
    vx: 0,
    vy: 0,
    face: 1,
    aimX: 1,
    aimY: 0,
    grounded: true,
    jumpWas: false,
    duck: false,
    paused: false,
    coyote: COYOTE,
    cam: 0,
    score: 0,
    best: 0,
    lives: 3,
    invuln: 0,
    fireCool: 0,
    spawnIn: 28,
    seed: 1,
    anim: 0,
    shots: [],
    foes: [],
    enemyShots: [],
    boss: 0,
    bossHp: 0,
    bossT: 0,
    bossX: 0,
    bossY: 0,
  };
  return s;
}

function reset(s: State): void {
  const best = s.best;
  const next = fresh();
  Object.assign(s, next);
  s.shots = [];
  s.foes = [];
  s.enemyShots = [];
  s.best = best;
}

function roll(s: State): number {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed;
}

function chunkOf(x: number): number {
  return Math.floor(x / 18);
}

function localOf(x: number): number {
  const m = Math.floor(x) % 18;
  return m < 0 ? m + 18 : m;
}

function hash(n: number): number {
  let x = (Math.imul(n, 2246822519) ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 3266489917) >>> 0;
  return (x ^ (x >>> 13)) >>> 0;
}

function pit(x: number): boolean {
  const c = chunkOf(x);
  if (c <= 0) return false;
  if (hash(c) % 5 !== 0) return false;
  const l = localOf(x);
  return l >= 6 && l <= 10;
}

function platAt(x: number): number {
  const c = chunkOf(x);
  if (c <= 0) return -1;
  const k = hash(c) % 5;
  const l = localOf(x);
  if (k === 1 && l >= 2 && l <= 12) return FLOOR - 6;
  if (k === 2 && l >= 3 && l <= 14) return FLOOR - 8;
  if (k === 3 && l >= 1 && l <= 9) return FLOOR - 5;
  return -1;
}

function solid(x: number, y: number): boolean {
  const c = Math.floor(x);
  const r = Math.floor(y);
  if (r < 0 || c < 0) return false;
  if (r >= FLOOR && !pit(c)) return true;
  return r === platAt(c);
}

function blocked(x: number, y: number, w: number, h: number): boolean {
  const x0 = Math.floor(x);
  const x1 = Math.floor(x + w - 0.001);
  const y0 = Math.floor(y);
  const y1 = Math.floor(y + h - 0.001);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (solid(cx, cy)) return true;
    }
  }
  return false;
}

function onGround(x: number, y: number): boolean {
  return blocked(x, y + 0.08, PW, PH);
}

function sound(cues: CueQueue | undefined, id: number): void {
  cues?.push(id);
}

function readKeys(input: InputQueue): Keys {
  const keys: Keys = {
    left: false,
    right: false,
    up: false,
    down: false,
    fire: false,
    jump: false,
    duck: false,
    quit: false,
    pause: false,
  };
  for (let i = 0; i < input.length; i++) {
    const key = keyOf(input.at(i));
    if (key === Key.Left) keys.left = true;
    else if (key === Key.Right) keys.right = true;
    else if (key === Key.Up) keys.up = true;
    else if (key === Key.Down) keys.down = true;
    else if (key === Key.Space) keys.fire = true;
    else if (key === Key.Enter) keys.jump = true;
    else if (key === Key.Tab) keys.duck = true;
    else if (key === Key.Escape) keys.pause = true;
    else if (key === Key.CtrlC) keys.quit = true;
  }
  return keys;
}

function tall(s: State): number {
  return s.duck ? 1 : PH;
}

function hop(s: State, keys: Keys, cues?: CueQueue): void {
  const pressed = keys.jump && !s.jumpWas;
  s.jumpWas = keys.jump;
  if (!pressed || s.duck) return;
  if (!s.grounded && s.coyote <= 0) return;
  s.vx = 0;
  s.vy = JUMP;
  s.grounded = false;
  s.coyote = 0;
  sound(cues, Cue.Jump);
}

function crouch(s: State, keys: Keys): void {
  if (keys.duck && s.grounded && s.vy === 0) {
    if (!s.duck) s.py += PH - 1;
    s.duck = true;
    s.vx = 0;
    return;
  }
  if (s.duck && s.grounded) s.py -= PH - 1;
  s.duck = false;
}

function look(s: State, keys: Keys): void {
  let x = 0;
  let y = 0;
  let aimed = false;
  if (keys.left && !keys.right) {
    x = -1;
    aimed = true;
  } else if (keys.right && !keys.left) {
    x = 1;
    aimed = true;
  }
  if (keys.up && !keys.down) {
    y = -1;
    aimed = true;
  } else if (keys.down && !keys.up) {
    y = 1;
    aimed = true;
  }
  if (!aimed) return;
  if (x !== 0) s.face = x;
  s.aimX = x;
  s.aimY = y;
}

function gunCell(ax: number, ay: number): number {
  if (ay < 0 && ax > 0) return GUN_UR;
  if (ay < 0 && ax < 0) return GUN_UL;
  if (ay > 0 && ax > 0) return GUN_DR;
  if (ay > 0 && ax < 0) return GUN_DL;
  if (ay < 0) return GUN_U;
  if (ay > 0) return GUN_D;
  if (ax < 0) return GUN_L;
  return GUN_R;
}

function shoot(s: State, keys: Keys, cues?: CueQueue): void {
  if (s.fireCool > 0) s.fireCool--;
  if (!keys.fire || s.fireCool > 0 || s.shots.length >= MAX_SHOTS) return;
  const aim = { x: s.aimX, y: s.aimY };
  const len = Math.hypot(aim.x, aim.y) || 1;
  const shot: Shot = {
    x: s.px + (aim.x < 0 ? -0.6 : aim.x > 0 ? PW - 0.2 : 0.5),
    y: s.py + (aim.y < 0 ? -0.6 : aim.y > 0 ? tall(s) - 0.2 : s.duck ? 0 : 1),
    vx: (aim.x / len) * SHOT_V,
    vy: (aim.y / len) * SHOT_V,
  };
  s.shots.push(shot);
  s.fireCool = FIRE_GAP;
  sound(cues, Cue.Shot);
}

function slideX(
  x: number,
  y: number,
  vx: number,
  w: number,
  h: number,
): { x: number; hit: boolean } {
  let nx = x + vx;
  if (!blocked(nx, y, w, h)) return { x: nx, hit: false };
  const step = vx > 0 ? 0.05 : -0.05;
  nx = x;
  for (let i = 0; i < 24; i++) {
    if (blocked(nx + step, y, w, h)) break;
    nx += step;
  }
  return { x: nx, hit: true };
}

function moveBody(s: State): void {
  const moved = slideX(s.px, s.py, s.vx, PW, PH);
  s.px = moved.x;
  if (moved.hit) s.vx = 0;
  if (s.px < s.cam) s.px = s.cam;
  if (s.px < 0) s.px = 0;

  if (!s.grounded) {
    s.vy += GRAV;
    if (s.vy > VY_MAX) s.vy = VY_MAX;
  }

  const ny = s.py + s.vy;
  if (!blocked(s.px, ny, PW, PH)) {
    s.py = ny;
    s.grounded = onGround(s.px, s.py);
    if (s.grounded) {
      s.vy = 0;
      s.coyote = COYOTE;
    } else if (s.coyote > 0) s.coyote--;
    return;
  }
  const step = s.vy > 0 ? 0.05 : s.vy < 0 ? -0.05 : 0;
  if (step !== 0) {
    for (let i = 0; i < 30; i++) {
      if (blocked(s.px, s.py + step, PW, PH)) break;
      s.py += step;
    }
  }
  if (s.vy > 0) {
    s.grounded = true;
    s.coyote = COYOTE;
  }
  s.vy = 0;
}

function follow(s: State): void {
  if (s.boss === 1) return;
  const screen = s.px - s.cam;
  if (screen > 18) s.cam = s.px - 18;
  if (screen < 5) s.cam = s.px - 5;
  if (s.cam < 0) s.cam = 0;
}

function bossOpen(t: number): boolean {
  return t % BOSS_CYCLE >= 110;
}

function beginBoss(s: State): void {
  s.boss = 1;
  s.bossHp = BOSS_HP;
  s.bossT = 0;
  s.cam = ARENA;
  let x = ARENA + 6;
  for (let i = 0; i < 24; i++) {
    const col = x + i;
    if (!pit(col) && !pit(col + 2)) {
      x = col;
      break;
    }
  }
  s.px = x;
  s.py = FLOOR - PH;
  s.vx = 0;
  s.vy = 0;
  s.grounded = true;
  s.foes = [];
  s.enemyShots = [];
  s.bossX = ARENA + 46;
  s.bossY = FLOOR - BH;
}

function stepBoss(s: State): void {
  s.bossT++;
  const p = s.bossT % BOSS_CYCLE;
  const base = s.cam + 46;
  if (p < 50) {
    s.bossX = base + Math.sin(p / 8) * 5;
    s.bossY = FLOOR - BH;
    return;
  }
  if (p < 80) {
    s.bossY = FLOOR - BH;
    if (p === 50 || p === 66) {
      const x = s.bossX;
      const y = s.bossY + 4;
      foeShot(s, x, y, -0.7, 0);
      foeShot(s, x, y, -0.5, -0.32);
      foeShot(s, x, y, -0.5, 0.26);
    }
    return;
  }
  if (p < 110) {
    const u = (p - 80) / 30;
    s.bossY = FLOOR - BH - Math.sin(u * Math.PI) * 7;
    return;
  }
  s.bossX = base;
  s.bossY = FLOOR - BH;
}

function win(s: State, cues?: CueQueue): void {
  s.phase = "won";
  s.boss = 2;
  s.vx = 0;
  s.vy = 0;
  s.shots = [];
  s.enemyShots = [];
  addScore(s, 2000);
  sound(cues, Cue.Win);
}

function foeShot(s: State, x: number, y: number, vx: number, vy: number): void {
  if (s.enemyShots.length >= MAX_ENEMY_SHOTS) return;
  s.enemyShots.push({ x, y, vx, vy });
}

function spawn(s: State): void {
  s.spawnIn--;
  if (s.spawnIn > 0 || s.foes.length >= MAX_FOES) return;
  s.spawnIn = 34 + (roll(s) % 22);
  const x = s.cam + W + 1;
  const air = roll(s) % 3 === 0;
  if (!air) {
    const col = Math.floor(x);
    if (pit(col) || pit(col + 1)) return;
    s.foes.push({
      x,
      y: FLOOR - SOLDIER_H,
      vx: -0.14 - (roll(s) % 5) * 0.02,
      kind: 0,
      hp: 1,
      cool: 32 + (roll(s) % 24),
      bob: 0,
    });
    return;
  }
  const y = 2 + (roll(s) % 8);
  s.foes.push({
    x,
    y,
    vx: -0.28 - (roll(s) % 4) * 0.04,
    kind: 1,
    hp: 1,
    cool: 24 + (roll(s) % 20),
    bob: roll(s) % 20,
  });
}

function stepFoes(s: State): void {
  for (let i = s.foes.length - 1; i >= 0; i--) {
    const foe = s.foes[i]!;
    foe.bob++;
    foe.cool--;
    if (foe.kind === 0) {
      const next = slideX(foe.x, foe.y, foe.vx, SOLDIER_W, SOLDIER_H);
      foe.x = next.x;
      if (next.hit) foe.vx = -foe.vx;
      const feet = foe.y + SOLDIER_H;
      if (!solid(foe.x, feet) && !solid(foe.x + 1, feet)) foe.y += 0.45;
      if (foe.cool <= 0) {
        foe.cool = 68;
        foeShot(s, foe.x - 0.2, foe.y + 0.4, -0.55, 0);
      }
    } else {
      foe.x += foe.vx;
      foe.y += Math.sin(foe.bob / 5) * 0.12;
      if (foe.y < 1) foe.y = 1;
      if (foe.y > FLOOR - BIRD_H - 2) foe.y = FLOOR - BIRD_H - 2;
      if (foe.cool <= 0) {
        foe.cool = 56;
        const dx = s.px - foe.x;
        const dy = s.py - foe.y;
        const len = Math.hypot(dx, dy) || 1;
        foeShot(s, foe.x, foe.y + 1, (dx / len) * 0.42, (dy / len) * 0.42);
      }
    }
    if (foe.x < s.cam - 4 || foe.y > H + 2) s.foes.splice(i, 1);
  }
}

function stepShots(list: Shot[], cam: number, dieOnSolid: boolean): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const shot = list[i]!;
    shot.x += shot.vx;
    shot.y += shot.vy;
    const gone =
      shot.x < cam - 2 ||
      shot.x > cam + W + 3 ||
      shot.y < -2 ||
      shot.y > H + 2 ||
      (dieOnSolid && solid(shot.x, shot.y));
    if (gone) list.splice(i, 1);
  }
}

function hits(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function addScore(s: State, n: number): void {
  s.score += n;
  if (s.score > 999999) s.score = 999999;
  if (s.score > s.best) s.best = s.score;
}

function respawn(s: State): void {
  let x = s.cam + 4;
  for (let i = 0; i < 16; i++) {
    const col = Math.floor(x + i);
    if (!pit(col) && !pit(col + 1)) {
      x = col;
      break;
    }
  }
  s.px = x;
  s.py = FLOOR - PH;
  s.vx = 0;
  s.vy = 0;
  s.grounded = true;
  s.coyote = COYOTE;
}

function hurt(s: State, cues?: CueQueue): void {
  if (s.invuln > 0 || s.phase !== "run") return;
  s.lives--;
  s.invuln = 40;
  if (s.lives > 0) {
    sound(cues, Cue.Hurt);
    return;
  }
  s.phase = "dead";
  s.vx = 0;
  s.vy = 0;
  sound(cues, Cue.Dead);
}

function resolve(s: State, cues?: CueQueue): void {
  for (let i = s.shots.length - 1; i >= 0; i--) {
    const shot = s.shots[i]!;
    let hit = false;
    for (let f = s.foes.length - 1; f >= 0; f--) {
      const foe = s.foes[f]!;
      const fw = foe.kind === 0 ? SOLDIER_W : BIRD_W;
      const fh = foe.kind === 0 ? SOLDIER_H : BIRD_H;
      if (!hits(shot.x, shot.y, 0.35, 0.35, foe.x, foe.y, fw, fh)) continue;
      foe.hp--;
      hit = true;
      if (foe.hp <= 0) {
        addScore(s, foe.kind === 0 ? 100 : 150);
        s.foes.splice(f, 1);
        sound(cues, Cue.Kill);
      }
      break;
    }
    if (!hit && s.boss === 1 && hits(shot.x, shot.y, 0.35, 0.35, s.bossX, s.bossY, BW, BH)) {
      hit = true;
      if (bossOpen(s.bossT)) {
        s.bossHp--;
        if (s.bossHp <= 0) win(s, cues);
        else sound(cues, Cue.Kill);
      }
    }
    if (hit) s.shots.splice(i, 1);
  }
  if (s.invuln > 0) {
    s.invuln--;
    return;
  }
  for (let i = s.foes.length - 1; i >= 0; i--) {
    const foe = s.foes[i]!;
    const fw = foe.kind === 0 ? SOLDIER_W : BIRD_W;
    const fh = foe.kind === 0 ? SOLDIER_H : BIRD_H;
    if (hits(s.px, s.py, PW, tall(s), foe.x, foe.y, fw, fh)) {
      hurt(s, cues);
      return;
    }
  }
  for (let i = s.enemyShots.length - 1; i >= 0; i--) {
    const shot = s.enemyShots[i]!;
    if (!hits(shot.x, shot.y, 0.5, 0.5, s.px, s.py, PW, tall(s))) continue;
    s.enemyShots.splice(i, 1);
    hurt(s, cues);
    return;
  }
  if (s.boss === 1 && hits(s.px, s.py, PW, tall(s), s.bossX, s.bossY, BW, BH)) {
    hurt(s, cues);
  }
}

function walk(s: State, keys: Keys): void {
  if (s.duck) return;
  if (keys.left && !keys.right) s.vx = -WALK;
  else if (keys.right && !keys.left) s.vx = WALK;
}

function step(s: State, keys: Keys, cues?: CueQueue): void {
  s.anim++;
  s.vx = 0;
  look(s, keys);
  crouch(s, keys);
  hop(s, keys, cues);
  walk(s, keys);
  if (!s.duck) moveBody(s);
  follow(s);
  shoot(s, keys, cues);
  if (s.phase !== "run") return;
  if (s.boss === 0 && s.cam >= ARENA) beginBoss(s);
  if (s.boss === 1) stepBoss(s);
  else if (s.boss === 0) {
    spawn(s);
    stepFoes(s);
  }
  stepShots(s.shots, s.cam, true);
  stepShots(s.enemyShots, s.cam, true);
  resolve(s, cues);
  if (s.phase !== "run") return;
  if (s.py > FLOOR + 1) {
    hurt(s, cues);
    if (s.phase === "run") respawn(s);
  }
}

function label(out: Surface, y: number, text: string): void {
  out.writeText(((out.w - text.length) / 2) | 0, y, text, Color.BrightWhite, Color.Blue);
}

function menuLine(out: Surface, y: number, text: string, on: boolean): void {
  const x = ((out.w - text.length) / 2) | 0;
  const fg = on ? Color.BrightYellow : Color.BrightWhite;
  out.writeText(x, y, text, fg, Color.Blue);
  if (on) out.writeText(x - 2, y, ">", fg, Color.Blue);
}

function pauseMenu(out: Surface, menu: number): void {
  const x0 = ((out.w - 18) / 2) | 0;
  for (let y = 10; y <= 16; y++) {
    for (let x = x0; x < x0 + 18; x++) out.set(x, y, SKY);
  }
  label(out, 11, "PAUSED");
  menuLine(out, 13, "RESUME", menu === 0);
  menuLine(out, 15, "RESTART", menu === 1);
}

function drawBoss(out: Surface, s: State): void {
  if (s.boss === 0) return;
  const x = Math.round(s.bossX - s.cam);
  const y = Math.round(s.bossY);
  const open = s.boss === 1 && bossOpen(s.bossT);
  for (let row = 0; row < BH; row++) {
    const mask = BOSS_ROWS[row]!;
    for (let col = 0; col < BW; col++) {
      if ((mask & (0x80 >> col)) === 0) continue;
      const core = open && row === 4 && (col === 3 || col === 4);
      const cell = core ? BOSS_CORE : row < 2 ? BOSS_EYE : BOSS_BODY;
      out.set(x + col, y + row, cell);
    }
  }
  if (s.boss !== 1) return;
  const x0 = ((out.w - BOSS_HP) / 2) | 0;
  for (let i = 0; i < BOSS_HP; i++) {
    out.set(x0 + i, 1, i < s.bossHp ? BOSS_BODY : BOSS_BAR_OFF);
  }
}

function winBanner(out: Surface): void {
  const x0 = ((out.w - 16) / 2) | 0;
  for (let y = 10; y <= 14; y++) {
    for (let x = x0; x < x0 + 16; x++) out.set(x, y, SKY);
  }
  label(out, 12, "YOU WIN");
}

function drawFoe(out: Surface, cam: number, foe: Foe): void {
  const sx = Math.round(foe.x - cam);
  const sy = Math.round(foe.y);
  const left = foe.vx < 0;
  if (foe.kind === 0) {
    out.set(sx + 1, sy, PIX_HEAD);
    out.set(sx + 1, sy + 1, PIX_BODY);
    out.set(sx + (left ? 0 : 2), sy + 1, PIX_GUN);
    out.set(sx, sy + 2, PIX_BODY);
    out.set(sx + 2, sy + 2, PIX_BODY);
    return;
  }
  const up = (foe.bob & 4) === 0;
  const beak = left ? 0 : 2;
  const tail = left ? 2 : 0;
  if (up) {
    out.set(sx, sy, PIX_WING);
    out.set(sx + 2, sy, PIX_WING);
    out.set(sx + 1, sy + 1, PIX_WING);
    out.set(sx + beak, sy + 1, PIX_BEAK);
    return;
  }
  out.set(sx + 1, sy, PIX_WING);
  out.set(sx + beak, sy, PIX_BEAK);
  out.set(sx + tail, sy + 1, PIX_WING);
  out.set(sx + 1, sy + 1, PIX_WING);
}

function drawPlayer(s: State, out: Surface): void {
  if (s.invuln > 0 && (s.anim & 2) !== 0) return;
  const sx = Math.round(s.px - s.cam);
  const sy = Math.round(s.py);
  const body = s.phase === "dead" ? HURT : BODY;
  const head = s.phase === "dead" ? HURT : HEAD_CELL;
  const h = tall(s);
  const right = s.face >= 0;
  if (h === 1) {
    out.set(sx + (right ? 0 : 2), sy, head);
    out.set(sx + 1, sy, body);
    out.set(sx + (right ? 2 : 0), sy, body);
  } else {
    out.set(sx + 1, sy, head);
    out.set(sx + (right ? 0 : 1), sy + 1, body);
    out.set(sx + (right ? 1 : 2), sy + 1, body);
    const step = s.grounded && s.vx !== 0 && (s.anim & 2) !== 0;
    out.set(sx + (right ? 0 : 2), sy + 2, body);
    if (!step) out.set(sx + (right ? 2 : 0), sy + 2, body);
  }
  const ax = s.aimX;
  const ay = s.aimY;
  const gx = ax < 0 ? sx - 1 : ax > 0 ? sx + PW : sx + (s.face < 0 ? 0 : 1);
  const gy = ay < 0 ? sy - 1 : ay > 0 ? sy + h : sy + (h === 1 ? 0 : 1);
  out.set(gx, gy, gunCell(ax, ay));
}

function draw(s: State, out: Surface, menu: number): void {
  out.fill(SKY);
  const x0 = Math.floor(s.cam);
  for (let sy = 1; sy < out.h; sy++) {
    for (let sx = 0; sx < out.w; sx++) {
      const wx = x0 + sx;
      const far = Math.floor(s.cam * 0.35) + sx;
      if (sy >= 2 && sy <= 6 && far % 13 === 0 && (sy + far) % 5 === 0) {
        out.set(sx, sy, STAR);
      }
      if (!solid(wx, sy)) continue;
      const top = !solid(wx, sy - 1);
      const plat = platAt(wx) === sy;
      out.set(sx, sy, plat ? PLAT : top ? GROUND_TOP : GROUND);
    }
  }
  for (let i = 0; i < s.foes.length; i++) {
    const foe = s.foes[i]!;
    drawFoe(out, s.cam, foe);
  }
  for (let i = 0; i < s.shots.length; i++) {
    const shot = s.shots[i]!;
    out.set(Math.round(shot.x - s.cam), Math.round(shot.y), SHOT);
  }
  for (let i = 0; i < s.enemyShots.length; i++) {
    const shot = s.enemyShots[i]!;
    out.set(Math.round(shot.x - s.cam), Math.round(shot.y), ESHOT);
  }
  drawPlayer(s, out);
  drawBoss(out, s);

  const score = String(s.score).padStart(6, "0");
  out.writeText(1, 0, score, Color.BrightWhite, Color.Blue);
  const n = s.lives > 0 ? s.lives : 0;
  const heartX = out.w - (n * 2 - 1) - 1;
  for (let i = 0; i < n; i++) out.set(heartX + i * 2, 0, HEART);
  if (s.paused) pauseMenu(out, menu);
  else if (s.phase === "ready") label(out, 8, "ENTER");
  else if (s.phase === "dead") label(out, 8, "DEAD");
  else if (s.phase === "won") winBanner(out);
}

function quant(n: number): number {
  const v = Math.round(n * Q);
  if (v > 32767) return 32767;
  if (v < -32768) return -32768;
  return v;
}

function writeI16(out: Uint8Array, i: number, n: number): void {
  out[i] = n & 0xff;
  out[i + 1] = (n >> 8) & 0xff;
}

function readI16(buf: Uint8Array, i: number): number {
  return (buf[i]! | (buf[i + 1]! << 8)) << 16 >> 16;
}

function writeU16(out: Uint8Array, i: number, n: number): void {
  out[i] = n & 0xff;
  out[i + 1] = (n >>> 8) & 0xff;
}

function readU16(buf: Uint8Array, i: number): number {
  return buf[i]! | (buf[i + 1]! << 8);
}

function writeU32(out: Uint8Array, i: number, n: number): void {
  out[i] = n & 0xff;
  out[i + 1] = (n >>> 8) & 0xff;
  out[i + 2] = (n >>> 16) & 0xff;
  out[i + 3] = (n >>> 24) & 0xff;
}

function readU32(buf: Uint8Array, i: number): number {
  return (
    (buf[i]! | (buf[i + 1]! << 8) | (buf[i + 2]! << 16) | (buf[i + 3]! << 24)) >>>
    0
  );
}

function writeShot(out: Uint8Array, i: number, shot: Shot): void {
  writeI16(out, i, quant(shot.x));
  writeI16(out, i + 2, quant(shot.y));
  writeI16(out, i + 4, quant(shot.vx));
  writeI16(out, i + 6, quant(shot.vy));
}

function readShot(buf: Uint8Array, i: number): Shot {
  return {
    x: readI16(buf, i) / Q,
    y: readI16(buf, i + 2) / Q,
    vx: readI16(buf, i + 4) / Q,
    vy: readI16(buf, i + 6) / Q,
  };
}

function writeState(s: State, out: Uint8Array): number {
  if (out.length < PAYLOAD) return PAYLOAD;
  out.fill(0, 0, PAYLOAD);
  out[0] = SAVE_VER;
  out[1] = s.phase === "ready" ? 0 : s.phase === "run" ? 1 : s.phase === "dead" ? 2 : 3;
  out[2] = s.face < 0 ? 0 : 1;
  out[3] = s.grounded ? 1 : 0;
  out[4] = s.lives & 0xff;
  out[5] = s.coyote & 0xff;
  out[6] = s.fireCool & 0xff;
  out[7] = s.jumpWas ? 1 : 0;
  writeI16(out, 8, quant(s.px));
  writeI16(out, 10, quant(s.py));
  writeI16(out, 12, quant(s.vx));
  writeI16(out, 14, quant(s.vy));
  writeI16(out, 16, quant(s.cam));
  writeU32(out, 18, s.score);
  writeU32(out, 22, s.best);
  writeU16(out, 26, s.invuln);
  writeU16(out, 28, s.spawnIn);
  writeU16(out, 30, s.anim & 0xffff);
  writeU32(out, 32, s.seed);
  let at = HEAD;
  out[at++] = s.shots.length;
  for (let i = 0; i < MAX_SHOTS; i++) {
    if (i < s.shots.length) writeShot(out, at, s.shots[i]!);
    at += SHOT_BYTES;
  }
  out[at++] = s.foes.length;
  for (let i = 0; i < MAX_FOES; i++) {
    const foe = s.foes[i];
    if (foe) {
      writeI16(out, at, quant(foe.x));
      writeI16(out, at + 2, quant(foe.y));
      writeI16(out, at + 4, quant(foe.vx));
      out[at + 6] = foe.kind;
      out[at + 7] = foe.hp;
      out[at + 8] = foe.cool & 0xff;
      out[at + 9] = foe.bob & 0xff;
    }
    at += FOE_BYTES;
  }
  out[at++] = s.enemyShots.length;
  for (let i = 0; i < MAX_ENEMY_SHOTS; i++) {
    if (i < s.enemyShots.length) writeShot(out, at, s.enemyShots[i]!);
    at += SHOT_BYTES;
  }
  return PAYLOAD;
}

function readState(s: State, blob: Uint8Array, off: number, length: number): boolean {
  if (length !== PAYLOAD || off < 0 || off + length > blob.length) return false;
  if (blob[off] !== SAVE_VER) return false;
  const phaseN = blob[off + 1]!;
  const phase: Phase | null =
    phaseN === 0 ? "ready" : phaseN === 1 ? "run" : phaseN === 2 ? "dead" : phaseN === 3 ? "won" : null;
  if (!phase) return false;
  const lives = blob[off + 4]!;
  if (lives > 9) return false;
  const score = readU32(blob, off + 18);
  const best = readU32(blob, off + 22);
  if (score > best || score > 999999) return false;
  const px = readI16(blob, off + 8) / Q;
  const py = readI16(blob, off + 10) / Q;
  const cam = readI16(blob, off + 16) / Q;
  if (px < -1 || py < -4 || py > H + 4 || cam < 0) return false;
  let at = off + HEAD;
  const shotN = blob[at++]!;
  if (shotN > MAX_SHOTS) return false;
  const shots: Shot[] = [];
  for (let i = 0; i < MAX_SHOTS; i++) {
    if (i < shotN) shots.push(readShot(blob, at));
    at += SHOT_BYTES;
  }
  const foeN = blob[at++]!;
  if (foeN > MAX_FOES) return false;
  const foes: Foe[] = [];
  for (let i = 0; i < MAX_FOES; i++) {
    if (i < foeN) {
      const kind = blob[at + 6]!;
      if (kind > 1) return false;
      foes.push({
        x: readI16(blob, at) / Q,
        y: readI16(blob, at + 2) / Q,
        vx: readI16(blob, at + 4) / Q,
        kind,
        hp: blob[at + 7]!,
        cool: blob[at + 8]!,
        bob: blob[at + 9]!,
      });
    }
    at += FOE_BYTES;
  }
  const enemyN = blob[at++]!;
  if (enemyN > MAX_ENEMY_SHOTS) return false;
  const enemyShots: Shot[] = [];
  for (let i = 0; i < MAX_ENEMY_SHOTS; i++) {
    if (i < enemyN) enemyShots.push(readShot(blob, at));
    at += SHOT_BYTES;
  }
  s.phase = phase;
  s.face = blob[off + 2] === 0 ? -1 : 1;
  s.grounded = blob[off + 3] === 1;
  s.lives = lives;
  s.coyote = blob[off + 5]!;
  s.fireCool = blob[off + 6]!;
  s.jumpWas = blob[off + 7] === 1;
  s.aimX = s.face;
  s.aimY = 0;
  s.duck = false;
  s.px = px;
  s.py = py;
  s.vx = readI16(blob, off + 12) / Q;
  s.vy = readI16(blob, off + 14) / Q;
  s.cam = cam;
  s.score = score;
  s.best = best;
  s.invuln = readU16(blob, off + 26);
  s.spawnIn = readU16(blob, off + 28);
  s.anim = readU16(blob, off + 30);
  s.seed = readU32(blob, off + 32);
  s.shots = shots;
  s.foes = foes;
  s.enemyShots = enemyShots;
  s.boss = 0;
  s.bossHp = 0;
  s.bossT = 0;
  return true;
}

export function createContraApp(): App {
  const state = fresh();
  let menu = 0;
  let menuLatch = false;

  return {
    size: { w: W, h: H },
    tick(input, engine: Engine, cues?: CueQueue) {
      const keys = readKeys(input);
      if (keys.quit) {
        engine.stop();
        return;
      }
      if (keys.pause) {
        state.paused = !state.paused;
        if (state.paused) {
          menu = 0;
          menuLatch = keys.up || keys.down;
        }
        return;
      }
      if (state.paused) {
        const move = !menuLatch;
        menuLatch = keys.up || keys.down;
        if (move && keys.down) menu = 1;
        else if (move && keys.up) menu = 0;
        if (keys.jump) {
          const restart = menu === 1;
          menu = 0;
          state.paused = false;
          if (restart) {
            reset(state);
            state.phase = "run";
          }
        }
        return;
      }
      if (state.phase === "dead" || state.phase === "won") {
        state.jumpWas = keys.jump;
        if (!keys.jump) return;
        reset(state);
        state.phase = "run";
        return;
      }
      if (state.phase === "ready") {
        if (!keys.jump) {
          state.anim++;
          return;
        }
        state.phase = "run";
        state.jumpWas = true;
        look(state, keys);
      }
      step(state, keys, cues);
    },
    view(out) {
      draw(state, out, menu);
    },
    snapshot(out) {
      return writeState(state, out);
    },
    hydrate(blob, offset, length) {
      if (!readState(state, blob, offset, length)) reset(state);
    },
  };
}
