import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebSwipe } from "./WebSwipe.ts";
import { InputQueue, Key, keyOf, type InputSource } from "./engine.ts";

interface Point {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
}

function fakePointers() {
  const buckets = new Map<string, Set<(ev: Point) => void>>();

  function bucket(type: string) {
    let set = buckets.get(type);
    if (!set) {
      set = new Set();
      buckets.set(type, set);
    }
    return set;
  }

  function dispatch(type: string, ev: Point) {
    for (const cb of bucket(type)) cb(ev);
  }

  const target = {
    addEventListener(type: string, cb: (ev: Point) => void) {
      bucket(type).add(cb);
    },
    removeEventListener(type: string, cb: (ev: Point) => void) {
      bucket(type).delete(cb);
    },
    down(ev: Point) {
      dispatch("pointerdown", ev);
    },
    up(ev: Point) {
      dispatch("pointerup", ev);
    },
    cancel(ev: Point) {
      dispatch("pointercancel", ev);
    },
  };
  return {
    target,
    get listening() {
      return bucket("pointerdown").size;
    },
  };
}

function swipe(
  target: ReturnType<typeof fakePointers>["target"],
  from: Point,
  to: Omit<Point, "pointerId" | "pointerType"> &
    Partial<Pick<Point, "pointerId" | "pointerType">>,
) {
  target.down(from);
  target.up({
    pointerId: from.pointerId,
    pointerType: from.pointerType,
    ...to,
  });
}

test("createWebSwipe accepts Window", () => {
  const typed: (target: Window) => InputSource = createWebSwipe;
  assert.equal(typeof typed, "function");
});

test("a touch drag pushes the dominant arrow", () => {
  const pointers = fakePointers();
  const queue = new InputQueue();
  const detach = createWebSwipe(pointers.target, { min: 24 }).attach(queue);
  const start = { pointerId: 1, pointerType: "touch", clientX: 0, clientY: 0 };

  swipe(pointers.target, start, { clientX: 40, clientY: 5 });
  swipe(pointers.target, start, { clientX: -40, clientY: 5 });
  swipe(pointers.target, start, { clientX: 5, clientY: -40 });
  swipe(pointers.target, start, { clientX: 5, clientY: 40 });
  swipe(pointers.target, start, { clientX: 30, clientY: 40 });

  assert.deepEqual(
    [0, 1, 2, 3, 4].map((i) => keyOf(queue.at(i))),
    [Key.Right, Key.Left, Key.Up, Key.Down, Key.Down],
  );
  detach();
});

test("a short drag and a mouse drag are dropped", () => {
  const pointers = fakePointers();
  const queue = new InputQueue();
  const detach = createWebSwipe(pointers.target).attach(queue);
  swipe(
    pointers.target,
    { pointerId: 1, pointerType: "touch", clientX: 0, clientY: 0 },
    { clientX: 10, clientY: 0 },
  );
  swipe(
    pointers.target,
    { pointerId: 1, pointerType: "mouse", clientX: 0, clientY: 0 },
    { clientX: 80, clientY: 0 },
  );
  assert.equal(queue.length, 0);
  detach();
});

test("a second finger and a cancel do not push", () => {
  const pointers = fakePointers();
  const queue = new InputQueue();
  const detach = createWebSwipe(pointers.target, { min: 10 }).attach(queue);
  pointers.target.down({
    pointerId: 1,
    pointerType: "touch",
    clientX: 0,
    clientY: 0,
  });
  pointers.target.down({
    pointerId: 2,
    pointerType: "touch",
    clientX: 0,
    clientY: 0,
  });
  pointers.target.up({
    pointerId: 2,
    pointerType: "touch",
    clientX: 40,
    clientY: 0,
  });
  pointers.target.cancel({
    pointerId: 1,
    pointerType: "touch",
    clientX: 40,
    clientY: 0,
  });
  pointers.target.up({
    pointerId: 1,
    pointerType: "touch",
    clientX: 40,
    clientY: 0,
  });
  assert.equal(queue.length, 0);
  detach();
  assert.equal(pointers.listening, 0);
});
