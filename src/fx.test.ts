import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fxAge,
  fxCovers,
  fxEaseIn,
  fxEaseInOut,
  fxEaseOut,
  fxLinear,
  fxPopU,
  fxShakeAt,
  fxShift,
  fxSlideAt,
  type Fx,
  type Pop,
  type Shake,
  type Slide,
} from "./fx.ts";

function slide(over: Partial<Slide<number>> = {}): Slide<number> {
  return {
    kind: "slide",
    from: { x: 0, y: 0 },
    to: { x: 3, y: 0 },
    delay: 0,
    dur: 4,
    age: 0,
    body: 2,
    ...over,
  };
}

function pop(over: Partial<Pop<number>> = {}): Pop<number> {
  return {
    kind: "pop",
    at: { x: 3, y: 1 },
    delay: 4,
    dur: 3,
    age: 0,
    body: 4,
    ...over,
  };
}

test("fxAge drops finished effects and keeps order", () => {
  const list: Fx<number>[] = [slide({ dur: 1 }), pop({ delay: 1, dur: 1 })];
  fxAge(list);
  assert.equal(list.length, 1);
  assert.equal(list[0]!.kind, "pop");
  assert.equal(list[0]!.age, 1);
  fxAge(list);
  assert.equal(list.length, 0);
});

test("a zero duration dies on the next age and covers nothing", () => {
  const list: Fx<number>[] = [slide({ dur: 0, to: { x: 1, y: 0 } })];
  assert.equal(fxSlideAt(list[0] as Slide<number>), null);
  assert.equal(fxCovers(list, 1, 0), false);
  fxAge(list);
  assert.equal(list.length, 0);
});

test("a slide moves linearly and lands on the last frame", () => {
  const fx = slide();
  assert.deepEqual(fxSlideAt(fx), { x: 0, y: 0 });
  fx.age = 1;
  assert.deepEqual(fxSlideAt(fx), { x: 1, y: 0 });
  fx.age = 2;
  assert.deepEqual(fxSlideAt(fx), { x: 2, y: 0 });
  fx.age = 3;
  assert.deepEqual(fxSlideAt(fx), { x: 3, y: 0 });
});

test("a delayed slide stays hidden and still covers the destination", () => {
  const fx = slide({ delay: 2, dur: 4, to: { x: 1, y: 2 } });
  assert.equal(fxSlideAt(fx), null);
  assert.equal(fxCovers([fx], 1, 2), true);
  assert.equal(fxCovers([fx], 0, 0), false);
  fx.age = 2;
  assert.deepEqual(fxSlideAt(fx), { x: 0, y: 0 });
});

test("a one-tick slide is a single frame at the destination", () => {
  const fx = slide({ dur: 1, to: { x: 2, y: 1 } });
  assert.deepEqual(fxSlideAt(fx), { x: 2, y: 1 });
});

test("a pop runs from 0 to 1 after its delay", () => {
  const fx = pop();
  assert.equal(fxPopU(fx), null);
  assert.equal(fxCovers([fx], 3, 1), true);
  fx.age = 4;
  assert.equal(fxPopU(fx), 0);
  fx.age = 5;
  assert.equal(fxPopU(fx), 0.5);
  fx.age = 6;
  assert.equal(fxPopU(fx), 1);
  fx.age = 7;
  assert.equal(fxPopU(fx), 1);
});

test("a one-tick pop is 1", () => {
  assert.equal(fxPopU(pop({ delay: 0, dur: 1, age: 0 })), 1);
});

function shake(over: Partial<Shake> = {}): Shake {
  return { amp: 2, delay: 0, dur: 4, age: 0, ...over };
}

test("a camera shake swings and rests on the last frame", () => {
  const fx = shake();
  assert.deepEqual(fxShakeAt(fx), { x: 2, y: 0 });
  fx.age = 1;
  assert.deepEqual(fxShakeAt(fx), { x: 0, y: 1 });
  fx.age = 2;
  assert.deepEqual(fxShakeAt(fx), { x: -1, y: 0 });
  fx.age = 3;
  assert.deepEqual(fxShakeAt(fx), { x: 0, y: 0 });
  fx.age = 4;
  assert.equal(fxShakeAt(fx), null);
});

test("a delayed shake stays hidden, then starts its swing", () => {
  const fx = shake({ delay: 2 });
  assert.equal(fxShakeAt(fx), null);
  fx.age = 2;
  assert.deepEqual(fxShakeAt(fx), { x: 2, y: 0 });
  fx.age = 3;
  assert.deepEqual(fxShakeAt(fx), { x: 0, y: 1 });
});

test("a one-tick shake is one offset, and zero amp is the origin", () => {
  const once = fxShakeAt(shake({ dur: 1 }));
  assert.ok(once);
  assert.ok(once.x !== 0 || once.y !== 0);
  assert.deepEqual(fxShakeAt(shake({ amp: 0 })), { x: 0, y: 0 });
  assert.equal(fxShakeAt(shake({ dur: 0 })), null);
});

test("fxShift moves cells and clears the gap", () => {
  const src = Uint32Array.from([1, 2, 3, 4, 5, 6]);
  const dst = new Uint32Array(6);
  fxShift(src, dst, 3, 2, 1, 0, 0);
  assert.deepEqual([...dst], [0, 1, 2, 0, 4, 5]);
  fxShift(src, dst, 3, 2, 0, -1, 9);
  assert.deepEqual([...dst], [4, 5, 6, 9, 9, 9]);
});

test("easing keeps the endpoints and bends the middle", () => {
  for (const ease of [fxLinear, fxEaseIn, fxEaseOut, fxEaseInOut]) {
    assert.equal(ease(0), 0);
    assert.equal(ease(1), 1);
  }
  assert.equal(fxLinear(0.5), 0.5);
  assert.equal(fxEaseIn(0.5), 0.25);
  assert.equal(fxEaseOut(0.5), 0.75);
  assert.equal(fxEaseInOut(0.5), 0.5);
  assert.ok(fxEaseInOut(0.25) < 0.25);
  assert.ok(fxEaseInOut(0.75) > 0.75);
});
