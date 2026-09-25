import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebGamepad } from "./WebGamepad.ts";
import { InputQueue, Key, keyOf, type InputSource } from "./engine.ts";

interface Button {
  pressed?: boolean;
  value?: number;
}

interface Pad {
  mapping: string;
  connected: boolean;
  buttons: Button[];
  axes: number[];
}

function fakePad() {
  const buckets = new Map<string, Set<() => void>>();
  let pads: Array<Pad | null> = [];
  let nextId = 1;
  const pending = new Map<number, (time: number) => void>();
  const prevR = globalThis.requestAnimationFrame;
  const prevC = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = (cb) => {
    const id = nextId++;
    pending.set(id, cb);
    return id;
  };
  globalThis.cancelAnimationFrame = (id: number) => {
    pending.delete(id);
  };

  function bucket(type: string) {
    let set = buckets.get(type);
    if (!set) {
      set = new Set();
      buckets.set(type, set);
    }
    return set;
  }

  function dispatch(type: string) {
    for (const cb of bucket(type)) cb();
  }

  const target = {
    navigator: {
      getGamepads() {
        return pads;
      },
    },
    addEventListener(type: string, cb: () => void) {
      bucket(type).add(cb);
    },
    removeEventListener(type: string, cb: () => void) {
      bucket(type).delete(cb);
    },
    connect() {
      dispatch("gamepadconnected");
    },
    disconnect() {
      dispatch("gamepaddisconnected");
    },
    blur() {
      dispatch("blur");
    },
  };

  return {
    target,
    set(next: Array<Pad | null>) {
      pads = next;
    },
    flush() {
      const id = pending.keys().next().value as number | undefined;
      if (id === undefined) return;
      const cb = pending.get(id);
      pending.delete(id);
      cb?.(0);
    },
    get queued() {
      return pending.size;
    },
    restore() {
      globalThis.requestAnimationFrame = prevR;
      globalThis.cancelAnimationFrame = prevC;
    },
    connect() {
      dispatch("gamepadconnected");
    },
    disconnect() {
      dispatch("gamepaddisconnected");
    },
    listening() {
      return bucket("gamepadconnected").size;
    },
  };
}

function pad(buttons: Button[], axes: number[] = [0, 0], mapping = "standard"): Pad {
  return { mapping, connected: true, buttons, axes };
}

function btn(index: number, pressed = true): Button[] {
  const buttons: Button[] = [];
  buttons[index] = { pressed, value: pressed ? 1 : 0 };
  return buttons;
}

function keysOf(queue: InputQueue): Array<Key | 0> {
  const out: Array<Key | 0> = [];
  for (let i = 0; i < queue.length; i++) out.push(keyOf(queue.at(i)));
  return out;
}

test("createWebGamepad accepts Window", () => {
  const typed: (target: Window) => InputSource = createWebGamepad;
  assert.equal(typeof typed, "function");
});

test("cross and r2 emit one space unless space is held", () => {
  const pads = fakePad();
  const queue = new InputQueue();
  const detach = createWebGamepad(pads.target).attach(queue);
  try {
    pads.set([pad(btn(0))]);
    pads.flush();
    assert.deepEqual(keysOf(queue), [Key.Space]);
    queue.clear();
    pads.flush();
    assert.equal(queue.length, 0);
    pads.set([pad(btn(0, false))]);
    pads.flush();
    pads.set([pad([{ pressed: false, value: 0.6 }], undefined, "standard")]);
    const r2 = btn(0, false);
    r2[7] = { pressed: true, value: 0.6 };
    pads.set([pad(r2)]);
    pads.flush();
    assert.deepEqual(keysOf(queue), [Key.Space]);
    queue.clear();
    pads.flush();
    assert.equal(queue.length, 0);
    const weak = btn(0, false);
    weak[7] = { pressed: true, value: 0.4 };
    pads.set([pad(weak)]);
    pads.flush();
    assert.equal(queue.length, 0);
  } finally {
    detach();
    pads.restore();
  }
});

test("held space repeats and options and circle are edges", () => {
  const pads = fakePad();
  const queue = new InputQueue();
  const detach = createWebGamepad(pads.target, { hold: [Key.Space] }).attach(queue);
  try {
    const buttons = btn(0);
    buttons[9] = { pressed: true, value: 1 };
    buttons[1] = { pressed: true, value: 1 };
    pads.set([pad(buttons)]);
    pads.flush();
    assert.deepEqual(keysOf(queue), [Key.Enter, Key.Escape, Key.Space]);
    queue.clear();
    pads.flush();
    assert.deepEqual(keysOf(queue), [Key.Space]);
    queue.clear();
    pads.set([pad([])]);
    pads.flush();
    buttons[9] = { pressed: true, value: 1 };
    pads.set([pad(buttons)]);
    pads.flush();
    assert.deepEqual(keysOf(queue), [Key.Enter, Key.Escape, Key.Space]);
  } finally {
    detach();
    pads.restore();
  }
});

test("stick uses a deadzone and one dominant axis", () => {
  const pads = fakePad();
  const queue = new InputQueue();
  const detach = createWebGamepad(pads.target, {
    hold: [Key.Left, Key.Right, Key.Up, Key.Down],
  }).attach(queue);
  try {
    pads.set([pad([], [0.2, 0])]);
    pads.flush();
    assert.equal(queue.length, 0);
    pads.set([pad([], [-0.6, 0.2])]);
    pads.flush();
    assert.deepEqual(keysOf(queue), [Key.Left]);
    queue.clear();
    pads.set([pad([], [-0.4, 0])]);
    pads.flush();
    assert.deepEqual(keysOf(queue), [Key.Left]);
    queue.clear();
    pads.set([pad([], [-0.4, 0.7])]);
    pads.flush();
    assert.deepEqual(keysOf(queue), [Key.Down]);
    queue.clear();
    pads.set([pad([], [0, 0.2])]);
    pads.flush();
    assert.equal(queue.length, 0);
    pads.set([pad([], [0.8, -0.9])]);
    pads.flush();
    assert.deepEqual(keysOf(queue), [Key.Up]);
  } finally {
    detach();
    pads.restore();
  }
});

test("diagonal stick emits both axes", () => {
  const pads = fakePad();
  const queue = new InputQueue();
  const detach = createWebGamepad(pads.target, {
    hold: [Key.Left, Key.Right, Key.Up, Key.Down],
    diagonal: true,
  }).attach(queue);
  try {
    pads.set([pad([], [-0.7, -0.8])]);
    pads.flush();
    assert.deepEqual(keysOf(queue), [Key.Up, Key.Left]);
    queue.clear();
    pads.set([pad([], [-0.4, -0.4])]);
    pads.flush();
    assert.deepEqual(keysOf(queue), [Key.Up, Key.Left]);
    queue.clear();
    pads.set([pad([], [-0.2, -0.8])]);
    pads.flush();
    assert.deepEqual(keysOf(queue), [Key.Up]);
  } finally {
    detach();
    pads.restore();
  }
});

test("dpad and stick emit each direction once per frame", () => {
  const pads = fakePad();
  const queue = new InputQueue();
  const detach = createWebGamepad(pads.target, {
    hold: [Key.Left, Key.Up],
  }).attach(queue);
  try {
    const buttons: Button[] = [];
    buttons[14] = { pressed: true, value: 1 };
    pads.set([pad(buttons, [0, -0.8])]);
    pads.flush();
    assert.deepEqual(keysOf(queue), [Key.Up, Key.Left]);
    queue.clear();
    pads.flush();
    assert.deepEqual(keysOf(queue), [Key.Up, Key.Left]);
  } finally {
    detach();
    pads.restore();
  }
});

test("bind replaces the face buttons", () => {
  const pads = fakePad();
  const queue = new InputQueue();
  const detach = createWebGamepad(pads.target, {
    bind: [
      [0, Key.Enter],
      [2, Key.Space],
      [6, Key.Tab],
    ],
  }).attach(queue);
  try {
    const buttons = btn(0);
    buttons[2] = { pressed: true, value: 1 };
    buttons[6] = { pressed: true, value: 0.8 };
    pads.set([pad(buttons)]);
    pads.flush();
    assert.deepEqual(keysOf(queue), [Key.Enter, Key.Space, Key.Tab]);
  } finally {
    detach();
    pads.restore();
  }
});

test("a nonstandard mapping emits nothing", () => {
  const pads = fakePad();
  const queue = new InputQueue();
  const detach = createWebGamepad(pads.target).attach(queue);
  try {
    pads.set([pad(btn(0), [0, 0], "")]);
    pads.connect();
    pads.flush();
    assert.equal(queue.length, 0);
    assert.equal(pads.queued, 0);
  } finally {
    detach();
    pads.restore();
  }
});

test("disconnect and blur stop repeats until a new press", () => {
  const pads = fakePad();
  const queue = new InputQueue();
  const detach = createWebGamepad(pads.target, {
    hold: [Key.Left, Key.Space],
  }).attach(queue);
  try {
    const buttons = btn(0);
    buttons[14] = { pressed: true, value: 1 };
    pads.set([pad(buttons)]);
    pads.flush();
    queue.clear();
    pads.target.blur();
    pads.flush();
    assert.equal(queue.length, 0);
    pads.set([pad([])]);
    pads.flush();
    pads.set([pad(buttons)]);
    pads.flush();
    assert.deepEqual(keysOf(queue), [Key.Left, Key.Space]);
    queue.clear();
    pads.set([null]);
    pads.disconnect();
    pads.flush();
    assert.equal(queue.length, 0);
    pads.flush();
    assert.equal(queue.length, 0);
  } finally {
    detach();
    pads.restore();
  }
});

test("detach stops input and a second attach replaces the first", () => {
  const pads = fakePad();
  const first = new InputQueue();
  const second = new InputQueue();
  const source = createWebGamepad(pads.target);
  const detach = source.attach(first);
  try {
    assert.equal(pads.listening(), 1);
    source.attach(second);
    assert.equal(pads.listening(), 1);
    pads.set([pad(btn(14))]);
    pads.flush();
    assert.equal(first.length, 0);
    assert.equal(keyOf(second.at(0)), Key.Left);
    detach();
    pads.set([pad(btn(15))]);
    pads.connect();
    pads.flush();
    assert.equal(keyOf(second.at(1)), Key.Right);
    const stop = source.attach(second);
    stop();
    stop();
    assert.equal(pads.listening(), 0);
    const n = second.length;
    pads.set([pad(btn(12))]);
    pads.connect();
    pads.flush();
    assert.equal(second.length, n);
  } finally {
    pads.restore();
  }
});
