import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createTTY } from "./TTY.ts";
import {
  charEvent,
  InputQueue,
  Key,
  keyEvent,
  keyOf,
  type InputSource,
} from "./engine.ts";

function fakeIn() {
  const listeners = new Set<(chunk: Uint8Array | string) => void>();
  let raw = false;
  let paused = false;
  const stream = {
    isTTY: true,
    get isRaw() {
      return raw;
    },
    setRawMode(mode: boolean) {
      raw = mode;
    },
    on(event: string, cb: (chunk: Uint8Array | string) => void) {
      if (event === "data") listeners.add(cb);
    },
    off(event: string, cb: (chunk: Uint8Array | string) => void) {
      if (event === "data") listeners.delete(cb);
    },
    resume() {
      paused = false;
    },
    pause() {
      paused = true;
    },
    push(bytes: number[]) {
      const chunk = Uint8Array.from(bytes);
      for (const cb of listeners) cb(chunk);
    },
    get paused() {
      return paused;
    },
  };
  return stream;
}

test("createTTY rejects a non-TTY and accepts stdin's type", () => {
  assert.throws(
    () =>
      createTTY({
        isTTY: false,
        setRawMode() {},
        on() {},
        off() {},
      }),
    /TTY/,
  );
  const typed: (stream: typeof process.stdin) => InputSource = createTTY;
  assert.equal(typeof typed, "function");
});

test("arrow split across chunks and SS3 arrows", () => {
  const stream = fakeIn();
  const queue = new InputQueue();
  const detach = createTTY(stream).attach(queue);
  try {
    stream.push([0x1b, 0x5b]);
    assert.equal(queue.length, 0);
    stream.push([0x41]);
    assert.equal(keyOf(queue.at(0)), Key.Up);

    stream.push([0x1b]);
    stream.push([0x4f, 0x44]);
    assert.equal(keyOf(queue.at(1)), Key.Left);

    stream.push([0x1b, 0x5b, 0x31, 0x35, 0x7e, 0x61]);
    assert.equal(queue.at(2), charEvent(0x61));
    assert.equal(keyOf(queue.at(2)), 0);
  } finally {
    detach();
  }
});

test("bare ESC emits Escape only after the timeout with no follower", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const stream = fakeIn();
    const queue = new InputQueue();
    const detach = createTTY(stream).attach(queue);
    try {
      stream.push([0x1b]);
      assert.equal(queue.length, 0);
      mock.timers.tick(9);
      assert.equal(queue.length, 0);
      stream.push([0x5b, 0x43]);
      mock.timers.tick(20);
      assert.equal(queue.length, 1);
      assert.equal(keyOf(queue.at(0)), Key.Right);

      stream.push([0x1b]);
      mock.timers.tick(10);
      assert.equal(keyOf(queue.at(1)), Key.Escape);
      stream.push([0x21]);
      assert.equal(queue.at(2), charEvent(0x21));
    } finally {
      detach();
    }
  } finally {
    mock.timers.reset();
  }
});

test("Ctrl-C byte, enter, tab, backspace, and space", () => {
  const stream = fakeIn();
  const queue = new InputQueue();
  const before = process.listenerCount("SIGINT");
  const detach = createTTY(stream).attach(queue);
  try {
    assert.equal(process.listenerCount("SIGINT"), before);
    stream.push([0x03, 0x0d, 0x0a, 0x09, 0x7f, 0x08, 0x20]);
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5, 6].map((i) => keyOf(queue.at(i))),
      [
        Key.CtrlC,
        Key.Enter,
        Key.Enter,
        Key.Tab,
        Key.Backspace,
        Key.Backspace,
        Key.Space,
      ],
    );
  } finally {
    detach();
  }
});

test("detach restores raw mode, stops reads, and is idempotent", () => {
  const stream = fakeIn();
  const queue = new InputQueue();
  assert.equal(stream.isRaw, false);
  const detach = createTTY(stream).attach(queue);
  assert.equal(stream.isRaw, true);
  detach();
  assert.equal(stream.isRaw, false);
  assert.equal(stream.paused, true);
  const n = queue.length;
  stream.push([0x03]);
  assert.equal(queue.length, n);
  stream.setRawMode(true);
  detach();
  assert.equal(stream.isRaw, true);
});

test("keyOf(keyEvent(Key.Left)) === Key.Left", () => {
  assert.equal(keyOf(keyEvent(Key.Left)), Key.Left);
  assert.equal(keyOf(charEvent(0x41)), 0);
});
