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
} from "tinycell";

export const Cue = {
  Place: 1,
  Clear: 2,
  Combo: 3,
  Over: 4,
  Tune0: 5,
  Tune1: 6,
  Tune2: 7,
  Tune3: 8,
  Tune4: 9,
  Tune5: 10,
  Tune6: 11,
  Tune7: 12,
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
const TUNE_EVERY = 6;

const COLS = 8;
const ROWS = 8;
const OX = 1;
const OY = 1;
const PANEL = 8;
const PX = OX + COLS + 2;
const HY = OY + ROWS + 2;
const PREVIEW = 5;
const W = PX + PANEL;
const H = HY + 1 + PREVIEW + 2;
const HAND = 3;
const EMPTY = 255;
const STREAK_MAX = 8;

const KIND_CHAR = 2;

const RAW = [
  "#",
  "##",
  "#|#",
  "###",
  "#|#|#",
  "####",
  "#|#|#|#",
  "#####",
  "#|#|#|#|#",
  "##|##",
  "###|###|###",
  "##|##|##",
  "###|###",
  "#|#|##",
  "###|#..",
  "##|.#|.#",
  "..#|###",
  ".#|.#|##",
  "###|..#",
  "##|#.|#.",
  "#..|###",
  "#|##",
  ".#|##",
  "##|#.",
  "##|.#",
];

interface Shape {
  w: number;
  h: number;
  n: number;
  cells: Uint8Array;
}

function parseShape(spec: string): Shape {
  const lines = spec.split("|");
  const h = lines.length;
  let w = 0;
  for (let i = 0; i < lines.length; i++) if (lines[i]!.length > w) w = lines[i]!.length;
  const cells: number[] = [];
  for (let y = 0; y < h; y++) {
    const line = lines[y]!;
    for (let x = 0; x < line.length; x++) if (line[x] === "#") cells.push(x, y);
  }
  return { w, h, n: cells.length >> 1, cells: Uint8Array.from(cells) };
}

const SHAPES: readonly Shape[] = RAW.map(parseShape);
const KINDS = SHAPES.length;

const PIECE: readonly Color[] = [
  Color.Cyan,
  Color.Yellow,
  Color.Magenta,
  Color.Green,
  Color.Red,
  Color.Blue,
  Color.BrightYellow,
  Color.BrightCyan,
];

const SAVE_VER = 1;
const BOARD_AT = 20;
const SAVE = BOARD_AT + COLS * ROWS;
const SIZE = SAVE + RAW.length;

const FRAME = packCell(0x20, Color.Default, Color.BrightBlack);
const DOT = packCell(0x2e, Color.BrightBlack, Color.Black);
const VOID = packCell(0x20, Color.Default, Color.Black);

type Phase = "play" | "over";

interface State {
  board: Uint8Array;
  phase: Phase;
  hand: Uint8Array;
  slot: number;
  x: number;
  y: number;
  bag: Uint8Array;
  bagAt: number;
  streak: number;
  score: number;
  best: number;
  tuneStep: number;
}

function shapeAt(id: number): Shape | undefined {
  if (id >= KINDS) return undefined;
  return SHAPES[id];
}

function eachCell(shape: Shape, x: number, y: number, fn: (cx: number, cy: number) => void): void {
  const cells = shape.cells;
  for (let i = 0; i < cells.length; i += 2) fn(x + cells[i]!, y + cells[i + 1]!);
}

function fits(board: Uint8Array, shape: Shape, x: number, y: number): boolean {
  let ok = true;
  eachCell(shape, x, y, (cx, cy) => {
    if (!ok) return;
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) ok = false;
    else if (board[cy * COLS + cx] !== 0) ok = false;
  });
  return ok;
}

function canPlace(board: Uint8Array, shape: Shape): boolean {
  for (let y = 0; y <= ROWS - shape.h; y++) {
    for (let x = 0; x <= COLS - shape.w; x++) {
      if (fits(board, shape, x, y)) return true;
    }
  }
  return false;
}

function alive(s: State): boolean {
  for (let i = 0; i < HAND; i++) {
    const shape = shapeAt(s.hand[i]!);
    if (shape && canPlace(s.board, shape)) return true;
  }
  return false;
}

function shuffle(bag: Uint8Array): void {
  for (let i = 0; i < KINDS; i++) bag[i] = i;
  for (let i = KINDS - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = bag[i]!;
    bag[i] = bag[j]!;
    bag[j] = t;
  }
}

function pull(s: State): number {
  if (s.bagAt >= KINDS) {
    shuffle(s.bag);
    s.bagAt = 0;
  }
  return s.bag[s.bagAt++]!;
}

function handEmpty(s: State): boolean {
  for (let i = 0; i < HAND; i++) if (s.hand[i] !== EMPTY) return false;
  return true;
}

function deal(s: State): void {
  for (let i = 0; i < HAND; i++) s.hand[i] = pull(s);
  s.slot = 0;
  clamp(s);
}

function selected(s: State): Shape | undefined {
  return shapeAt(s.hand[s.slot]!);
}

function clamp(s: State): void {
  const shape = selected(s);
  if (!shape) return;
  const maxX = COLS - shape.w;
  const maxY = ROWS - shape.h;
  if (s.x > maxX) s.x = maxX;
  if (s.y > maxY) s.y = maxY;
  if (s.x < 0) s.x = 0;
  if (s.y < 0) s.y = 0;
}

function nextSlot(s: State, dir: number): void {
  for (let n = 1; n <= HAND; n++) {
    const i = (s.slot + dir * n + HAND) % HAND;
    if (s.hand[i] !== EMPTY) {
      s.slot = i;
      clamp(s);
      return;
    }
  }
}

function addScore(s: State, n: number): void {
  if (n <= 0) return;
  s.score += n;
  if (s.score > s.best) s.best = s.score;
}

function sound(cues: CueQueue | undefined, id: number): void {
  cues?.push(id);
}

function lineBonus(lines: number, streak: number): number {
  return 5 * lines * (lines + 1) * streak;
}

function clearLines(s: State): number {
  const row = new Uint8Array(ROWS);
  const col = new Uint8Array(COLS);
  row.fill(1);
  col.fill(1);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (s.board[y * COLS + x] !== 0) continue;
      row[y] = 0;
      col[x] = 0;
    }
  }
  let n = 0;
  for (let y = 0; y < ROWS; y++) if (row[y]) n++;
  for (let x = 0; x < COLS; x++) if (col[x]) n++;
  if (n === 0) return 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (row[y] || col[x]) s.board[y * COLS + x] = 0;
    }
  }
  return n;
}

function end(s: State, cues?: CueQueue): void {
  s.phase = "over";
  sound(cues, Cue.Over);
}

function place(s: State, cues?: CueQueue): void {
  const shape = selected(s);
  if (!shape || !fits(s.board, shape, s.x, s.y)) return;
  const mark = s.hand[s.slot]! + 1;
  eachCell(shape, s.x, s.y, (cx, cy) => {
    s.board[cy * COLS + cx] = mark;
  });
  const lines = clearLines(s);
  addScore(s, shape.n);
  if (lines > 0) {
    s.streak = s.streak >= STREAK_MAX ? STREAK_MAX : s.streak + 1;
    addScore(s, lineBonus(lines, s.streak));
    sound(cues, lines > 1 ? Cue.Combo : Cue.Clear);
  } else {
    s.streak = 0;
    sound(cues, Cue.Place);
  }
  s.hand[s.slot] = EMPTY;
  if (handEmpty(s)) deal(s);
  else nextSlot(s, 1);
  if (!alive(s)) end(s, cues);
}

function reset(s: State, keepBest: boolean): void {
  const best = keepBest ? s.best : 0;
  s.board.fill(0);
  s.phase = "play";
  s.x = 0;
  s.y = 0;
  s.slot = 0;
  s.streak = 0;
  s.score = 0;
  s.best = best;
  s.tuneStep = 0;
  s.hand.fill(EMPTY);
  shuffle(s.bag);
  s.bagAt = 0;
  deal(s);
}

function charOf(ev: number): number {
  if (ev >>> 24 !== KIND_CHAR) return 0;
  return ev & 0xffffff;
}

function readKeys(input: InputQueue): {
  quit: boolean;
  place: boolean;
  retry: boolean;
  tab: boolean;
  dx: number;
  dy: number;
  pick: number;
} {
  let quit = false;
  let place = false;
  let retry = false;
  let tab = false;
  let dx = 0;
  let dy = 0;
  let pick = -1;
  for (let i = 0; i < input.length; i++) {
    const ev = input.at(i);
    const key = keyOf(ev);
    if (key === Key.CtrlC) quit = true;
    else if (key === Key.Enter) retry = true;
    else if (key === Key.Space) place = true;
    else if (key === Key.Tab) tab = true;
    else if (key === Key.Left) dx = -1;
    else if (key === Key.Right) dx = 1;
    else if (key === Key.Up) dy = -1;
    else if (key === Key.Down) dy = 1;
    else {
      const ch = charOf(ev);
      if (ch >= 0x31 && ch <= 0x33) pick = ch - 0x31;
    }
  }
  return { quit, place, retry, tab, dx, dy, pick };
}

function driveMusic(s: State, cues: CueQueue | undefined, silenced: { on: boolean }): void {
  if (s.phase !== "play") {
    if (!silenced.on) {
      silenced.on = true;
      sound(cues, Cue.Silence);
    }
    return;
  }
  silenced.on = false;
  if (s.tuneStep % TUNE_EVERY === 0) {
    sound(cues, TUNE[(s.tuneStep / TUNE_EVERY) % TUNE.length]!);
  }
  s.tuneStep = (s.tuneStep + 1) & 0xffff;
}

function block(color: Color, attr: Attr = Attr.None) {
  return packCell(0x20, Color.Black, color, attr);
}

function colorOf(mark: number): Color {
  return PIECE[(mark - 1) % PIECE.length]!;
}

function paintCell(out: Surface, x: number, y: number, color: Color, attr: Attr = Attr.None): void {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
  out.set(OX + x, OY + y, block(color, attr));
}

function paintShape(
  out: Surface,
  shape: Shape,
  x: number,
  y: number,
  color: Color,
  attr: Attr,
  board?: Uint8Array,
): void {
  eachCell(shape, x, y, (cx, cy) => {
    if (board && (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS || board[cy * COLS + cx] !== 0)) return;
    paintCell(out, cx, cy, color, attr);
  });
}

function paintPreview(out: Surface, slot: number, id: number, on: boolean): void {
  const ox = 1 + slot * 6;
  const oy = HY + 1;
  const label = on ? Color.BrightWhite : Color.BrightBlack;
  out.writeText(ox, HY, String(slot + 1), label);
  if (id === EMPTY) return;
  const shape = SHAPES[id]!;
  const color = block(colorOf(id + 1), on ? Attr.None : Attr.Dim);
  const dx = ((PREVIEW - shape.w) / 2) | 0;
  const dy = ((PREVIEW - shape.h) / 2) | 0;
  const cells = shape.cells;
  for (let i = 0; i < cells.length; i += 2) {
    out.set(ox + dx + cells[i]!, oy + dy + cells[i + 1]!, color);
  }
}

function draw(s: State, out: Surface): void {
  out.fill(VOID);
  for (let y = 0; y < ROWS + 2; y++) {
    for (let x = 0; x < COLS + 2; x++) {
      const edge = x === 0 || y === 0 || x === COLS + 1 || y === ROWS + 1;
      out.set(x, y, edge ? FRAME : DOT);
    }
  }
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const v = s.board[y * COLS + x]!;
      if (v !== 0) paintCell(out, x, y, colorOf(v));
    }
  }
  const shape = s.phase === "play" ? selected(s) : undefined;
  if (shape) {
    const ok = fits(s.board, shape, s.x, s.y);
    paintShape(
      out,
      shape,
      s.x,
      s.y,
      ok ? colorOf(s.hand[s.slot]! + 1) : Color.BrightRed,
      ok ? Attr.Dim : Attr.None,
      s.board,
    );
  }
  const label = Color.BrightBlack;
  const value = Color.BrightWhite;
  out.writeText(PX, 1, "SCORE", label);
  out.writeText(PX, 2, String(s.score), value);
  out.writeText(PX, 4, "BEST", label);
  out.writeText(PX, 5, String(s.best), value);
  out.writeText(PX, 7, "COMBO", label);
  out.writeText(PX, 8, s.streak > 1 ? `x${s.streak}` : s.streak === 1 ? "x1" : "-", value);
  for (let i = 0; i < HAND; i++) paintPreview(out, i, s.hand[i]!, i === s.slot && s.phase === "play");
  if (s.phase === "over") {
    out.writeText(OX + 1, OY + 3, "GAME", Color.BrightRed);
    out.writeText(OX + 1, OY + 4, "OVER", Color.BrightRed);
    out.writeText(1, H - 2, "game over", Color.BrightRed);
    out.writeText(1, H - 1, "enter retry", Color.BrightWhite);
  } else {
    out.writeText(1, H - 2, "arrows move", Color.Default);
    out.writeText(1, H - 1, "space places", Color.Default);
  }
}

function writeU16(out: Uint8Array, i: number, v: number): void {
  out[i] = v & 0xff;
  out[i + 1] = (v >>> 8) & 0xff;
}

function writeU32(out: Uint8Array, i: number, v: number): void {
  out[i] = v & 0xff;
  out[i + 1] = (v >>> 8) & 0xff;
  out[i + 2] = (v >>> 16) & 0xff;
  out[i + 3] = (v >>> 24) & 0xff;
}

function readU16(buf: Uint8Array, i: number): number {
  return buf[i]! | (buf[i + 1]! << 8);
}

function readU32(buf: Uint8Array, i: number): number {
  return (
    (buf[i]! | (buf[i + 1]! << 8) | (buf[i + 2]! << 16) | (buf[i + 3]! << 24)) >>> 0
  );
}

function writeState(s: State, out: Uint8Array): number {
  if (out.length < SIZE) return SIZE;
  out[0] = SAVE_VER;
  out[1] = s.phase === "over" ? 1 : 0;
  out[2] = s.x;
  out[3] = s.y;
  out[4] = s.slot;
  out[5] = s.streak;
  out[6] = s.hand[0]!;
  out[7] = s.hand[1]!;
  out[8] = s.hand[2]!;
  out[9] = s.bagAt;
  writeU16(out, 10, s.tuneStep);
  writeU32(out, 12, s.score);
  writeU32(out, 16, s.best);
  out.set(s.board, BOARD_AT);
  out.set(s.bag, SAVE);
  return SIZE;
}

function readState(s: State, blob: Uint8Array, off: number, length: number): boolean {
  if (length !== SIZE || off < 0 || off + SIZE > blob.length) return false;
  if (blob[off] !== SAVE_VER) return false;
  const phase = blob[off + 1]!;
  const x = blob[off + 2]!;
  const y = blob[off + 3]!;
  const slot = blob[off + 4]!;
  const streak = blob[off + 5]!;
  const hand0 = blob[off + 6]!;
  const hand1 = blob[off + 7]!;
  const hand2 = blob[off + 8]!;
  const bagAt = blob[off + 9]!;
  if (phase > 1 || x >= COLS || y >= ROWS || slot >= HAND || streak > STREAK_MAX) return false;
  if (bagAt > KINDS) return false;
  const hand = [hand0, hand1, hand2];
  for (let i = 0; i < HAND; i++) {
    const id = hand[i]!;
    if (id !== EMPTY && id >= KINDS) return false;
  }
  const board = blob.subarray(off + BOARD_AT, off + SAVE);
  for (let i = 0; i < board.length; i++) if (board[i]! > KINDS) return false;
  const bag = blob.subarray(off + SAVE, off + SIZE);
  const seen = new Uint8Array(KINDS);
  for (let i = 0; i < KINDS; i++) {
    const v = bag[i]!;
    if (v >= KINDS || seen[v]) return false;
    seen[v] = 1;
  }
  s.phase = phase === 1 ? "over" : "play";
  s.x = x;
  s.y = y;
  s.slot = slot;
  s.streak = streak;
  s.hand[0] = hand0;
  s.hand[1] = hand1;
  s.hand[2] = hand2;
  s.bagAt = bagAt;
  s.tuneStep = readU16(blob, off + 10);
  s.score = readU32(blob, off + 12);
  s.best = readU32(blob, off + 16);
  if (s.score > s.best) s.best = s.score;
  s.board.set(board);
  s.bag.set(bag);
  clamp(s);
  return true;
}

export function createBlockBlastApp(): App {
  const state: State = {
    board: new Uint8Array(COLS * ROWS),
    phase: "play",
    hand: new Uint8Array(HAND),
    slot: 0,
    x: 0,
    y: 0,
    bag: new Uint8Array(KINDS),
    bagAt: 0,
    streak: 0,
    score: 0,
    best: 0,
    tuneStep: 0,
  };
  const silenced = { on: false };
  reset(state, false);

  return {
    size: { w: W, h: H },
    tick(input, engine: Engine, cues?: CueQueue) {
      const keys = readKeys(input);
      if (keys.quit) {
        engine.stop();
        return;
      }
      if (state.phase === "over") {
        if (keys.retry) reset(state, true);
        driveMusic(state, cues, silenced);
        return;
      }
      if (!alive(state)) {
        end(state, cues);
        driveMusic(state, cues, silenced);
        return;
      }
      if (keys.pick >= 0 && state.hand[keys.pick] !== EMPTY) {
        state.slot = keys.pick;
        clamp(state);
      } else if (keys.tab) {
        nextSlot(state, 1);
      }
      if (keys.dx !== 0 || keys.dy !== 0) {
        state.x += keys.dx;
        state.y += keys.dy;
        clamp(state);
      }
      if (keys.place) place(state, cues);
      driveMusic(state, cues, silenced);
    },
    view(out) {
      draw(state, out);
    },
    snapshot(out) {
      return writeState(state, out);
    },
    hydrate(blob, offset, length) {
      if (!readState(state, blob, offset, length)) reset(state, false);
    },
  };
}
