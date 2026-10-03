// Cell grid → the terminal Raster encoding (base64 of u32 triplets).
// Client modules cannot draw a Raster, so the pane render hook blits this.
// The terminal catalog is untouched: npm run play still emits the engine glyph.
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

/** Width-1 stand-in for a control, combining, wide, or other non-printable glyph. */
const STAND_IN = 0x3f;

export function isBackKey(token: string): boolean {
  return token === "q" || token === "Q" || token === "ctrl+c";
}

export type RasterFrame = {
  columns: number;
  rows: number;
  cells: string;
};

/**
 * True when `ch` is one printable width-1 BMP code point. Blocks, box drawing,
 * and braille stay. Wide, fullwidth, combining, and control code points do not.
 */
export function isRasterCell(ch: number): boolean {
  if (!Number.isInteger(ch) || ch < 0x20 || ch > 0xffff) return false;
  const ranges = refusedRanges();
  let lo = 0;
  let hi = ranges.length >>> 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const start = ranges[mid * 2]!;
    const end = ranges[mid * 2 + 1]!;
    if (ch < start) hi = mid;
    else if (ch > end) lo = mid + 1;
    else return false;
  }
  return true;
}

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
      const glyph = glyphs?.[cellChar(cell)] ?? cellChar(cell);
      for (let k = 0; k < span; k++) {
        words[n++] = columnGlyph(glyph, span, k);
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

function columnGlyph(glyph: number, span: number, k: number): number {
  // cellW 2 games pack two ASCII columns into one code point. U+6564 is "de"
  // and U+2020 is two spaces, not a dagger. Split that pair the way the
  // terminal painter does. U+2665 stays one heart.
  const pair = span >= 2 ? packedAscii(glyph) : null;
  if (pair) {
    if (k === 0) return pair[0];
    if (k === 1) return pair[1];
    return 0x20;
  }
  return k === 0 ? standIn(glyph) : 0x20;
}

function standIn(ch: number): number {
  return isRasterCell(ch) ? ch : STAND_IN;
}

function packedAscii(ch: number): readonly [number, number] | null {
  if (ch === 0x2665) return null;
  if (!Number.isInteger(ch) || ch <= 0x7e || ch > 0xffff) return null;
  const left = ch & 0xff;
  const right = (ch >>> 8) & 0xff;
  if (left < 0x20 || left > 0x7e || right < 0x20 || right > 0x7e) return null;
  return [left, right];
}

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

// Inclusive BMP ranges the Raster refuses: controls, combining marks, wide and
// fullwidth characters, and other non-printable code points. Ambiguous width
// (blocks, box drawing) is kept.
const REFUSED_RANGES =
  "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";

let refused: Uint16Array | undefined;

function refusedRanges(): Uint16Array {
  if (refused) return refused;
  const bytes = Uint8Array.from(Buffer.from(REFUSED_RANGES, "base64"));
  refused = new Uint16Array(bytes.buffer);
  return refused;
}
