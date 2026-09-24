// Host-blind Space Invaders. Rules and cells only. The web host paints them.
import {
  Color,
  EMPTY_CELL,
  Key,
  keyOf,
  packCell,
  type App,
  type Engine,
  type InputQueue,
  type Surface,
} from "../../src/engine.ts";

const W = 48;
const H = 32;
const HUD_H = 2;

const COLS = 11;
const ROWS = 5;
const ALIEN_N = COLS * ROWS;
const AW = 2;
const PITCH_X = 3;
const PITCH_Y = 2;
const FORM_W = (COLS - 1) * PITCH_X + AW;
const START_X = ((W - FORM_W) / 2) | 0;
const START_Y = 2;

const PLAYER_W = 3;
const PLAYER_Y = H - 2;
const START_PX = ((W - PLAYER_W) / 2) | 0;
const BULLET_STEP = 2;
const INVULN = 45;

const SW = 5;
const SH = 3;
const BUNKERS = 4;
const SHIELD_CELLS = SW * SH;
const SHIELD_N = BUNKERS * SHIELD_CELLS;
const SHIELD_X0 = 4;
const SHIELD_PITCH = 11;
const SHIELD_Y = 23;
const SHAPE = [
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1,
] as const;

const MAX_SHOTS = 3;
const SAUCER_W = 3;
const SAUCER_Y = 0;
const SAUCER_GAP = 220;
const SAUCER_PTS = [50, 100, 150, 300] as const;

const GUN_FAST = 1;
const GUN_SPLASH = 2;
const GUN_PIERCE = 3;
const GUN_TTL = 180;
const FAST_STEP = 4;
const FAST_GAP = 4;
const MAX_PLAYER_SHOTS = 3;
const CONE_EVERY = 2;
const DROP_W = 2;
const DROP_EVERY = 3;
const DROP_CHANCE = 0.25;

const ROW_COLOR = [
  Color.Magenta,
  Color.Cyan,
  Color.Blue,
  Color.Green,
  Color.Yellow,
] as const;
const ROW_PTS = [30, 20, 20, 10, 10] as const;

const HULL = packCell(0x20, Color.Default, Color.BrightGreen);
const NOSE = packCell(0x5e, Color.Black, Color.BrightGreen);
const DEAD_HULL = packCell(0x20, Color.Default, Color.BrightRed);
const DEAD_NOSE = packCell(0x5e, Color.BrightWhite, Color.BrightRed);
const SHOT = packCell(0x20, Color.Default, Color.BrightYellow);
const SHOT_FAST = packCell(0x20, Color.Default, Color.BrightCyan);
const SHOT_SPLASH = packCell(0x20, Color.Default, Color.BrightMagenta);
const SHOT_PIERCE = packCell(0x20, Color.Default, Color.BrightWhite);
const NOSE_FAST = packCell(0x5e, Color.Black, Color.BrightCyan);
const NOSE_SPLASH = packCell(0x5e, Color.Black, Color.BrightMagenta);
const NOSE_PIERCE = packCell(0x5e, Color.Black, Color.BrightWhite);
const DROP_FAST = packCell(0x46, Color.Black, Color.BrightCyan);
const DROP_SPLASH = packCell(0x53, Color.Black, Color.BrightMagenta);
const DROP_PIERCE = packCell(0x7c, Color.Black, Color.BrightWhite);
const BOMB = packCell(0x20, Color.Default, Color.BrightRed);
const SAUCER_CELL = packCell(0x20, Color.Default, Color.BrightMagenta);
const SHIELD_CELL = packCell(0x20, Color.Default, Color.White);
const GROUND = packCell(0x20, Color.Default, Color.BrightBlack);

const SAVE_VER = 3;
const PAYLOAD = 186;

type Phase = "idle" | "run" | "dead";

interface State {
  phase: Phase;
  score: number;
  lives: number;
  wave: number;
  formX: number;
  formY: number;
  formDir: number;
  march: number;
  aliens: Uint8Array;
  playerX: number;
  invuln: number;
  alienStep: number;
  eWait: number;
  saucerWait: number;
  anim: number;
  gun: number;
  gunTtl: number;
  cool: number;
  pN: number;
  pX: Int16Array;
  pY: Int16Array;
  pGun: Uint8Array;
  pDir: Int8Array;
  dropOn: number;
  dropKind: number;
  dropX: number;
  dropY: number;
  dropTick: number;
  eN: number;
  eX: Int16Array;
  eY: Int16Array;
  saucerOn: number;
  saucerX: number;
  saucerDir: number;
  saucerPts: number;
  shields: Uint8Array;
}

function fillShields(s: State): void {
  for (let b = 0; b < BUNKERS; b++) {
    for (let i = 0; i < SHIELD_CELLS; i++) {
      s.shields[b * SHIELD_CELLS + i] = SHAPE[i]!;
    }
  }
}

function reset(s: State): void {
  s.phase = "idle";
  s.score = 0;
  s.lives = 3;
  s.wave = 1;
  s.formX = START_X;
  s.formY = START_Y;
  s.formDir = 1;
  s.march = 0;
  s.aliens.fill(1);
  s.playerX = START_PX;
  s.invuln = 0;
  s.alienStep = 0;
  s.eWait = 0;
  s.saucerWait = 0;
  s.anim = 0;
  s.gun = 0;
  s.gunTtl = 0;
  s.cool = 0;
  s.pN = 0;
  clearDrop(s);
  s.eN = 0;
  s.saucerOn = 0;
  s.saucerX = 0;
  s.saucerDir = 1;
  s.saucerPts = 0;
  fillShields(s);
}

function alienEvery(alive: number, wave: number): number {
  const n = 14 - (wave - 1) * 2 - (((ALIEN_N - alive) / 4) | 0);
  return n < 2 ? 2 : n;
}

function shotEvery(alive: number, wave: number): number {
  const n = 26 - (wave - 1) * 2 - (((ALIEN_N - alive) / 8) | 0);
  return n < 8 ? 8 : n;
}

function countAlive(s: State): number {
  let n = 0;
  for (let i = 0; i < ALIEN_N; i++) if (s.aliens[i]) n++;
  return n;
}

function shieldIndex(x: number, y: number): number {
  if (y < SHIELD_Y || y >= SHIELD_Y + SH) return -1;
  for (let b = 0; b < BUNKERS; b++) {
    const x0 = SHIELD_X0 + b * SHIELD_PITCH;
    if (x < x0 || x >= x0 + SW) continue;
    return b * SHIELD_CELLS + (y - SHIELD_Y) * SW + (x - x0);
  }
  return -1;
}

function damageShield(s: State, x: number, y: number): boolean {
  const i = shieldIndex(x, y);
  if (i < 0 || !s.shields[i]) return false;
  s.shields[i] = 0;
  return true;
}

function alienAt(s: State, x: number, y: number): number {
  const dy = y - s.formY;
  if (dy < 0 || dy % PITCH_Y !== 0) return -1;
  const row = (dy / PITCH_Y) | 0;
  if (row >= ROWS) return -1;
  const dx = x - s.formX;
  if (dx < 0) return -1;
  const col = (dx / PITCH_X) | 0;
  if (col >= COLS) return -1;
  if (dx - col * PITCH_X >= AW) return -1;
  const i = row * COLS + col;
  return s.aliens[i] ? i : -1;
}

function bounds(s: State): { left: number; right: number; bottom: number } | null {
  let left = W;
  let right = -1;
  let bottom = -1;
  for (let i = 0; i < ALIEN_N; i++) {
    if (!s.aliens[i]) continue;
    const x = s.formX + (i % COLS) * PITCH_X;
    const y = s.formY + ((i / COLS) | 0) * PITCH_Y;
    if (x < left) left = x;
    if (x + AW - 1 > right) right = x + AW - 1;
    if (y > bottom) bottom = y;
  }
  if (right < 0) return null;
  return { left, right, bottom };
}

function crushShields(s: State): void {
  for (let i = 0; i < ALIEN_N; i++) {
    if (!s.aliens[i]) continue;
    const x0 = s.formX + (i % COLS) * PITCH_X;
    const y = s.formY + ((i / COLS) | 0) * PITCH_Y;
    for (let dx = 0; dx < AW; dx++) {
      const si = shieldIndex(x0 + dx, y);
      if (si >= 0) s.shields[si] = 0;
    }
  }
}

function removeShot(s: State, i: number): void {
  const last = s.eN - 1;
  s.eX[i] = s.eX[last]!;
  s.eY[i] = s.eY[last]!;
  s.eN = last;
}

function cancelShot(s: State, x: number, y: number): boolean {
  for (let i = 0; i < s.eN; i++) {
    if (s.eX[i] !== x || s.eY[i] !== y) continue;
    removeShot(s, i);
    return true;
  }
  return false;
}

function clearDrop(s: State): void {
  s.dropOn = 0;
  s.dropKind = 0;
  s.dropX = 0;
  s.dropY = 0;
  s.dropTick = 0;
}

function killPlayer(s: State): void {
  s.lives--;
  s.pN = 0;
  s.eN = 0;
  s.playerX = START_PX;
  if (s.lives <= 0) {
    s.phase = "dead";
    s.gun = 0;
    s.gunTtl = 0;
    clearDrop(s);
  } else s.invuln = INVULN;
}

function slide(s: State, dir: number): void {
  if (!dir) return;
  const x = s.playerX + dir;
  if (x < 0 || x > W - PLAYER_W) return;
  s.playerX = x;
}

function removePShot(s: State, i: number): void {
  const last = s.pN - 1;
  s.pX[i] = s.pX[last]!;
  s.pY[i] = s.pY[last]!;
  s.pGun[i] = s.pGun[last]!;
  s.pDir[i] = s.pDir[last]!;
  s.pN = last;
}

function pushShot(s: State, x: number, y: number, gun: number, dir: number): void {
  s.pX[s.pN] = x;
  s.pY[s.pN] = y;
  s.pGun[s.pN] = gun;
  s.pDir[s.pN] = dir;
  s.pN++;
}

function arm(s: State, fire: boolean): void {
  if (!fire) return;
  const x = s.playerX + 1;
  const y = PLAYER_Y - 1;
  if (s.gun === GUN_SPLASH) {
    if (s.pN > 0) return;
    if (cancelShot(s, x, y)) return;
    pushShot(s, x, y, GUN_SPLASH, -1);
    pushShot(s, x, y, GUN_SPLASH, 0);
    pushShot(s, x, y, GUN_SPLASH, 1);
    return;
  }
  const cap = s.gun === GUN_FAST ? MAX_PLAYER_SHOTS : 1;
  if (s.pN >= cap || (s.gun === GUN_FAST && s.cool > 0)) return;
  if (cancelShot(s, x, y)) return;
  pushShot(s, x, y, s.gun, 0);
  if (s.gun === GUN_FAST) s.cool = FAST_GAP;
}

function placeDrop(s: State, x: number, y: number): void {
  let left = x;
  if (left < 0) left = 0;
  if (left > W - DROP_W) left = W - DROP_W;
  s.dropOn = 1;
  s.dropKind = 1 + ((Math.random() * 3) | 0);
  s.dropX = left;
  s.dropY = y < 0 ? 0 : y >= H ? H - 1 : y;
  s.dropTick = 0;
}

function maybeDrop(s: State, alien: number): void {
  if (s.dropOn || Math.random() >= DROP_CHANCE) return;
  placeDrop(
    s,
    s.formX + (alien % COLS) * PITCH_X,
    s.formY + ((alien / COLS) | 0) * PITCH_Y,
  );
}

function strike(s: State, x: number, y: number, gun: number): boolean {
  if (damageShield(s, x, y)) return true;
  const hit = alienAt(s, x, y);
  if (hit >= 0) {
    s.aliens[hit] = 0;
    s.score += ROW_PTS[(hit / COLS) | 0]!;
    maybeDrop(s, hit);
    return gun !== GUN_PIERCE;
  }
  if (cancelShot(s, x, y)) return true;
  if (
    s.saucerOn &&
    y === SAUCER_Y &&
    x >= s.saucerX &&
    x < s.saucerX + SAUCER_W
  ) {
    s.score += s.saucerPts;
    if (!s.dropOn) placeDrop(s, s.saucerX, SAUCER_Y);
    s.saucerOn = 0;
    s.saucerWait = 0;
    return gun !== GUN_PIERCE;
  }
  return false;
}

function movePlayerBullets(s: State): void {
  for (let i = s.pN - 1; i >= 0; i--) {
    const gun = s.pGun[i]!;
    const step = gun === GUN_FAST ? FAST_STEP : BULLET_STEP;
    const dir = s.pDir[i]!;
    let gone = false;
    for (let n = 0; n < step && !gone; n++) {
      const y = s.pY[i]! - 1;
      let x = s.pX[i]!;
      if (y < 0) {
        removePShot(s, i);
        gone = true;
        break;
      }
      if (gun === GUN_SPLASH && dir !== 0 && ((PLAYER_Y - 1 - y) % CONE_EVERY) === 0) {
        x += dir;
      }
      if (x < 0 || x >= W) {
        removePShot(s, i);
        gone = true;
        break;
      }
      s.pX[i] = x;
      s.pY[i] = y;
      if (strike(s, x, y, gun)) {
        removePShot(s, i);
        gone = true;
      }
    }
  }
}

function overlapsShip(s: State): boolean {
  if (s.dropY < PLAYER_Y - 1 || s.dropY > PLAYER_Y) return false;
  return s.dropX < s.playerX + PLAYER_W && s.dropX + DROP_W > s.playerX;
}

function takeDrop(s: State): void {
  s.gun = s.dropKind;
  s.gunTtl = GUN_TTL;
  s.cool = 0;
  clearDrop(s);
}

function moveDrop(s: State): void {
  if (!s.dropOn) return;
  if (overlapsShip(s)) {
    takeDrop(s);
    return;
  }
  s.dropTick++;
  if (s.dropTick < DROP_EVERY) return;
  s.dropTick = 0;
  const y = s.dropY + 1;
  if (y >= H) {
    clearDrop(s);
    return;
  }
  s.dropY = y;
  if (overlapsShip(s)) takeDrop(s);
}

function moveEnemyBullets(s: State): void {
  for (let i = s.eN - 1; i >= 0; i--) {
    const x = s.eX[i]!;
    let y = s.eY[i]!;
    let drop = false;
    y++;
    const shot = playerShotAt(s, x, y);
    if (y >= H || damageShield(s, x, y)) drop = true;
    else if (shot >= 0) {
      removePShot(s, shot);
      drop = true;
    } else if (y === PLAYER_Y && x >= s.playerX && x < s.playerX + PLAYER_W) {
      if (s.invuln <= 0) {
        killPlayer(s);
        return;
      }
      drop = true;
    }
    if (drop) removeShot(s, i);
    else s.eY[i] = y;
  }
}

function playerShotAt(s: State, x: number, y: number): number {
  for (let i = 0; i < s.pN; i++) {
    if (s.pY[i] !== y) continue;
    if (s.pX[i] === x) return i;
  }
  return -1;
}

function tryEnemyShot(s: State): void {
  const alive = countAlive(s);
  if (alive === 0 || s.eN >= MAX_SHOTS) return;
  s.eWait++;
  if (s.eWait < shotEvery(alive, s.wave)) return;
  s.eWait = 0;
  const start = (Math.random() * COLS) | 0;
  for (let k = 0; k < COLS; k++) {
    const col = (start + k) % COLS;
    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!s.aliens[r * COLS + col]) continue;
      row = r;
      break;
    }
    if (row < 0) continue;
    const x = s.formX + col * PITCH_X;
    const y = s.formY + row * PITCH_Y + 1;
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    if (damageShield(s, x, y)) return;
    s.eX[s.eN] = x;
    s.eY[s.eN] = y;
    s.eN++;
    return;
  }
}

function tickSaucer(s: State): void {
  if (s.saucerOn) {
    if ((s.anim & 1) === 0) {
      s.saucerX += s.saucerDir;
      if (s.saucerX <= -SAUCER_W || s.saucerX >= W) {
        s.saucerOn = 0;
        s.saucerWait = 0;
      }
    }
    return;
  }
  s.saucerWait++;
  if (s.saucerWait < SAUCER_GAP) return;
  s.saucerOn = 1;
  s.saucerWait = 0;
  if (Math.random() < 0.5) {
    s.saucerDir = 1;
    s.saucerX = -SAUCER_W;
  } else {
    s.saucerDir = -1;
    s.saucerX = W;
  }
  s.saucerPts = SAUCER_PTS[(Math.random() * SAUCER_PTS.length) | 0]!;
}

function stepAliens(s: State): void {
  const box = bounds(s);
  if (!box) return;
  if (box.left + s.formDir < 0 || box.right + s.formDir >= W) {
    s.formDir = -s.formDir;
    s.formY++;
  } else {
    s.formX += s.formDir;
  }
  s.march ^= 1;
  crushShields(s);
  const next = bounds(s);
  if (next && next.bottom >= PLAYER_Y) s.phase = "dead";
}

function nextWave(s: State): void {
  if (s.wave < 99) s.wave++;
  s.formX = START_X;
  s.formY = START_Y;
  s.formDir = 1;
  s.march = 0;
  s.alienStep = 0;
  s.aliens.fill(1);
  s.pN = 0;
  s.eN = 0;
  s.saucerOn = 0;
  s.saucerWait = 0;
}

function simulate(s: State, dir: number, fire: boolean): void {
  s.anim++;
  if (s.invuln > 0) s.invuln--;
  if (s.gunTtl > 0) {
    s.gunTtl--;
    if (s.gunTtl === 0) s.gun = 0;
  }
  if (s.cool > 0) s.cool--;
  slide(s, dir);
  arm(s, fire);
  movePlayerBullets(s);
  moveDrop(s);
  if (countAlive(s) === 0) {
    nextWave(s);
    return;
  }
  if (s.invuln > 0) return;
  moveEnemyBullets(s);
  if (s.phase !== "run") return;
  tryEnemyShot(s);
  tickSaucer(s);
  if (s.phase !== "run") return;
  s.alienStep++;
  if (s.alienStep >= alienEvery(countAlive(s), s.wave)) {
    s.alienStep = 0;
    stepAliens(s);
  }
}

function rowColor(row: number, march: number): Color {
  const base = ROW_COLOR[row] ?? Color.Green;
  if (!march) return base;
  return (base + 8) as Color;
}

function gunName(gun: number): string {
  if (gun === GUN_FAST) return "FAST";
  if (gun === GUN_SPLASH) return "SPLASH";
  if (gun === GUN_PIERCE) return "PIERCE";
  return "";
}

function gunMeter(ttl: number): string {
  const n = Math.ceil((ttl * 8) / GUN_TTL);
  const filled = n < 0 ? 0 : n > 8 ? 8 : n;
  let s = "";
  for (let i = 0; i < 8; i++) s += i < filled ? "#" : "-";
  return s;
}

function shotCell(gun: number): number {
  if (gun === GUN_FAST) return SHOT_FAST;
  if (gun === GUN_SPLASH) return SHOT_SPLASH;
  if (gun === GUN_PIERCE) return SHOT_PIERCE;
  return SHOT;
}

function noseCell(gun: number): number {
  if (gun === GUN_FAST) return NOSE_FAST;
  if (gun === GUN_SPLASH) return NOSE_SPLASH;
  if (gun === GUN_PIERCE) return NOSE_PIERCE;
  return NOSE;
}

function dropCell(kind: number): number {
  if (kind === GUN_FAST) return DROP_FAST;
  if (kind === GUN_SPLASH) return DROP_SPLASH;
  return DROP_PIERCE;
}

function dropTail(kind: number): number {
  if (kind === GUN_FAST) return SHOT_FAST;
  if (kind === GUN_SPLASH) return SHOT_SPLASH;
  return SHOT_PIERCE;
}

function pad(n: number, width: number): string {
  let s = String(n >>> 0);
  while (s.length < width) s = `0${s}`;
  return s;
}

function hint(phase: Phase): string {
  if (phase === "dead") return "ENTER RETRY";
  if (phase === "idle") return "ENTER START   ARROWS MOVE   SPACE FIRE";
  return "ARROWS MOVE   SPACE FIRE";
}

/** Two ASCII bytes per cell so a cellW 2 terminal stays square and readable. */
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

function draw(s: State, out: Surface): void {
  out.fill(EMPTY_CELL);
  for (let x = 0; x < W; x++) out.set(x, H - 1, GROUND);
  for (let i = 0; i < SHIELD_N; i++) {
    if (!s.shields[i]) continue;
    const b = (i / SHIELD_CELLS) | 0;
    const local = i - b * SHIELD_CELLS;
    out.set(
      SHIELD_X0 + b * SHIELD_PITCH + (local % SW),
      SHIELD_Y + ((local / SW) | 0),
      SHIELD_CELL,
    );
  }
  if (s.saucerOn) {
    for (let i = 0; i < SAUCER_W; i++) {
      out.set(s.saucerX + i, SAUCER_Y, SAUCER_CELL);
    }
  }
  for (let i = 0; i < ALIEN_N; i++) {
    if (!s.aliens[i]) continue;
    const x = s.formX + (i % COLS) * PITCH_X;
    const y = s.formY + ((i / COLS) | 0) * PITCH_Y;
    const cell = packCell(0x20, Color.Default, rowColor((i / COLS) | 0, s.march));
    out.set(x, y, cell);
    out.set(x + 1, y, cell);
  }
  for (let i = 0; i < s.eN; i++) out.set(s.eX[i]!, s.eY[i]!, BOMB);
  for (let i = 0; i < s.pN; i++) {
    out.set(s.pX[i]!, s.pY[i]!, shotCell(s.pGun[i]!));
  }
  if (s.dropOn) {
    const cell = dropCell(s.dropKind);
    const tail = dropTail(s.dropKind);
    out.set(s.dropX, s.dropY, cell);
    out.set(s.dropX + 1, s.dropY, tail);
  }
  const blink = s.phase === "run" && s.invuln > 0 && (s.anim & 1) === 0;
  if (!blink) {
    const dead = s.phase === "dead";
    out.set(s.playerX, PLAYER_Y, dead ? DEAD_HULL : HULL);
    out.set(s.playerX + 1, PLAYER_Y, dead ? DEAD_NOSE : noseCell(s.gun));
    out.set(s.playerX + 2, PLAYER_Y, dead ? DEAD_HULL : HULL);
  }
  const hud = `SCORE ${pad(s.score, 4)}  LIVES ${s.lives}  WAVE ${pad(s.wave, 2)}`;
  writeHud(
    out,
    0,
    H,
    s.gun ? `${hud}  ${gunName(s.gun)} ${gunMeter(s.gunTtl)}` : hud,
    Color.BrightWhite,
  );
  writeHud(out, 0, H + 1, hint(s.phase), Color.BrightBlack);
  if (s.phase !== "dead") return;
  const msg = "GAME OVER";
  writeHud(
    out,
    ((W - ((msg.length + 1) >> 1)) / 2) | 0,
    (H / 2) | 0,
    msg,
    Color.BrightRed,
    Color.Black,
  );
}

function phaseCode(p: Phase): number {
  if (p === "run") return 1;
  if (p === "dead") return 2;
  return 0;
}

function writeU16(out: Uint8Array, i: number, v: number): void {
  out[i] = v & 0xff;
  out[i + 1] = (v >>> 8) & 0xff;
}

function writeU32(out: Uint8Array, i: number, v: number): void {
  writeU16(out, i, v);
  writeU16(out, i + 2, v >>> 16);
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

function readI8(buf: Uint8Array, i: number): number {
  return (buf[i]! << 24) >> 24;
}

function writeState(s: State, out: Uint8Array): number {
  if (out.length < PAYLOAD) return PAYLOAD;
  let i = 0;
  out[i++] = SAVE_VER;
  out[i++] = phaseCode(s.phase);
  out[i++] = s.lives;
  out[i++] = s.wave;
  writeU16(out, i, s.formX);
  i += 2;
  writeU16(out, i, s.formY);
  i += 2;
  out[i++] = s.formDir & 0xff;
  out[i++] = s.march;
  out[i++] = s.playerX;
  out[i++] = s.invuln;
  out[i++] = s.alienStep;
  out[i++] = s.eWait;
  writeU16(out, i, s.saucerWait);
  i += 2;
  writeU16(out, i, s.anim);
  i += 2;
  writeU32(out, i, s.score);
  i += 4;
  out[i++] = s.gun;
  writeU16(out, i, s.gunTtl);
  i += 2;
  out[i++] = s.cool;
  out[i++] = s.pN;
  for (let k = 0; k < MAX_PLAYER_SHOTS; k++) {
    const x = k < s.pN ? s.pX[k]! : 0;
    const y = k < s.pN ? s.pY[k]! : 0;
    const gun = k < s.pN ? s.pGun[k]! : 0;
    const dir = k < s.pN ? s.pDir[k]! : 0;
    writeU16(out, i, x);
    writeU16(out, i + 2, y);
    out[i + 4] = gun;
    out[i + 5] = dir & 0xff;
    i += 6;
  }
  out[i++] = s.eN;
  for (let k = 0; k < MAX_SHOTS; k++) {
    const x = k < s.eN ? s.eX[k]! : 0;
    const y = k < s.eN ? s.eY[k]! : 0;
    writeU16(out, i, x);
    writeU16(out, i + 2, y);
    i += 4;
  }
  out[i++] = s.saucerOn;
  writeU16(out, i, s.saucerX);
  i += 2;
  out[i++] = s.saucerDir & 0xff;
  writeU16(out, i, s.saucerPts);
  i += 2;
  out[i++] = s.dropOn;
  out[i++] = s.dropKind;
  writeU16(out, i, s.dropX);
  i += 2;
  writeU16(out, i, s.dropY);
  i += 2;
  out[i++] = s.dropTick;
  out.set(s.aliens, i);
  i += ALIEN_N;
  out.set(s.shields, i);
  i += SHIELD_N;
  if (i !== PAYLOAD) throw new Error(`snapshot ${i}`);
  return PAYLOAD;
}

function readState(
  s: State,
  blob: Uint8Array,
  off: number,
  length: number,
): boolean {
  if (length !== PAYLOAD || off < 0 || off + length > blob.length) return false;
  let i = off;
  if (blob[i++] !== SAVE_VER) return false;
  const phaseN = blob[i++]!;
  const phase: Phase | null =
    phaseN === 0 ? "idle" : phaseN === 1 ? "run" : phaseN === 2 ? "dead" : null;
  if (!phase) return false;
  const lives = blob[i++]!;
  const wave = blob[i++]!;
  const formX = readI16(blob, i);
  i += 2;
  const formY = readI16(blob, i);
  i += 2;
  const formDir = readI8(blob, i);
  i++;
  const march = blob[i++]!;
  const playerX = blob[i++]!;
  const invuln = blob[i++]!;
  const alienStep = blob[i++]!;
  const eWait = blob[i++]!;
  const saucerWait = readU16(blob, i);
  i += 2;
  const anim = readU16(blob, i);
  i += 2;
  const score = readU32(blob, i);
  i += 4;
  const gun = blob[i++]!;
  const gunTtl = readU16(blob, i);
  i += 2;
  const cool = blob[i++]!;
  const pN = blob[i++]!;
  const pX = [0, 0, 0];
  const pY = [0, 0, 0];
  const pGun = [0, 0, 0];
  const pDir = [0, 0, 0];
  for (let k = 0; k < MAX_PLAYER_SHOTS; k++) {
    pX[k] = readI16(blob, i);
    pY[k] = readI16(blob, i + 2);
    pGun[k] = blob[i + 4]!;
    pDir[k] = readI8(blob, i + 5);
    i += 6;
  }
  const eN = blob[i++]!;
  const shotsX = [0, 0, 0];
  const shotsY = [0, 0, 0];
  for (let k = 0; k < MAX_SHOTS; k++) {
    shotsX[k] = readI16(blob, i);
    shotsY[k] = readI16(blob, i + 2);
    i += 4;
  }
  const saucerOn = blob[i++]!;
  const saucerX = readI16(blob, i);
  i += 2;
  const saucerDir = readI8(blob, i);
  i++;
  const saucerPts = readU16(blob, i);
  i += 2;
  const dropOn = blob[i++]!;
  const dropKind = blob[i++]!;
  const dropX = readI16(blob, i);
  i += 2;
  const dropY = readI16(blob, i);
  i += 2;
  const dropTick = blob[i++]!;
  if (
    lives > 5 ||
    wave < 1 ||
    wave > 99 ||
    (formDir !== -1 && formDir !== 1) ||
    formX < -W ||
    formX > W ||
    formY < 0 ||
    formY > H ||
    march > 1 ||
    playerX > W - PLAYER_W ||
    gun > GUN_PIERCE ||
    gunTtl > GUN_TTL ||
    (gun === 0 ? gunTtl !== 0 : gunTtl === 0) ||
    cool > FAST_GAP ||
    pN > MAX_PLAYER_SHOTS ||
    saucerOn > 1 ||
    eN > MAX_SHOTS ||
    (saucerDir !== -1 && saucerDir !== 1) ||
    saucerX < -SAUCER_W ||
    saucerX > W ||
    saucerPts > 1000 ||
    dropOn > 1 ||
    dropTick >= DROP_EVERY ||
    (dropOn === 0
      ? dropKind !== 0 || dropX !== 0 || dropY !== 0
      : dropKind < 1 ||
        dropKind > GUN_PIERCE ||
        dropX < 0 ||
        dropX > W - DROP_W ||
        dropY < 0 ||
        dropY >= H)
  ) {
    return false;
  }
  for (let k = 0; k < pN; k++) {
    const x = pX[k]!;
    const y = pY[k]!;
    const g = pGun[k]!;
    const dir = pDir[k]!;
    if (x < 0 || x >= W || y < 0 || y >= H || g > GUN_PIERCE) return false;
    if (dir !== -1 && dir !== 0 && dir !== 1) return false;
    if (g !== GUN_SPLASH && dir !== 0) return false;
  }
  for (let k = 0; k < eN; k++) {
    const x = shotsX[k]!;
    const y = shotsY[k]!;
    if (x < 0 || x >= W || y < 0 || y >= H) return false;
  }
  const alienEnd = i + ALIEN_N;
  const shieldEnd = alienEnd + SHIELD_N;
  if (shieldEnd !== off + PAYLOAD) return false;
  for (let k = i; k < alienEnd; k++) if (blob[k]! > 1) return false;
  for (let k = alienEnd; k < shieldEnd; k++) if (blob[k]! > 1) return false;
  s.phase = phase;
  s.lives = lives;
  s.wave = wave;
  s.formX = formX;
  s.formY = formY;
  s.formDir = formDir;
  s.march = march;
  s.playerX = playerX;
  s.invuln = invuln;
  s.alienStep = alienStep;
  s.eWait = eWait;
  s.saucerWait = saucerWait;
  s.anim = anim;
  s.score = score;
  s.gun = gun;
  s.gunTtl = gunTtl;
  s.cool = cool;
  s.pN = pN;
  for (let k = 0; k < MAX_PLAYER_SHOTS; k++) {
    s.pX[k] = pX[k]!;
    s.pY[k] = pY[k]!;
    s.pGun[k] = pGun[k]!;
    s.pDir[k] = pDir[k]!;
  }
  s.eN = eN;
  for (let k = 0; k < MAX_SHOTS; k++) {
    s.eX[k] = shotsX[k]!;
    s.eY[k] = shotsY[k]!;
  }
  s.saucerOn = saucerOn;
  s.saucerX = saucerX;
  s.saucerDir = saucerDir;
  s.saucerPts = saucerPts;
  s.dropOn = dropOn;
  s.dropKind = dropKind;
  s.dropX = dropX;
  s.dropY = dropY;
  s.dropTick = dropTick;
  s.aliens.set(blob.subarray(i, alienEnd));
  s.shields.set(blob.subarray(alienEnd, shieldEnd));
  return true;
}

function readKeys(input: InputQueue): {
  dir: number;
  fire: boolean;
  start: boolean;
  quit: boolean;
} {
  let dir = 0;
  let fire = false;
  let start = false;
  let quit = false;
  for (let i = 0; i < input.length; i++) {
    const k = keyOf(input.at(i));
    if (k === Key.CtrlC) quit = true;
    else if (k === Key.Left) dir = -1;
    else if (k === Key.Right) dir = 1;
    else if (k === Key.Space) fire = true;
    else if (k === Key.Enter) start = true;
  }
  return { dir, fire, start, quit };
}

export function createSpaceInvadersApp(): App {
  const state: State = {
    phase: "idle",
    score: 0,
    lives: 3,
    wave: 1,
    formX: START_X,
    formY: START_Y,
    formDir: 1,
    march: 0,
    aliens: new Uint8Array(ALIEN_N),
    playerX: START_PX,
    invuln: 0,
    alienStep: 0,
    eWait: 0,
    saucerWait: 0,
    anim: 0,
    gun: 0,
    gunTtl: 0,
    cool: 0,
    pN: 0,
    pX: new Int16Array(MAX_PLAYER_SHOTS),
    pY: new Int16Array(MAX_PLAYER_SHOTS),
    pGun: new Uint8Array(MAX_PLAYER_SHOTS),
    pDir: new Int8Array(MAX_PLAYER_SHOTS),
    dropOn: 0,
    dropKind: 0,
    dropX: 0,
    dropY: 0,
    dropTick: 0,
    eN: 0,
    eX: new Int16Array(MAX_SHOTS),
    eY: new Int16Array(MAX_SHOTS),
    saucerOn: 0,
    saucerX: 0,
    saucerDir: 1,
    saucerPts: 0,
    shields: new Uint8Array(SHIELD_N),
  };
  reset(state);

  return {
    size: { w: W, h: H + HUD_H },
    tick(input, engine: Engine) {
      const ev = readKeys(input);
      if (ev.quit) {
        engine.stop();
        return;
      }
      if (state.phase === "dead") {
        if (ev.start) reset(state);
        return;
      }
      if (state.phase === "idle") {
        if (!ev.start && !ev.fire) return;
        state.phase = "run";
        if (!ev.fire) return;
      }
      simulate(state, ev.dir, ev.fire);
    },
    view(out) {
      draw(state, out);
    },
    snapshot(out) {
      return writeState(state, out);
    },
    hydrate(blob, offset, length) {
      if (!readState(state, blob, offset, length)) reset(state);
    },
  };
}
