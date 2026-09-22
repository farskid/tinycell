// ANSI diff painter. The only module that writes stdout / escape bytes.
import type { WriteStream } from "node:tty";
import {
  cellAttrs,
  cellBg,
  cellChar,
  cellFg,
  Color,
  EMPTY_CELL,
  type Painter,
  type Surface,
} from "./engine.ts";

interface AnsiStream {
  isTTY?: boolean;
  columns?: number;
  rows?: number;
  write(chunk: Uint8Array): boolean;
  on?(event: "resize", listener: () => void): void;
  off?(event: "resize", listener: () => void): void;
  once?(event: "drain", listener: () => void): void;
}

const text = new TextEncoder();
const ENTER_ALT = text.encode("\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H");
const LEAVE_ALT = text.encode("\x1b[0m\x1b[?25h\x1b[?1049l");
const CLEAR = text.encode("\x1b[2J\x1b[H");

const FG_CODE = [39, 30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97];
const BG_CODE = [49, 40, 41, 42, 43, 44, 45, 46, 47, 100, 101, 102, 103, 104, 105, 106, 107];

export function createANSIPainter(stream: WriteStream): Painter;
export function createANSIPainter(stream: AnsiStream): Painter;
export function createANSIPainter(stream: WriteStream | AnsiStream): Painter {
  const out = stream as AnsiStream;
  if (out.isTTY !== true) throw new Error("createANSIPainter requires a TTY stream");
  return new ANSIPainter(out);
}

class ANSIPainter implements Painter {
  private readonly stream: AnsiStream;
  private readonly host = { w: 80, h: 24 };
  private readonly listeners: Array<(w: number, h: number) => void> = [];
  private readonly onHost: () => void;
  private back: Uint32Array = new Uint32Array(0);
  private out: Uint8Array = new Uint8Array(64);
  private n = 0;
  private bw = -1;
  private bh = -1;
  private readyFlag = true;
  private waitingDrain = false;
  private disposed = false;
  private lastFg = -1;
  private lastBg = -1;
  private lastAttr = -1;

  constructor(stream: AnsiStream) {
    this.stream = stream;
    this.host.w = dim(stream.columns, 80);
    this.host.h = dim(stream.rows, 24);
    this.onHost = () => {
      const w = dim(stream.columns, this.host.w);
      const h = dim(stream.rows, this.host.h);
      if (w === this.host.w && h === this.host.h) return;
      this.host.w = w;
      this.host.h = h;
      for (const cb of this.listeners) cb(w, h);
    };
    stream.on?.("resize", this.onHost);
    this.writeBytes(ENTER_ALT);
  }

  get ready(): boolean {
    return this.readyFlag;
  }

  get size(): { readonly w: number; readonly h: number } {
    return this.host;
  }

  onResize(cb: (w: number, h: number) => void): void {
    this.listeners.push(cb);
  }

  resize(w: number, h: number): void {
    if (this.disposed) return;
    const ww = w > 0 ? w | 0 : 0;
    const hh = h > 0 ? h | 0 : 0;
    if (this.bw === ww && this.bh === hh && this.back.length === ww * hh) return;
    this.bw = ww;
    this.bh = hh;
    this.back = new Uint32Array(ww * hh);
    this.back.fill(EMPTY_CELL);
    this.out = new Uint8Array(ww * hh * 64 + 64);
    this.lastFg = -1;
    this.lastBg = -1;
    this.lastAttr = -1;
    this.writeBytes(CLEAR);
  }

  paint(front: Surface): void {
    if (this.disposed || !this.readyFlag) return;
    if (front.w !== this.bw || front.h !== this.bh) return;
    const cells = front.cells;
    const back = this.back;
    const width = this.bw;
    this.n = 0;
    for (let y = 0; y < this.bh; y++) {
      const row = y * width;
      let x = 0;
      while (x < width) {
        if (cells[row + x] === back[row + x]) {
          x++;
          continue;
        }
        this.cup(y + 1, x + 1);
        while (x < width && cells[row + x] !== back[row + x]) {
          const cell = cells[row + x]!;
          const fg = cellFg(cell);
          const bg = cellBg(cell);
          const attr = cellAttrs(cell);
          if (fg !== this.lastFg || bg !== this.lastBg || attr !== this.lastAttr) {
            this.sgr(fg, bg, attr);
            this.lastFg = fg;
            this.lastBg = bg;
            this.lastAttr = attr;
          }
          let ch = cellChar(cell);
          if (ch < 0x20 || ch > 0x7e) ch = 0x3f;
          this.put(ch);
          x++;
        }
      }
    }
    if (this.n === 0) return;
    const ok = this.stream.write(this.out.subarray(0, this.n));
    back.set(cells);
    if (ok === false) this.armDrain();
  }

  dispose(): void {
    if (this.disposed) return;
    this.stream.off?.("resize", this.onHost);
    this.stream.write(LEAVE_ALT);
    this.disposed = true;
    this.readyFlag = false;
  }

  private writeBytes(bytes: Uint8Array): void {
    const ok = this.stream.write(bytes);
    if (ok === false) this.armDrain();
  }

  private armDrain(): void {
    this.readyFlag = false;
    if (this.waitingDrain) return;
    this.waitingDrain = true;
    this.stream.once?.("drain", () => {
      this.waitingDrain = false;
      if (!this.disposed) this.readyFlag = true;
    });
  }

  private put(b: number): void {
    this.out[this.n++] = b;
  }

  private writeDec(value: number): void {
    let v = value | 0;
    if (v < 10) {
      this.put(48 + v);
      return;
    }
    let digits = 0;
    let x = v;
    while (x >= 10) {
      x = (x / 10) | 0;
      digits++;
    }
    const start = this.n;
    const end = start + digits + 1;
    this.n = end;
    let p = end;
    while (v > 0) {
      this.out[--p] = 48 + (v % 10);
      v = (v / 10) | 0;
    }
  }

  private cup(row: number, col: number): void {
    this.put(0x1b);
    this.put(0x5b);
    this.writeDec(row);
    this.put(0x3b);
    this.writeDec(col);
    this.put(0x48);
  }

  private sgr(fg: number, bg: number, attr: number): void {
    this.put(0x1b);
    this.put(0x5b);
    this.put(0x30);
    if (attr & 1) this.param(1);
    if (attr & 2) this.param(2);
    if (attr & 4) this.param(4);
    if (attr & 8) this.param(7);
    if (fg !== Color.Default) this.param(FG_CODE[fg] ?? 39);
    if (bg !== Color.Default) this.param(BG_CODE[bg] ?? 49);
    this.put(0x6d);
  }

  private param(n: number): void {
    this.put(0x3b);
    this.writeDec(n);
  }
}

function dim(value: number | undefined, fallback: number): number {
  return typeof value === "number" && value > 0 ? Math.floor(value) : fallback;
}
