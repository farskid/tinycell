import assert from "node:assert/strict";
import { test } from "node:test";
import { Color, packCell, Surface } from "tinycell";
import { encodeRaster, isBackKey, isRasterCell } from "./raster.ts";

test("a cell becomes a width-1 raster triplet", () => {
  const surface = new Surface(1, 1);
  surface.set(0, 0, packCell(0x41, Color.BrightRed, Color.Black));
  const frame = encodeRaster(surface, 2);
  assert.equal(frame.columns, 2);
  assert.equal(frame.rows, 1);
  const words = wordsOf(frame.cells);
  assert.deepEqual(Array.from(words), [
    0x41, 0xff5555, 0,
    0x20, 0xff5555, 0,
  ]);
});

test("wide and control glyphs are width-1 before blit", () => {
  const surface = new Surface(3, 1);
  surface.set(0, 0, packCell(0x6564));
  surface.set(1, 0, packCell(0x09));
  surface.set(2, 0, packCell(0x3000));
  const frame = encodeRaster(surface, 2);
  const words = wordsOf(frame.cells);
  const codes = codesOf(frame.cells);
  assert.equal(codes.includes(0x6564), false);
  assert.equal(codes.includes(0x09), false);
  assert.equal(codes.includes(0x3000), false);
  assert.deepEqual(codes, [0x64, 0x65, 0x3f, 0x20, 0x3f, 0x20]);
  for (const code of codes) assert.equal(isRasterCell(code), true);
  assert.equal(isRasterCell(0x6564), false);
  assert.equal(isRasterCell(0x0301), false);
  assert.equal(isRasterCell(0x2588), true);
  assert.equal(isRasterCell(0x2665), true);
  const spaces = new Surface(1, 1);
  spaces.set(0, 0, packCell(0x2020));
  const heart = new Surface(1, 1);
  heart.set(0, 0, packCell(0x2665));
  assert.deepEqual(codesOf(encodeRaster(spaces, 2).cells), [0x20, 0x20]);
  assert.deepEqual(codesOf(encodeRaster(heart, 2).cells), [0x2665, 0x20]);
});

test("q is the back key and Escape is not", () => {
  assert.equal(isBackKey("q"), true);
  assert.equal(isBackKey("ctrl+c"), true);
  assert.equal(isBackKey("escape"), false);
  assert.equal(isBackKey("up"), false);
});

function wordsOf(cells: string): number[] {
  const copy = Uint8Array.from(Buffer.from(cells, "base64"));
  return Array.from(new Uint32Array(copy.buffer));
}

function codesOf(cells: string): number[] {
  return wordsOf(cells).filter((_, i) => i % 3 === 0);
}
