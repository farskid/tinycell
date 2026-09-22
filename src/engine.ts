// Host-blind fixed-timestep core. No TTY, DOM, canvas, or Node imports.
//
// Cell: [attrs:8][bg:4][fg:4][char:16]
// Color is 4 bits plus one spare attr bit so BrightWhite (16) round-trips.
// Attr flags occupy the low nibble; bit 4 is fg hi, bit 5 is bg hi.
//
// Event: [kind:8][code:24]. Games read keys with keyOf, not bit masks.

export type Cell = number;

export const enum Color {
  Default = 0,
  Black,
  Red,
  Green,
  Yellow,
  Blue,
  Magenta,
  Cyan,
  White,
  BrightBlack,
  BrightRed,
  BrightGreen,
  BrightYellow,
  BrightBlue,
  BrightMagenta,
  BrightCyan,
  BrightWhite,
}

export const enum Attr {
  None = 0,
  Bold = 1,
  Dim = 2,
  Underline = 4,
  Inverse = 8,
}

const CHAR_MASK = 0xffff;
const FG_SHIFT = 16;
const BG_SHIFT = 20;
const ATTR_SHIFT = 24;
const FG_HI = 1 << (ATTR_SHIFT + 4);
const BG_HI = 1 << (ATTR_SHIFT + 5);
const ATTR_FLAGS = 0x0f;

export function packCell(
  ch: number,
  fg: Color = Color.Default,
  bg: Color = Color.Default,
  attrs: Attr = Attr.None,
): Cell {
  let cell =
    ((attrs & ATTR_FLAGS) << ATTR_SHIFT) |
    ((bg & 0x0f) << BG_SHIFT) |
    ((fg & 0x0f) << FG_SHIFT) |
    (ch & CHAR_MASK);
  if ((fg & 0x10) !== 0) cell |= FG_HI;
  if ((bg & 0x10) !== 0) cell |= BG_HI;
  return cell >>> 0;
}

export const EMPTY_CELL: Cell = packCell(0x20);

export function cellChar(cell: Cell): number {
  return cell & CHAR_MASK;
}

export function cellFg(cell: Cell): number {
  return ((cell >>> FG_SHIFT) & 0x0f) | ((cell & FG_HI) !== 0 ? 0x10 : 0);
}

export function cellBg(cell: Cell): number {
  return ((cell >>> BG_SHIFT) & 0x0f) | ((cell & BG_HI) !== 0 ? 0x10 : 0);
}

export function cellAttrs(cell: Cell): number {
  return (cell >>> ATTR_SHIFT) & ATTR_FLAGS;
}

export class Surface {
  readonly w: number;
  readonly h: number;
  readonly cells: Uint32Array;

  constructor(w: number, h: number) {
    this.w = w > 0 ? w | 0 : 0;
    this.h = h > 0 ? h | 0 : 0;
    this.cells = new Uint32Array(this.w * this.h);
  }

  set(x: number, y: number, cell: Cell): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.cells[y * this.w + x] = cell >>> 0;
  }

  fill(cell: Cell): void {
    this.cells.fill(cell >>> 0);
  }

  writeText(x: number, y: number, s: string, fg?: Color, bg?: Color): void {
    if (y < 0 || y >= this.h) return;
    for (let i = 0; i < s.length; i++) {
      const xx = x + i;
      if (xx < 0 || xx >= this.w) continue;
      this.cells[y * this.w + xx] = packCell(
        s.charCodeAt(i) & CHAR_MASK,
        fg,
        bg,
      );
    }
  }
}

export interface Painter {
  readonly ready: boolean;
  readonly size: { readonly w: number; readonly h: number };
  onResize(cb: (w: number, h: number) => void): void;
  resize(w: number, h: number): void;
  paint(front: Surface): void;
  dispose(): void;
}

const INPUT_CAP = 64;
const KIND_KEY = 1;
const KIND_CHAR = 2;

export class InputQueue {
  private readonly buf = new Int32Array(INPUT_CAP);
  private head = 0;
  private len = 0;

  push(ev: number): void {
    if (this.len === INPUT_CAP) {
      this.head++;
      if (this.head === INPUT_CAP) this.head = 0;
      this.len--;
    }
    let i = this.head + this.len;
    if (i >= INPUT_CAP) i -= INPUT_CAP;
    this.buf[i] = ev | 0;
    this.len++;
  }

  get length(): number {
    return this.len;
  }

  at(i: number): number {
    if (i < 0 || i >= this.len) return 0;
    let j = this.head + i;
    if (j >= INPUT_CAP) j -= INPUT_CAP;
    return this.buf[j]!;
  }

  clear(): void {
    this.head = 0;
    this.len = 0;
  }
}

export const enum Key {
  Up = 1,
  Down,
  Left,
  Right,
  Enter,
  Escape,
  Space,
  Tab,
  Backspace,
  CtrlC,
}

export function keyEvent(key: Key): number {
  return ((KIND_KEY << 24) | (key & 0xffffff)) >>> 0;
}

export function charEvent(codepoint: number): number {
  return ((KIND_CHAR << 24) | (codepoint & 0xffffff)) >>> 0;
}

export function keyOf(ev: number): Key | 0 {
  if (ev >>> 24 !== KIND_KEY) return 0;
  const code = ev & 0xffffff;
  if (code < Key.Up || code > Key.CtrlC) return 0;
  return code as Key;
}

export interface InputSource {
  attach(queue: InputQueue): () => void;
}

export interface App {
  tick(input: InputQueue, engine: Engine): void;
  view(out: Surface): void;
  readonly size: { readonly w: number; readonly h: number };
  onResize?(w: number, h: number): void;
  /**
   * Write the payload into `out` and return its byte length.
   * If `out` is shorter than the payload, write nothing and return the length needed.
   * The engine may call this twice. Not on the tick path.
   */
  snapshot(out: Uint8Array): number;
  hydrate(blob: Uint8Array, offset: number, length: number): void;
}

const SNAPSHOT_VERSION = 1;
const SNAPSHOT_HEADER = 9;

export interface EngineOptions {
  app: App;
  painter: Painter;
  inputs?: InputSource[];
  tickHz?: number;
  maxTicksPerWake?: number;
  resume?: Uint8Array;
}

export interface Engine {
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  snapshot(): Uint8Array;
  readonly tick: number;
  readonly running: boolean;
}

type Phase = "idle" | "running" | "paused" | "stopped";

export function createEngine(opts: EngineOptions): Engine {
  const app = opts.app;
  const painter = opts.painter;
  const hz = opts.tickHz ?? 20;
  if (!(hz > 0)) throw new Error("tickHz must be > 0");
  const step = Math.max(1, Math.round(1000 / hz));
  const maxTicks = Math.max(1, opts.maxTicksPerWake ?? 4);
  const queue = new InputQueue();

  let tickCount = 0;
  if (opts.resume) tickCount = loadSnapshot(opts.resume, app);

  const detachers: Array<() => void> = [];
  for (const source of opts.inputs ?? []) detachers.push(source.attach(queue));

  let surface = new Surface(0, 0);
  let gridW = -1;
  let gridH = -1;
  let syncing = false;

  function syncGrid(): void {
    if (syncing) return;
    syncing = true;
    try {
      const w = clampDim(app.size.w, painter.size.w);
      const h = clampDim(app.size.h, painter.size.h);
      if (w === gridW && h === gridH) return;
      gridW = w;
      gridH = h;
      surface = new Surface(w, h);
      surface.fill(EMPTY_CELL);
      painter.resize(w, h);
      app.onResize?.(w, h);
    } finally {
      syncing = false;
    }
  }

  painter.onResize(syncGrid);
  syncGrid();

  let phase: Phase = "idle";
  let acc = 0;
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scratch = new Uint8Array(256);
  let api!: Engine;

  function arm(delay: number): void {
    timer = setTimeout(wake, delay);
  }

  function wake(): void {
    timer = undefined;
    if (phase !== "running") return;
    const now = Date.now();
    acc += now - last;
    last = now;
    const cap = step * maxTicks;
    if (acc > cap) acc = cap;
    let ran = 0;
    while (phase === "running" && acc >= step && ran < maxTicks) {
      app.tick(queue, api);
      queue.clear();
      tickCount = (tickCount + 1) >>> 0;
      acc -= step;
      ran++;
    }
    if (ran > 0 && phase === "running" && painter.ready) {
      app.view(surface);
      painter.paint(surface);
    }
    if (phase === "running") arm(acc > 0 && acc < step ? step - acc : step);
  }

  function clearTimer(): void {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  }

  api = {
    start() {
      if (phase !== "idle") return;
      phase = "running";
      acc = 0;
      last = Date.now();
      arm(step);
    },
    pause() {
      if (phase !== "running") return;
      phase = "paused";
      clearTimer();
    },
    resume() {
      if (phase !== "paused") return;
      phase = "running";
      last = Date.now();
      arm(acc > 0 && acc < step ? step - acc : step);
    },
    stop() {
      if (phase === "stopped") return;
      phase = "stopped";
      clearTimer();
      try {
        for (const detach of detachers) detach();
      } finally {
        detachers.length = 0;
        painter.dispose();
      }
    },
    snapshot() {
      let n = app.snapshot(scratch);
      if (n > scratch.length) {
        scratch = new Uint8Array(n);
        n = app.snapshot(scratch);
      }
      if (n < 0 || n > scratch.length)
        throw new Error("app snapshot length is invalid");
      const out = new Uint8Array(SNAPSHOT_HEADER + n);
      out[0] = SNAPSHOT_VERSION;
      writeU32(out, 1, tickCount);
      writeU32(out, 5, n);
      if (n > 0) out.set(scratch.subarray(0, n), SNAPSHOT_HEADER);
      return out;
    },
    get tick() {
      return tickCount;
    },
    get running() {
      return phase === "running";
    },
  };
  return api;
}

function clampDim(pref: number, host: number): number {
  const a = pref > 0 ? pref | 0 : 0;
  const b = host > 0 ? host | 0 : 0;
  return a < b ? a : b;
}

function loadSnapshot(blob: Uint8Array, app: App): number {
  if (blob.length < SNAPSHOT_HEADER || blob[0] !== SNAPSHOT_VERSION) {
    const version = blob.length > 0 ? blob[0] : "empty";
    throw new Error(`unsupported snapshot version ${version}`);
  }
  const tick = readU32(blob, 1);
  const len = readU32(blob, 5);
  if (len > blob.length - SNAPSHOT_HEADER)
    throw new Error("truncated snapshot");
  app.hydrate(blob, SNAPSHOT_HEADER, len);
  return tick;
}

function readU32(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset]! |
      (buf[offset + 1]! << 8) |
      (buf[offset + 2]! << 16) |
      (buf[offset + 3]! << 24)) >>>
    0
  );
}

function writeU32(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}
