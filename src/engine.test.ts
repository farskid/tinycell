import assert from "node:assert/strict";
import { mock, test } from "node:test";
import {
  charEvent,
  createEngine,
  CueQueue,
  InputQueue,
  keyEvent,
  Key,
  keyOf,
  type App,
  type AudioSink,
  type InputQueue as InputQueueType,
  type InputSource,
} from "./engine.ts";

function fakePainter(w = 80, h = 24) {
  let ready = true;
  let disposed = 0;
  const painter = {
    paints: 0,
    grids: [] as Array<{ w: number; h: number }>,
    get disposed() {
      return disposed;
    },
    get ready() {
      return ready;
    },
    size: { w, h },
    onResize(cb: (w: number, h: number) => void) {
      void cb;
    },
    resize(gw: number, gh: number) {
      painter.grids.push({ w: gw, h: gh });
    },
    paint() {
      painter.paints++;
    },
    dispose() {
      disposed++;
    },
    setReady(v: boolean) {
      ready = v;
    },
  };
  return painter;
}

function app(partial: Partial<App> & Pick<App, "tick">): App {
  return {
    size: { w: 10, h: 5 },
    view() {},
    snapshot(out) {
      if (out.length < 1) return 1;
      out[0] = 7;
      return 1;
    },
    hydrate() {},
    ...partial,
  };
}

test("fixed timestep fires one tick per interval and drops time past maxTicksPerWake", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    let ticks = 0;
    const painter = fakePainter();
    const engine = createEngine({
      app: app({
        tick() {
          ticks++;
        },
      }),
      painter,
      tickHz: 20,
    });
    engine.start();
    for (let i = 0; i < 20; i++) mock.timers.tick(50);
    assert.equal(ticks, 20);
    assert.equal(engine.tick, 20);
    assert.equal(painter.paints, 20);
    engine.stop();

    let burstTicks = 0;
    const burst = createEngine({
      app: app({
        tick() {
          burstTicks++;
        },
      }),
      painter: fakePainter(),
      tickHz: 20,
    });
    burst.start();
    mock.timers.tick(1000);
    assert.equal(burstTicks, 4);
    burst.stop();
  } finally {
    mock.timers.reset();
  }
});

test("paints are skipped while painter.ready is false and ticks still run", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    let ticks = 0;
    const painter = fakePainter();
    painter.setReady(false);
    const engine = createEngine({
      app: app({
        tick() {
          ticks++;
        },
      }),
      painter,
      tickHz: 20,
    });
    engine.start();
    for (let i = 0; i < 4; i++) mock.timers.tick(50);
    assert.equal(ticks, 4);
    assert.equal(painter.paints, 0);
    painter.setReady(true);
    mock.timers.tick(50);
    assert.equal(ticks, 5);
    assert.equal(painter.paints, 1);
    engine.stop();
  } finally {
    mock.timers.reset();
  }
});

test("pause stops the clock and does not paint an extra frame", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    let ticks = 0;
    const painter = fakePainter();
    const engine = createEngine({
      app: app({
        tick() {
          ticks++;
        },
      }),
      painter,
      tickHz: 20,
    });
    engine.start();
    mock.timers.tick(50);
    assert.equal(ticks, 1);
    assert.equal(painter.paints, 1);
    assert.equal(engine.running, true);
    engine.pause();
    assert.equal(engine.running, false);
    mock.timers.tick(500);
    assert.equal(ticks, 1);
    assert.equal(painter.paints, 1);
    engine.resume();
    mock.timers.tick(50);
    assert.equal(ticks, 2);
    assert.equal(painter.paints, 2);
    engine.stop();
  } finally {
    mock.timers.reset();
  }
});

test("snapshot round-trips version, tick, and app payload", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const payload = Uint8Array.of(9, 8, 7, 6);
    let restored = new Uint8Array(0);
    const game = app({
      tick() {},
      snapshot(out) {
        if (out.length < payload.length) return payload.length;
        out.set(payload);
        return payload.length;
      },
      hydrate(blob, offset, length) {
        restored = blob.slice(offset, offset + length);
      },
    });
    const painter = fakePainter();
    const engine = createEngine({ app: game, painter, tickHz: 20 });
    engine.start();
    for (let i = 0; i < 3; i++) mock.timers.tick(50);
    const blob = engine.snapshot();
    assert.equal(blob[0], 1);
    assert.equal(
      blob[1]! | (blob[2]! << 8) | (blob[3]! << 16) | (blob[4]! << 24),
      3,
    );
    assert.equal(
      blob[5]! | (blob[6]! << 8) | (blob[7]! << 16) | (blob[8]! << 24),
      4,
    );
    assert.deepEqual(blob.subarray(9), payload);

    restored = new Uint8Array(0);
    const next = createEngine({
      app: game,
      painter: fakePainter(),
      resume: blob,
    });
    assert.deepEqual(restored, payload);
    assert.equal(next.tick, engine.tick);
    engine.stop();

    const bad = new Uint8Array(9);
    bad[0] = 2;
    assert.throws(
      () => createEngine({ app: game, painter: fakePainter(), resume: bad }),
      /version/,
    );
  } finally {
    mock.timers.reset();
  }
});

test("keyOf round-trips keyEvent and returns 0 for charEvent", () => {
  assert.equal(keyOf(keyEvent(Key.Left)), Key.Left);
  assert.equal(keyOf(keyEvent(Key.CtrlC)), Key.CtrlC);
  assert.equal(keyOf(charEvent(0x41)), 0);
  assert.equal(keyOf(0), 0);
});

test("input is cleared after each tick", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    let seen: number[] = [];
    let queue: InputQueueType | undefined;
    const source: InputSource = {
      attach(q) {
        queue = q;
        return () => {
          queue = undefined;
        };
      },
    };
    const engine = createEngine({
      app: app({
        tick(input) {
          seen = [];
          for (let i = 0; i < input.length; i++) seen.push(input.at(i));
        },
      }),
      painter: fakePainter(),
      inputs: [source],
      tickHz: 20,
    });
    queue!.push(keyEvent(Key.Left));
    engine.start();
    mock.timers.tick(50);
    assert.deepEqual(seen, [keyEvent(Key.Left)]);
    mock.timers.tick(50);
    assert.deepEqual(seen, []);
    engine.stop();
    assert.equal(queue, undefined);
  } finally {
    mock.timers.reset();
  }
});

test("input ring drops the oldest event when full", () => {
  const ring = new InputQueue();
  for (let i = 0; i < 65; i++) ring.push(i + 1);
  assert.equal(ring.length, 64);
  assert.equal(ring.at(0), 2);
  assert.equal(ring.at(63), 65);
});

test("stop disposes the painter once and detaches inputs", () => {
  let detaches = 0;
  const source: InputSource = {
    attach() {
      return () => {
        detaches++;
      };
    },
  };
  const painter = fakePainter();
  const engine = createEngine({
    app: app({ tick() {} }),
    painter,
    inputs: [source],
  });
  engine.stop();
  engine.stop();
  assert.equal(painter.disposed, 1);
  assert.equal(detaches, 1);
  assert.equal(engine.running, false);
});

test("grid is min(app.size, painter.size) and onResize follows the host", () => {
  const painter = fakePainter(40, 12);
  let resized: Array<[number, number]> = [];
  let hostCb: ((w: number, h: number) => void) | undefined;
  painter.onResize = (cb) => {
    hostCb = cb;
  };
  const engine = createEngine({
    app: app({
      tick() {},
      size: { w: 80, h: 10 },
      onResize(w, h) {
        resized.push([w, h]);
      },
    }),
    painter,
  });
  assert.deepEqual(painter.grids[0], { w: 40, h: 10 });
  assert.deepEqual(resized, [[40, 10]]);
  painter.size.w = 20;
  painter.size.h = 30;
  hostCb!(20, 30);
  assert.deepEqual(resized.at(-1), [20, 10]);
  engine.stop();
});

function fakeAudio() {
  const played: number[][] = [];
  let ready = true;
  let suspended = 0;
  let resumed = 0;
  let disposed = 0;
  const sink: AudioSink = {
    get ready() {
      return ready;
    },
    play(cues) {
      const ids: number[] = [];
      for (let i = 0; i < cues.length; i++) ids.push(cues.at(i));
      played.push(ids);
    },
    suspend() {
      suspended++;
    },
    resume() {
      resumed++;
    },
    dispose() {
      disposed++;
    },
  };
  return {
    sink,
    played,
    setReady(v: boolean) {
      ready = v;
    },
    get suspended() {
      return suspended;
    },
    get resumed() {
      return resumed;
    },
    get disposed() {
      return disposed;
    },
  };
}

test("cue ring keeps ids 1..255 and drops the oldest when full", () => {
  const ring = new CueQueue();
  ring.push(0);
  ring.push(256);
  ring.push(1.5);
  ring.push(-1);
  assert.equal(ring.length, 0);
  for (let i = 1; i <= 17; i++) ring.push(i);
  assert.equal(ring.length, 16);
  assert.equal(ring.at(0), 2);
  assert.equal(ring.at(15), 17);
  assert.equal(ring.at(16), 0);
  ring.clear();
  assert.equal(ring.length, 0);
});

test("one wake flushes every cue from its ticks in one play", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const audio = fakeAudio();
    let n = 0;
    const engine = createEngine({
      app: app({
        tick(_input, _engine, cues) {
          n++;
          cues!.push(n);
          if (n === 2) cues!.push(10);
        },
      }),
      painter: fakePainter(),
      audio: audio.sink,
      tickHz: 20,
      maxTicksPerWake: 4,
    });
    engine.start();
    mock.timers.tick(50);
    assert.deepEqual(audio.played, [[1]]);
    mock.timers.tick(200);
    assert.deepEqual(audio.played[1], [2, 10, 3, 4, 5]);
    engine.stop();
  } finally {
    mock.timers.reset();
  }
});

test("a sink that is not ready drops the wake and does not replay it", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const audio = fakeAudio();
    audio.setReady(false);
    let n = 0;
    const engine = createEngine({
      app: app({
        tick(_input, _engine, cues) {
          n++;
          cues!.push(n);
        },
      }),
      painter: fakePainter(),
      audio: audio.sink,
      tickHz: 20,
    });
    engine.start();
    mock.timers.tick(50);
    assert.deepEqual(audio.played, []);
    audio.setReady(true);
    mock.timers.tick(50);
    assert.deepEqual(audio.played, [[2]]);
    engine.stop();
  } finally {
    mock.timers.reset();
  }
});

test("pause suspends without playing and resume does not replay", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const audio = fakeAudio();
    const engine = createEngine({
      app: app({
        tick(_input, _engine, cues) {
          cues!.push(1);
        },
      }),
      painter: fakePainter(),
      audio: audio.sink,
      tickHz: 20,
    });
    engine.start();
    mock.timers.tick(50);
    assert.equal(audio.played.length, 1);
    engine.pause();
    assert.equal(audio.suspended, 1);
    mock.timers.tick(500);
    assert.equal(audio.played.length, 1);
    engine.resume();
    assert.equal(audio.resumed, 1);
    assert.equal(audio.played.length, 1);
    mock.timers.tick(50);
    assert.equal(audio.played.length, 2);
    engine.stop();
  } finally {
    mock.timers.reset();
  }
});

test("stop disposes the sink and drops a cue pushed on the quit tick", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const audio = fakeAudio();
    const engine = createEngine({
      app: app({
        tick(_input, eng, cues) {
          cues!.push(4);
          eng.stop();
        },
      }),
      painter: fakePainter(),
      audio: audio.sink,
      tickHz: 20,
    });
    engine.start();
    mock.timers.tick(50);
    assert.deepEqual(audio.played, []);
    assert.equal(audio.disposed, 1);
    engine.stop();
    assert.equal(audio.disposed, 1);
  } finally {
    mock.timers.reset();
  }
});

test("an omitted sink still ticks", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    let ticks = 0;
    const engine = createEngine({
      app: app({
        tick(_input, _engine, cues) {
          ticks++;
          cues!.push(1);
        },
      }),
      painter: fakePainter(),
      tickHz: 20,
    });
    engine.start();
    mock.timers.tick(50);
    assert.equal(ticks, 1);
    engine.pause();
    engine.resume();
    engine.stop();
  } finally {
    mock.timers.reset();
  }
});

test("a throwing sink still clears the queue", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    let n = 0;
    const seen: number[][] = [];
    const sink: AudioSink = {
      ready: true,
      play(cues) {
        const ids: number[] = [];
        for (let i = 0; i < cues.length; i++) ids.push(cues.at(i));
        seen.push(ids);
        if (seen.length === 1) throw new Error("sink down");
      },
      suspend() {},
      resume() {},
      dispose() {},
    };
    const engine = createEngine({
      app: app({
        tick(_input, _engine, cues) {
          n++;
          cues!.push(n);
        },
      }),
      painter: fakePainter(),
      audio: sink,
      tickHz: 20,
    });
    engine.start();
    assert.throws(() => mock.timers.tick(50), /sink down/);
    mock.timers.tick(50);
    assert.deepEqual(seen, [[1], [2]]);
    engine.stop();
  } finally {
    mock.timers.reset();
  }
});

test("snapshot bytes ignore cues", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const engine = createEngine({
      app: app({
        tick(_input, _engine, cues) {
          cues!.push(9);
        },
      }),
      painter: fakePainter(),
      audio: fakeAudio().sink,
      tickHz: 20,
    });
    const before = engine.snapshot();
    engine.start();
    mock.timers.tick(50);
    const after = engine.snapshot();
    assert.deepEqual(after.subarray(9), before.subarray(9));
    engine.stop();
  } finally {
    mock.timers.reset();
  }
});
