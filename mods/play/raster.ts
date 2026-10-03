// Cell grid → the terminal Raster encoding (base64 of u32 triplets).
// Client modules cannot draw a Raster, so the pane render hook blits this.
import { Attr, cellAttrs, cellBg, cellChar, cellFg, Color, type Surface } from "tinycell";

const RGB: ReadonlyArray<readonly [number, number, number]> = [
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

/** Shown in the pane. Escape never arrives in onKey; q does. */
export const BACK_KEY = "q";

export function isBackKey(token: string): boolean {
  return token === "q" || token === "Q" || token === "ctrl+c";
}

export type RasterFrame = {
  columns: number;
  rows: number;
  cells: string;
};

export function encodeRaster(
  surface: Surface,
  cellW = 1,
  glyphs?: Readonly<Record<number, number>>,
): RasterFrame {
  const span = cellW > 0 ? cellW | 0 : 1;
  const columns = surface.w * span;
  const rows = surface.h;
  if (columns < 1 || rows < 1 || columns > 512 || rows > 256) {
    throw new Error(`raster ${columns}x${rows} is outside 1..512 by 1..256`);
  }
  const words = new Uint32Array(columns * rows * 3);
  let n = 0;
  for (let y = 0; y < surface.h; y++) {
    const row = y * surface.w;
    for (let x = 0; x < surface.w; x++) {
      const cell = surface.cells[row + x] ?? 0;
      const colors = paintColors(cell);
      const glyph = width1(glyphs?.[cellChar(cell)] ?? cellChar(cell));
      for (let k = 0; k < span; k++) {
        words[n++] = k === 0 ? glyph : 0x20;
        words[n++] = colors.fg;
        words[n++] = colors.bg;
      }
    }
  }
  const bytes = new Uint8Array(words.buffer, words.byteOffset, words.byteLength);
  return { columns, rows, cells: base64(bytes) };
}

function paintColors(cell: number): { fg: number; bg: number } {
  let fg = cellFg(cell);
  let bg = cellBg(cell);
  const attr = cellAttrs(cell);
  if ((attr & Attr.Bold) !== 0 && fg >= Color.Black && fg <= Color.White) fg += 8;
  const dim = (attr & Attr.Dim) !== 0;
  let fgRgb = rgb(fg, dim);
  let bgRgb = fg === bg && bg === Color.Default ? 0 : rgb(bg === Color.Default ? Color.Black : bg, dim);
  if (bg === Color.Default) bgRgb = 0;
  if ((attr & Attr.Inverse) !== 0) {
    const swap = fgRgb;
    fgRgb = bgRgb;
    bgRgb = swap;
  }
  return { fg: fgRgb, bg: bgRgb };
}

function rgb(color: number, dim: boolean): number {
  const src = RGB[color] ?? RGB[0]!;
  const scale = dim ? 0.5 : 1;
  const r = (src[0] * scale) | 0;
  const g = (src[1] * scale) | 0;
  const b = (src[2] * scale) | 0;
  return (r << 16) | (g << 8) | b;
}

function width1(ch: number): number {
  if (!Number.isInteger(ch) || ch < 0x20 || ch > 0xffff) return 0x3f;
  if (ch >= 0xff01 && ch <= 0xff60) return 0x3f;
  return ch;
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
