import assert from "node:assert/strict";
import { test } from "node:test";
import { createANSIPainter } from "./ANSIPainter.ts";
import {
  Color,
  createEngine,
  EMPTY_CELL,
  packCell,
  Surface,
  type Painter,
} from "./engine.ts";

function fakeOut() {
  const chunks: Uint8Array[] = [];
  let drain: (() => void) | undefined;
  let accept = true;
  const stream = {
    isTTY: true,
    columns: 80,
    rows: 24,
    write(chunk: Uint8Array) {
      chunks.push(Uint8Array.from(chunk));
      return accept;
    },
    on() {},
    off() {},
    once(event: string, cb: () => void) {
      if (event === "drain") drain = cb;
    },
  };
  return {
    stream,
    chunks,
    setAccept(v: boolean) {
      accept = v;
    },
    drain() {
      const cb = drain;
      drain = undefined;
      cb?.();
    },
  };
}

function latin1(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

test("createANSIPainter rejects a non-TTY and accepts stdout's type", () => {
  assert.throws(
    () => createANSIPainter({ isTTY: false, write: () => true }),
    /TTY/,
  );
  const typed: (stream: typeof process.stdout) => Painter = createANSIPainter;
  assert.equal(typeof typed, "function");
});

test("diffs cells, skips identical frames, and dispose is idempotent", () => {
  const out = fakeOut();
  const painter = createANSIPainter(out.stream);
  const surface = new Surface(4, 1);
  surface.fill(EMPTY_CELL);
  painter.resize(4, 1);

  // Empty diff writes nothing. No cursor-home and no cell payload.
  const afterSetup = out.chunks.length;
  painter.paint(surface);
  assert.equal(out.chunks.length, afterSetup);

  surface.set(1, 0, packCell(0x41));
  painter.paint(surface);
  assert.equal(latin1(out.chunks.at(-1)!), "\x1b[1;2H\x1b[0mA");

  const afterCell = out.chunks.length;
  painter.paint(surface);
  assert.equal(out.chunks.length, afterCell);

  const beforeDispose = out.chunks.length;
  painter.dispose();
  assert.equal(out.chunks.length, beforeDispose + 1);
  const leave = latin1(out.chunks.at(-1)!);
  assert.ok(leave.includes("\x1b[?25h"));
  assert.ok(leave.includes("\x1b[?1049l"));
  painter.dispose();
  assert.equal(out.chunks.length, beforeDispose + 1);
});

test("adjacent changes share one cursor move, and color is a 16-color SGR", () => {
  const out = fakeOut();
  const painter = createANSIPainter(out.stream);
  const surface = new Surface(4, 1);
  surface.fill(EMPTY_CELL);
  painter.resize(4, 1);
  surface.set(0, 0, packCell(0x42));
  surface.set(1, 0, packCell(0x43));
  painter.paint(surface);
  assert.equal(latin1(out.chunks.at(-1)!), "\x1b[1;1H\x1b[0mBC");

  const colored = fakeOut();
  const painter2 = createANSIPainter(colored.stream);
  const row = new Surface(1, 1);
  row.fill(EMPTY_CELL);
  painter2.resize(1, 1);
  row.set(0, 0, packCell(0x5a, Color.Red));
  painter2.paint(row);
  assert.equal(latin1(colored.chunks.at(-1)!), "\x1b[1;1H\x1b[0;31mZ");
  painter.dispose();
  painter2.dispose();
});

test("cellW 2 pads a glyph to two columns and reports half the columns", () => {
  const out = fakeOut();
  const painter = createANSIPainter(out.stream, { cellW: 2 });
  assert.equal(painter.size.w, 40);
  const surface = new Surface(2, 1);
  surface.fill(EMPTY_CELL);
  painter.resize(2, 1);
  surface.set(1, 0, packCell(0x41));
  painter.paint(surface);
  assert.equal(latin1(out.chunks.at(-1)!), "\x1b[1;3H\x1b[0mA ");
  painter.dispose();
});

test("cellW 2 emits an ASCII pair packed in the 16-bit char", () => {
  const out = fakeOut();
  const painter = createANSIPainter(out.stream, { cellW: 2 });
  const surface = new Surface(1, 1);
  surface.fill(EMPTY_CELL);
  painter.resize(1, 1);
  surface.set(0, 0, packCell(0x3a20));
  painter.paint(surface);
  assert.equal(latin1(out.chunks.at(-1)!), "\x1b[1;1H\x1b[0m :");
  painter.dispose();
});

test("cellW 2 does not pad a fullwidth glyph", () => {
  const out = fakeOut();
  const painter = createANSIPainter(out.stream, { cellW: 2 });
  const surface = new Surface(1, 1);
  surface.fill(EMPTY_CELL);
  painter.resize(1, 1);
  surface.set(0, 0, packCell(0xff5c));
  painter.paint(surface);
  assert.equal(latin1(out.chunks.at(-1)!), "\x1b[1;1H\x1b[0m\xef\xbd\x9c");
  painter.dispose();
});

test("a heart stays a glyph under cellW 2", () => {
  const out = fakeOut();
  const painter = createANSIPainter(out.stream, { cellW: 2 });
  const surface = new Surface(1, 1);
  surface.fill(EMPTY_CELL);
  painter.resize(1, 1);
  surface.set(0, 0, packCell(0x2665));
  painter.paint(surface);
  assert.equal(latin1(out.chunks.at(-1)!), "\x1b[1;1H\x1b[0m\xe2\x99\xa5 ");
  painter.dispose();
});

test("BMP glyphs emit UTF-8", () => {
  const out = fakeOut();
  const painter = createANSIPainter(out.stream);
  const surface = new Surface(1, 1);
  surface.fill(EMPTY_CELL);
  painter.resize(1, 1);
  surface.set(0, 0, packCell(0x25b6));
  painter.paint(surface);
  assert.equal(latin1(out.chunks.at(-1)!), "\x1b[1;1H\x1b[0m\xe2\x96\xb6");
  painter.dispose();
});

test("theme-fragile backgrounds pin 256 + truecolor", () => {
  const out = fakeOut();
  const painter = createANSIPainter(out.stream);
  const surface = new Surface(3, 1);
  surface.fill(EMPTY_CELL);
  painter.resize(3, 1);
  surface.set(0, 0, packCell(0x20, Color.Default, Color.BrightBlack));
  surface.set(1, 0, packCell(0x20, Color.Default, Color.White));
  surface.set(2, 0, packCell(0x20, Color.Default, Color.BrightWhite));
  painter.paint(surface);
  assert.equal(
    latin1(out.chunks.at(-1)!),
    "\x1b[1;1H\x1b[0;48;5;244;48;2;128;128;128m \x1b[0;48;5;251;48;2;204;204;198m \x1b[0;48;5;254;48;2;232;232;226m ",
  );
  painter.dispose();
});

test("ready stays false until stdout drains", () => {
  const out = fakeOut();
  const painter = createANSIPainter(out.stream);
  const surface = new Surface(1, 1);
  surface.fill(EMPTY_CELL);
  painter.resize(1, 1);
  surface.set(0, 0, packCell(0x41));
  out.setAccept(false);
  painter.paint(surface);
  assert.equal(painter.ready, false);
  const n = out.chunks.length;
  painter.paint(surface);
  assert.equal(out.chunks.length, n);
  out.drain();
  assert.equal(painter.ready, true);
});

test("engine can construct the ANSI painter type with a fake tty", () => {
  const out = fakeOut();
  const painter = createANSIPainter(out.stream);
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
