import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebCanvas } from "./CanvasPainter.ts";
import {
  Attr,
  Color,
  createEngine,
  EMPTY_CELL,
  packCell,
  Surface,
  type Painter,
} from "./engine.ts";

type Op =
  | { op: "fillRect"; x: number; y: number; w: number; h: number; fill: string }
  | { op: "fill"; fill: string }
  | {
      op: "fillText";
      text: string;
      x: number;
      y: number;
      fill: string;
      font: string;
    };

function fakeCanvas(w: number, h: number) {
  const ops: Op[] = [];
  const listeners = new Set<() => void>();
  const ctx = {
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    fillRect(x: number, y: number, rw: number, rh: number) {
      ops.push({
        op: "fillRect",
        x,
        y,
        w: rw,
        h: rh,
        fill: this.fillStyle,
      });
    },
    fillText(text: string, x: number, y: number) {
      ops.push({
        op: "fillText",
        text,
        x,
        y,
        fill: this.fillStyle,
        font: this.font,
      });
    },
    beginPath() {},
    moveTo() {},
    bezierCurveTo() {},
    closePath() {},
    fill() {
      ops.push({ op: "fill", fill: this.fillStyle });
    },
    setTransform() {},
  };
  const canvas = {
    width: w,
    height: h,
    clientWidth: w,
    clientHeight: h,
    getContext(kind: string) {
      return kind === "2d" ? ctx : null;
    },
    addEventListener(type: string, cb: () => void) {
      if (type === "resize") listeners.add(cb);
    },
    removeEventListener(type: string, cb: () => void) {
      if (type === "resize") listeners.delete(cb);
    },
    resize() {
      for (const cb of listeners) cb();
    },
  };
  return { canvas, ops };
}

test("createWebCanvas rejects a canvas without 2d and accepts HTMLCanvasElement", () => {
  assert.throws(
    () => createWebCanvas({ width: 16, height: 16, getContext: () => null }),
    /2d/,
  );
  const typed: (canvas: HTMLCanvasElement) => Painter = createWebCanvas;
  assert.equal(typeof typed, "function");
});

test("diffs cells, skips identical frames, and dispose is idempotent", () => {
  const view = fakeCanvas(64, 16);
  const painter = createWebCanvas(view.canvas, { cellPx: 16 });
  const surface = new Surface(4, 1);
  surface.fill(EMPTY_CELL);
  painter.resize(4, 1);
  const afterSetup = view.ops.length;
  painter.paint(surface);
  assert.equal(view.ops.length, afterSetup);

  surface.set(1, 0, packCell(0x20, Color.Default, Color.Red));
  painter.paint(surface);
  assert.deepEqual(view.ops.at(-1), {
    op: "fillRect",
    x: 16,
    y: 0,
    w: 16,
    h: 16,
    fill: "rgb(170,0,0)",
  });

  const afterCell = view.ops.length;
  painter.paint(surface);
  assert.equal(view.ops.length, afterCell);
  painter.dispose();
  painter.paint(surface);
  painter.dispose();
  assert.equal(view.ops.length, afterCell);
  assert.equal(painter.ready, false);
});

test("pinned backgrounds match the terminal RGB", () => {
  const view = fakeCanvas(48, 16);
  const painter = createWebCanvas(view.canvas, { cellPx: 16 });
  const surface = new Surface(3, 1);
  surface.fill(EMPTY_CELL);
  painter.resize(3, 1);
  const start = view.ops.length;
  surface.set(0, 0, packCell(0x20, Color.Default, Color.BrightBlack));
  surface.set(1, 0, packCell(0x20, Color.Default, Color.White));
  surface.set(2, 0, packCell(0x20, Color.Default, Color.BrightWhite));
  painter.paint(surface);
  assert.deepEqual(
    view.ops.slice(start).map((op) => (op.op === "fillRect" ? op.fill : "")),
    ["rgb(128,128,128)", "rgb(204,204,198)", "rgb(232,232,226)"],
  );
  painter.dispose();
});

test("glyphs are centered fillText and spaces are not", () => {
  const view = fakeCanvas(32, 16);
  const painter = createWebCanvas(view.canvas, { cellPx: 16 });
  const surface = new Surface(2, 1);
  surface.fill(EMPTY_CELL);
  painter.resize(2, 1);
  surface.set(0, 0, packCell(0x41, Color.Green));
  surface.set(1, 0, packCell(0x20, Color.Default, Color.Blue));
  painter.paint(surface);
  const text = view.ops.filter((op) => op.op === "fillText");
  assert.deepEqual(text, [
    {
      op: "fillText",
      text: "A",
      x: 8,
      y: 8,
      fill: "rgb(0,170,0)",
      font: "16px monospace",
    },
  ]);
  painter.dispose();
});

test("a hollow square is a cell-sized frame, not a glyph", () => {
  const view = fakeCanvas(16, 16);
  const painter = createWebCanvas(view.canvas, { cellPx: 16 });
  const surface = new Surface(1, 1);
  surface.fill(EMPTY_CELL);
  painter.resize(1, 1);
  const mark = view.ops.length;
  surface.set(0, 0, packCell(0x25a1, Color.Blue, Color.Black));
  painter.paint(surface);
  assert.equal(
    view.ops.slice(mark).some((op) => op.op === "fillText"),
    false,
  );
  assert.deepEqual(view.ops.slice(mark), [
      { op: "fillRect", x: 0, y: 0, w: 16, h: 16, fill: "rgb(0,0,0)" },
      { op: "fillRect", x: 0, y: 0, w: 16, h: 2, fill: "rgb(0,0,170)" },
      { op: "fillRect", x: 0, y: 14, w: 16, h: 2, fill: "rgb(0,0,170)" },
      { op: "fillRect", x: 0, y: 2, w: 2, h: 12, fill: "rgb(0,0,170)" },
      { op: "fillRect", x: 14, y: 2, w: 2, h: 12, fill: "rgb(0,0,170)" },
    ],
  );
  painter.dispose();
});

test("a heart is a filled shape, not an ASCII pair", () => {
  const view = fakeCanvas(16, 16);
  const painter = createWebCanvas(view.canvas, { cellPx: 16 });
  const surface = new Surface(1, 1);
  surface.fill(EMPTY_CELL);
  painter.resize(1, 1);
  surface.set(0, 0, packCell(0x2665, Color.BrightRed, Color.Blue));
  painter.paint(surface);
  assert.equal(
    view.ops.some((op) => op.op === "fillText"),
    false,
  );
  assert.ok(view.ops.some((op) => op.op === "fill" && op.fill === "rgb(255,85,85)"));
  painter.dispose();
});

test("an ASCII pair packed in the char draws as two glyphs", () => {
  const view = fakeCanvas(16, 16);
  const painter = createWebCanvas(view.canvas, { cellPx: 16 });
  const surface = new Surface(1, 1);
  surface.fill(EMPTY_CELL);
  painter.resize(1, 1);
  surface.set(0, 0, packCell(0x3a20));
  painter.paint(surface);
  assert.deepEqual(
    view.ops.filter((op) => op.op === "fillText"),
    [
      {
        op: "fillText",
        text: " ",
        x: 4,
        y: 8,
        fill: "rgb(204,204,198)",
        font: "8px monospace",
      },
      {
        op: "fillText",
        text: ":",
        x: 12,
        y: 8,
        fill: "rgb(204,204,198)",
        font: "8px monospace",
      },
    ],
  );
  painter.dispose();
});

test("inverse swaps colors and bold brightens the foreground", () => {
  const view = fakeCanvas(16, 16);
  const painter = createWebCanvas(view.canvas, { cellPx: 16 });
  const surface = new Surface(1, 1);
  surface.fill(EMPTY_CELL);
  painter.resize(1, 1);
  const start = view.ops.length;
  surface.set(
    0,
    0,
    packCell(0x5a, Color.Red, Color.Blue, Attr.Bold | Attr.Inverse),
  );
  painter.paint(surface);
  const cell = view.ops[start];
  const text = view.ops[start + 1];
  assert.equal(cell?.op === "fillRect" && cell.fill, "rgb(255,85,85)");
  assert.equal(text?.op === "fillText" && text.fill, "rgb(0,0,170)");
  assert.equal(text?.op === "fillText" && text.font, "bold 16px monospace");
  painter.dispose();
});

test("cellPx divides the host and a resize event reports the new grid", () => {
  const view = fakeCanvas(80, 48);
  const painter = createWebCanvas(view.canvas, { cellPx: 16 });
  assert.deepEqual({ w: painter.size.w, h: painter.size.h }, { w: 5, h: 3 });
  let seen = { w: 0, h: 0 };
  painter.onResize((w, h) => {
    seen = { w, h };
  });
  view.canvas.clientWidth = 160;
  view.canvas.clientHeight = 32;
  view.canvas.resize();
  assert.deepEqual(seen, { w: 10, h: 2 });
  assert.deepEqual({ w: painter.size.w, h: painter.size.h }, { w: 10, h: 2 });
  painter.dispose();
  view.canvas.clientWidth = 320;
  view.canvas.resize();
  assert.deepEqual(seen, { w: 10, h: 2 });
});

test("engine can construct the canvas painter with a fake canvas", () => {
  const view = fakeCanvas(64, 32);
  const painter = createWebCanvas(view.canvas, { cellPx: 16 });
  const engine = createEngine({
    app: {
      size: { w: 4, h: 2 },
      tick() {},
      view(surface) {
        surface.fill(EMPTY_CELL);
      },
      snapshot() {
        return 0;
      },
      hydrate() {},
    },
    painter,
  });
  engine.stop();
  engine.stop();
});
