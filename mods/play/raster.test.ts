import assert from "node:assert/strict";
import { test } from "node:test";
import { Color, packCell, Surface } from "tinycell";
import { encodeRaster, isBackKey } from "./raster.ts";

test("a cell becomes a width-1 raster triplet", () => {
  const surface = new Surface(1, 1);
  surface.set(0, 0, packCell(0x41, Color.BrightRed, Color.Black));
  const frame = encodeRaster(surface, 2);
  assert.equal(frame.columns, 2);
  assert.equal(frame.rows, 1);
  const bytes = Buffer.from(frame.cells, "base64");
  const copy = Uint8Array.from(bytes);
  const words = new Uint32Array(copy.buffer);
  assert.deepEqual(Array.from(words), [
    0x41, 0xff5555, 0,
    0x20, 0xff5555, 0,
  ]);
});

test("q is the back key and Escape is not", () => {
  assert.equal(isBackKey("q"), true);
  assert.equal(isBackKey("ctrl+c"), true);
  assert.equal(isBackKey("escape"), false);
  assert.equal(isBackKey("up"), false);
});
