// Canvas diff painter. The only module that draws to a canvas.
import {
  Attr,
  cellAttrs,
  cellBg,
  cellChar,
  cellFg,
  Color,
  EMPTY_CELL,
  type Painter,
  type Surface,
} from "./engine.ts";

interface Canvas2D {
  fillStyle: string;
  font: string;
  textAlign: string;
  textBaseline: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  bezierCurveTo(
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    x: number,
    y: number,
  ): void;
  closePath(): void;
  fill(): void;
  setTransform(
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ): void;
}

interface CanvasHost {
  width: number;
  height: number;
  clientWidth?: number;
  clientHeight?: number;
  nodeType?: number;
  getContext(kind: "2d"): Canvas2D | null;
  addEventListener?(type: "resize", listener: () => void): void;
  removeEventListener?(type: "resize", listener: () => void): void;
}

export interface WebCanvasOptions {
  /** Bitmap pixels per logical cell. */
  cellPx?: number;
}

const RGB: Array<readonly [number, number, number]> = [
  [204, 204, 198],
  [0, 0, 0],
  [170, 0, 0],
  [0, 170, 0],
  [170, 85, 0],
  [0, 0, 170],
  [170, 0, 170],
  [0, 170, 170],
  [204, 204, 198],
  [128, 128, 128],
  [255, 85, 85],
  [85, 255, 85],
  [255, 255, 85],
  [85, 85, 255],
  [255, 85, 255],
  [85, 255, 255],
  [232, 232, 226],
];

const FG = RGB.map((c) => shade(c, false));
const BG = RGB.map((c, i) => (i === 0 ? "rgb(0,0,0)" : shade(c, false)));
const FG_DIM = RGB.map((c) => shade(c, true));
const BG_DIM = RGB.map((c, i) => (i === 0 ? "rgb(0,0,0)" : shade(c, true)));

export function createWebCanvas(
  canvas: HTMLCanvasElement,
  opts?: WebCanvasOptions,
): Painter;
export function createWebCanvas(
  canvas: CanvasHost,
  opts?: WebCanvasOptions,
): Painter;
export function createWebCanvas(
  canvas: HTMLCanvasElement | CanvasHost,
  opts?: WebCanvasOptions,
): Painter {
  const host = canvas as CanvasHost;
  if (typeof host.getContext !== "function")
    throw new Error("createWebCanvas requires a canvas");
  const cellPx = opts?.cellPx ?? 16;
  if (!(cellPx > 0)) throw new Error("cellPx must be > 0");
  const ctx = host.getContext("2d");
  if (!ctx) throw new Error("createWebCanvas requires a 2d canvas");
  return new WebCanvasPainter(host, ctx, cellPx | 0);
}

class WebCanvasPainter implements Painter {
  private readonly canvas: CanvasHost;
  private readonly ctx: Canvas2D;
  private readonly cellPx: number;
  private readonly font: string;
  private readonly fontBold: string;
  private readonly fontHalf: string;
  private readonly fontHalfBold: string;
  private readonly host = { w: 0, h: 0 };
  private readonly listeners: Array<(w: number, h: number) => void> = [];
  private readonly onHost: () => void;
  private back: Uint32Array = new Uint32Array(0);
  private observer: ResizeObserver | undefined;
  private bw = -1;
  private bh = -1;
  private cssW = 0;
  private cssH = 0;
  private bitmapW = 0;
  private bitmapH = 0;
  private scale = 1;
  private fitting = false;
  private readyFlag = true;
  private disposed = false;

  constructor(canvas: CanvasHost, ctx: Canvas2D, cellPx: number) {
    this.canvas = canvas;
    this.ctx = ctx;
    this.cellPx = cellPx;
    const half = Math.max(1, cellPx >> 1);
    this.font = `${cellPx}px monospace`;
    this.fontBold = `bold ${cellPx}px monospace`;
    this.fontHalf = `${half}px monospace`;
    this.fontHalfBold = `bold ${half}px monospace`;
    this.onHost = () => {
      if (this.disposed || this.fitting) return;
      this.fitting = true;
      try {
        this.apply(true);
      } finally {
        this.fitting = false;
      }
    };
    this.apply(false);
    this.listen();
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
    if (this.bw === ww && this.bh === hh && this.back.length === ww * hh)
      return;
    this.bw = ww;
    this.bh = hh;
    this.back = new Uint32Array(ww * hh);
    this.back.fill(EMPTY_CELL);
    this.prepare();
    this.ctx.fillStyle = BG[0]!;
    this.ctx.fillRect(
      0,
      0,
      this.host.w * this.cellPx,
      this.host.h * this.cellPx,
    );
  }

  paint(front: Surface): void {
    if (this.disposed || !this.readyFlag) return;
    if (front.w !== this.bw || front.h !== this.bh) return;
    const cells = front.cells;
    const back = this.back;
    const width = this.bw;
    let dirty = false;
    for (let y = 0; y < this.bh; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const cell = cells[row + x]!;
        if (cell === back[row + x]) continue;
        if (!dirty) {
          dirty = true;
          this.prepare();
        }
        this.draw(x, y, cell);
      }
    }
    if (!dirty) return;
    back.set(cells);
  }

  dispose(): void {
    if (this.disposed) return;
    this.observer?.disconnect();
    this.observer = undefined;
    this.canvas.removeEventListener?.("resize", this.onHost);
    this.disposed = true;
    this.readyFlag = false;
  }

  private listen(): void {
    if (typeof ResizeObserver !== "function" || this.canvas.nodeType !== 1) {
      this.canvas.addEventListener?.("resize", this.onHost);
      return;
    }
    this.observer = new ResizeObserver(this.onHost);
    this.observer.observe(this.canvas as unknown as Element);
  }

  private apply(notify: boolean): void {
    const box = this.box();
    // No CSS: the bitmap echoes back as clientWidth. Keep the box that
    // produced it so the write cannot grow the grid.
    const echoed =
      this.bitmapW > 0 && box.w === this.bitmapW && box.h === this.bitmapH;
    const cssW = echoed ? this.cssW : box.w;
    const cssH = echoed ? this.cssH : box.h;
    if (!echoed) {
      this.cssW = box.w;
      this.cssH = box.h;
    }
    const w = cssW > 0 ? (cssW / this.cellPx) | 0 : 0;
    const h = cssH > 0 ? (cssH / this.cellPx) | 0 : 0;
    this.fit(w, h);
    if (w === this.host.w && h === this.host.h) return;
    this.host.w = w;
    this.host.h = h;
    if (!notify) return;
    for (const cb of this.listeners) cb(w, h);
  }

  private box(): { w: number; h: number } {
    const canvas = this.canvas;
    return {
      w: positive(canvas.clientWidth) ?? positive(canvas.width) ?? 0,
      h: positive(canvas.clientHeight) ?? positive(canvas.height) ?? 0,
    };
  }

  private fit(cellsW: number, cellsH: number): void {
    const d = ratio();
    const bw = Math.round(cellsW * this.cellPx * d);
    const bh = Math.round(cellsH * this.cellPx * d);
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    this.bitmapW = bw;
    this.bitmapH = bh;
    this.scale = d;
    this.prepare();
  }

  private prepare(): void {
    const d = this.scale;
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
  }

  private draw(x: number, y: number, cell: number): void {
    let fg = cellFg(cell);
    const bg = cellBg(cell);
    const attr = cellAttrs(cell);
    if ((attr & Attr.Bold) !== 0 && fg >= Color.Black && fg <= Color.White)
      fg += 8;
    const dim = (attr & Attr.Dim) !== 0;
    let fgCss = (dim ? FG_DIM : FG)[fg] ?? (dim ? FG_DIM : FG)[0]!;
    let bgCss = (dim ? BG_DIM : BG)[bg] ?? (dim ? BG_DIM : BG)[0]!;
    if ((attr & Attr.Inverse) !== 0) {
      const swap = fgCss;
      fgCss = bgCss;
      bgCss = swap;
    }
    const px = this.cellPx;
    const x0 = x * px;
    const y0 = y * px;
    const ctx = this.ctx;
    ctx.fillStyle = bgCss;
    ctx.fillRect(x0, y0, px, px);
    const ch = cellChar(cell);
    if (ch === 0x25a1) {
      ctx.fillStyle = fgCss;
      strokeBox(ctx, x0, y0, px);
      return;
    }
    if (ch === 0x2665) {
      ctx.fillStyle = fgCss;
      fillHeart(ctx, x0, y0, px);
      return;
    }
    const pair = asciiPair(ch);
    if (pair) {
      ctx.fillStyle = fgCss;
      const bold = (attr & Attr.Bold) !== 0;
      ctx.font = bold ? this.fontHalfBold : this.fontHalf;
      ctx.fillText(pair[0]!, x0 + px / 4, y0 + px / 2);
      ctx.fillText(pair[1]!, x0 + (3 * px) / 4, y0 + px / 2);
    } else if (ch !== 0 && ch !== 0x20) {
      ctx.fillStyle = fgCss;
      ctx.font = (attr & Attr.Bold) !== 0 ? this.fontBold : this.font;
      ctx.fillText(glyph(ch), x0 + px / 2, y0 + px / 2);
    }
    if ((attr & Attr.Underline) !== 0) {
      ctx.fillStyle = fgCss;
      const t = Math.max(1, px >> 4);
      ctx.fillRect(x0, y0 + px - t, px, t);
    }
  }
}

function fillHeart(ctx: Canvas2D, x: number, y: number, px: number): void {
  const l = x + px * 0.08;
  const r = x + px * 0.92;
  const mid = x + px * 0.5;
  const top = y + px * 0.28;
  ctx.beginPath();
  ctx.moveTo(mid, y + px * 0.86);
  ctx.bezierCurveTo(l - px * 0.08, y + px * 0.48, l, y + px * 0.08, mid - px * 0.16, top);
  ctx.bezierCurveTo(mid - px * 0.05, y + px * 0.4, mid, y + px * 0.46, mid, y + px * 0.46);
  ctx.bezierCurveTo(mid, y + px * 0.46, mid + px * 0.05, y + px * 0.4, mid + px * 0.16, top);
  ctx.bezierCurveTo(r, y + px * 0.08, r + px * 0.08, y + px * 0.48, mid, y + px * 0.86);
  ctx.closePath();
  ctx.fill();
}

function strokeBox(
  ctx: Canvas2D,
  x: number,
  y: number,
  px: number,
): void {
  const t = Math.max(1, px >> 3);
  ctx.fillRect(x, y, px, t);
  ctx.fillRect(x, y + px - t, px, t);
  ctx.fillRect(x, y + t, t, px - 2 * t);
  ctx.fillRect(x + px - t, y + t, t, px - 2 * t);
}

function asciiPair(ch: number): string | null {
  // Same packing as ANSI cellW 2: low byte left, high byte right.
  if (ch <= 0x7e) return null;
  const left = ch & 0xff;
  const right = (ch >>> 8) & 0xff;
  if (left < 0x20 || left > 0x7e || right < 0x20 || right > 0x7e) return null;
  return String.fromCharCode(left, right);
}

function glyph(ch: number): string {
  if (ch < 0x20 || ch > 0xffff) return "?";
  return String.fromCharCode(ch);
}

function shade(rgb: readonly [number, number, number], dim: boolean): string {
  const s = dim ? 0.5 : 1;
  return `rgb(${(rgb[0] * s) | 0},${(rgb[1] * s) | 0},${(rgb[2] * s) | 0})`;
}

function positive(value: number | undefined): number | undefined {
  return typeof value === "number" && value > 0 ? value : undefined;
}

function ratio(): number {
  const n = globalThis.devicePixelRatio;
  return typeof n === "number" && n > 0 ? n : 1;
}
