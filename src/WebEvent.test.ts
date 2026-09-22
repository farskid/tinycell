import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebEvent } from "./WebEvent.ts";
import {
  charEvent,
  InputQueue,
  Key,
  keyOf,
  type InputSource,
} from "./engine.ts";

interface Press {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

function fakeKeys() {
  const listeners = new Set<(ev: Press & { preventDefault(): void }) => void>();
  let prevented = 0;
  const target = {
    addEventListener(
      type: string,
      cb: (ev: Press & { preventDefault(): void }) => void,
    ) {
      if (type === "keydown") listeners.add(cb);
    },
    removeEventListener(
      type: string,
      cb: (ev: Press & { preventDefault(): void }) => void,
    ) {
      if (type === "keydown") listeners.delete(cb);
    },
    press(ev: Press) {
      const event = {
        ...ev,
        preventDefault() {
          prevented++;
        },
      };
      for (const cb of listeners) cb(event);
    },
  };
  return {
    target,
    get listening() {
      return listeners.size;
    },
    get prevented() {
      return prevented;
    },
  };
}

test("createWebEvent accepts Window", () => {
  const typed: (target: Window) => InputSource = createWebEvent;
  assert.equal(typeof typed, "function");
});

test("arrows, editing keys, and Ctrl-C", () => {
  const keys = fakeKeys();
  const queue = new InputQueue();
  const detach = createWebEvent(keys.target).attach(queue);
  try {
    keys.target.press({ key: "ArrowUp" });
    keys.target.press({ key: "ArrowDown" });
    keys.target.press({ key: "ArrowLeft" });
    keys.target.press({ key: "ArrowRight" });
    keys.target.press({ key: "Enter" });
    keys.target.press({ key: "Escape" });
    keys.target.press({ key: " " });
    keys.target.press({ key: "Tab" });
    keys.target.press({ key: "Backspace" });
    keys.target.press({ key: "c", ctrlKey: true });
    keys.target.press({ key: "C", metaKey: true });
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => keyOf(queue.at(i))),
      [
        Key.Up,
        Key.Down,
        Key.Left,
        Key.Right,
        Key.Enter,
        Key.Escape,
        Key.Space,
        Key.Tab,
        Key.Backspace,
        Key.CtrlC,
        Key.CtrlC,
      ],
    );
    assert.equal(keys.prevented, 11);
  } finally {
    detach();
  }
});

test("printable ASCII is a char event and modifiers are not", () => {
  const keys = fakeKeys();
  const queue = new InputQueue();
  const detach = createWebEvent(keys.target).attach(queue);
  try {
    keys.target.press({ key: "a" });
    keys.target.press({ key: "Z" });
    keys.target.press({ key: "a", ctrlKey: true });
    keys.target.press({ key: "b", altKey: true });
    keys.target.press({ key: "Shift" });
    assert.equal(queue.length, 2);
    assert.equal(queue.at(0), charEvent(0x61));
    assert.equal(queue.at(1), charEvent(0x5a));
    assert.equal(keyOf(queue.at(0)), 0);
  } finally {
    detach();
  }
});

test("detach stops keys and a second attach replaces the first", () => {
  const keys = fakeKeys();
  const first = new InputQueue();
  const second = new InputQueue();
  const source = createWebEvent(keys.target);
  const detach = source.attach(first);
  assert.equal(keys.listening, 1);
  source.attach(second);
  assert.equal(keys.listening, 1);
  keys.target.press({ key: "ArrowLeft" });
  assert.equal(first.length, 0);
  assert.equal(keyOf(second.at(0)), Key.Left);
  detach();
  keys.target.press({ key: "ArrowRight" });
  assert.equal(second.length, 2);
  assert.equal(keyOf(second.at(1)), Key.Right);
  const stop = source.attach(second);
  stop();
  stop();
  assert.equal(keys.listening, 0);
  const n = second.length;
  keys.target.press({ key: "ArrowUp" });
  assert.equal(second.length, n);
});
