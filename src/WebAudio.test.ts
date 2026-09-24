import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createEngine, type App, type CueQueue } from "./engine.ts";
import { createWebAudio, type SampleBuffer } from "./WebAudio.ts";

interface Started {
  kind: "osc" | "buffer";
  type?: string;
  freq?: number;
  loop?: boolean;
  gain: number;
  stopAt?: number;
  stopped: boolean;
  buffer?: SampleBuffer | null;
}

function fakeContext(state = "running") {
  const started: Started[] = [];
  let current = state;
  let closed = 0;
  let suspended = 0;
  let resumed = 0;
  const now = { t: 0 };

  function gainNode(value: number) {
    const node = {
      gain: { value },
      connect() {},
      disconnect() {},
    };
    return node;
  }

  const ctx = {
    get state() {
      return current;
    },
    sampleRate: 1000,
    get currentTime() {
      return now.t;
    },
    destination: { connect() {}, disconnect() {} },
    createGain: () => gainNode(1),
    createOscillator() {
      const rec: Started = { kind: "osc", gain: 0, stopped: false };
      const osc = {
        type: "square" as "square" | "triangle" | "sawtooth",
        frequency: { value: 0 },
        connect(dest: object) {
          const gain = (dest as { gain?: { value: number } }).gain;
          rec.type = osc.type;
          rec.freq = osc.frequency.value;
          rec.gain = gain?.value ?? 0;
        },
        disconnect() {},
        start() {
          started.push(rec);
        },
        stop(when?: number) {
          if (when === undefined) rec.stopped = true;
          else rec.stopAt = when;
        },
      };
      return osc;
    },
    createBufferSource() {
      const rec: Started = { kind: "buffer", gain: 0, stopped: false };
      const src = {
        buffer: null as SampleBuffer | null,
        loop: false,
        connect(dest: object) {
          const gain = (dest as { gain?: { value: number } }).gain;
          rec.buffer = src.buffer;
          rec.loop = src.loop;
          rec.gain = gain?.value ?? 0;
        },
        disconnect() {},
        start() {
          started.push(rec);
        },
        stop(when?: number) {
          if (when === undefined) rec.stopped = true;
          else rec.stopAt = when;
        },
      };
      return src;
    },
    createBuffer(channels: number, length: number, sampleRate: number): SampleBuffer {
      const data = new Float32Array(length);
      return {
        duration: length / sampleRate,
        length,
        numberOfChannels: channels,
        sampleRate,
        getChannelData() {
          return data;
        },
      };
    },
    suspend() {
      suspended++;
      current = "suspended";
      return Promise.resolve();
    },
    resume() {
      resumed++;
      current = "running";
      return Promise.resolve();
    },
    close() {
      closed++;
      current = "closed";
      return Promise.resolve();
    },
  };

  return {
    ctx,
    started,
    now,
    get suspended() {
      return suspended;
    },
    get resumed() {
      return resumed;
    },
    get closed() {
      return closed;
    },
    setState(v: string) {
      current = v;
    },
  };
}

function buffer(duration = 0.2): SampleBuffer {
  return {
    duration,
    length: 8,
    numberOfChannels: 1,
    sampleRate: 40,
    getChannelData() {
      return new Float32Array(8);
    },
  };
}

function play(ids: number[]) {
  return {
    length: ids.length,
    at(i: number) {
      return ids[i] ?? 0;
    },
  } as CueQueue;
}

test("sfx tone starts an oscillator and an unknown id is ignored", () => {
  const host = fakeContext();
  const sink = createWebAudio(host.ctx, {
    volume: 1,
    cues: {
      1: { wave: "square", note: 69, ms: 50, gain: 0.4, lane: "sfx" },
    },
  });
  sink.play(play([1, 9]));
  assert.equal(host.started.length, 1);
  assert.equal(host.started[0]!.kind, "osc");
  assert.equal(host.started[0]!.type, "square");
  assert.equal(host.started[0]!.freq, 440);
  assert.equal(host.started[0]!.gain, 0.4);
  assert.equal(host.started[0]!.stopAt, 0.05);
});

test("sfx cap steals the oldest voice and leaves music alone", () => {
  const host = fakeContext();
  const sink = createWebAudio(host.ctx, {
    voices: 2,
    cues: {
      1: { wave: "square", note: 60, ms: 500, gain: 0.2 },
      2: { wave: "triangle", note: 64, gain: 0.2, lane: "music" },
    },
  });
  sink.play(play([2]));
  sink.play(play([1]));
  sink.play(play([1]));
  sink.play(play([1]));
  const music = host.started[0]!;
  assert.equal(music.kind, "osc");
  assert.equal(music.stopped, false);
  assert.equal(host.started[1]!.stopped, true);
  assert.equal(host.started[3]!.stopped, false);
});

test("music replaces, holds, and gain 0 releases", () => {
  const host = fakeContext();
  const sink = createWebAudio(host.ctx, {
    cues: {
      1: { wave: "triangle", note: 60, gain: 0.15, lane: "music" },
      2: { wave: "sawtooth", note: 72, gain: 0.15, lane: "music" },
      3: { wave: "square", note: 48, gain: 0, lane: "music" },
    },
  });
  sink.play(play([1, 2]));
  assert.equal(host.started.length, 1);
  assert.equal(host.started[0]!.type, "sawtooth");
  assert.equal(host.started[0]!.stopAt, undefined);
  sink.play(play([1]));
  assert.equal(host.started[0]!.stopped, true);
  assert.equal(host.started[1]!.type, "triangle");
  sink.play(play([3]));
  assert.equal(host.started[1]!.stopped, true);
  assert.equal(host.started.length, 2);
});

test("noise and samples use buffers; music samples loop", () => {
  const host = fakeContext();
  const flap = buffer();
  const theme = buffer(2);
  const sink = createWebAudio(host.ctx, {
    cues: {
      1: { wave: "noise", note: 0, ms: 40, gain: 0.5 },
      2: { sample: flap, gain: 0.4, lane: "sfx" },
      3: { sample: theme, gain: 0.2, lane: "music" },
    },
  });
  sink.play(play([1, 2, 3]));
  assert.equal(host.started.length, 3);
  assert.equal(host.started[0]!.kind, "buffer");
  assert.equal(host.started[0]!.loop, false);
  assert.equal(host.started[0]!.stopAt, 0.04);
  assert.equal(host.started[1]!.buffer, flap);
  assert.equal(host.started[1]!.loop, false);
  assert.equal(host.started[2]!.buffer, theme);
  assert.equal(host.started[2]!.loop, true);
  sink.play(play([2]));
  assert.equal(host.started[2]!.stopped, false);
});

test("suspend, resume, dispose, and the unlock listener", () => {
  const host = fakeContext("suspended");
  let clicks = 0;
  let keys = 0;
  const listeners = new Map<string, () => void>();
  const target = {
    addEventListener(type: string, cb: () => void) {
      if (type === "pointerdown") clicks++;
      if (type === "keydown") keys++;
      listeners.set(type, cb);
    },
    removeEventListener(type: string) {
      if (type === "pointerdown") clicks--;
      if (type === "keydown") keys--;
      listeners.delete(type);
    },
  };
  const sink = createWebAudio(host.ctx, { cues: {}, unlock: target });
  assert.equal(sink.ready, false);
  assert.equal(clicks, 1);
  assert.equal(keys, 1);
  listeners.get("keydown")!();
  assert.equal(host.resumed, 1);
  assert.equal(clicks, 0);
  assert.equal(keys, 0);
  sink.suspend();
  assert.equal(host.suspended, 1);
  sink.resume();
  sink.dispose();
  sink.dispose();
  assert.equal(host.closed, 1);
});

test("a running context does not listen for unlock", () => {
  const host = fakeContext("running");
  let added = 0;
  const target = {
    addEventListener() {
      added++;
    },
    removeEventListener() {},
  };
  createWebAudio(host.ctx, { cues: {}, unlock: target });
  assert.equal(added, 0);
});

test("engine flush reaches the web sink", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const host = fakeContext();
    const game: App = {
      size: { w: 4, h: 4 },
      tick(_input, _engine, cues) {
        cues!.push(1);
      },
      view() {},
      snapshot(out) {
        if (out.length < 1) return 1;
        out[0] = 1;
        return 1;
      },
      hydrate() {},
    };
    const engine = createEngine({
      app: game,
      painter: {
        ready: true,
        size: { w: 4, h: 4 },
        onResize() {},
        resize() {},
        paint() {},
        dispose() {},
      },
      audio: createWebAudio(host.ctx, {
        cues: {
          1: { wave: "square", note: 76, ms: 50, gain: 0.4 },
        },
      }),
      tickHz: 20,
    });
    engine.start();
    mock.timers.tick(50);
    assert.equal(host.started.length, 1);
    assert.equal(host.started[0]!.freq, 440 * 2 ** ((76 - 69) / 12));
    engine.pause();
    assert.equal(host.suspended, 1);
    engine.resume();
    engine.stop();
    assert.equal(host.closed, 1);
  } finally {
    mock.timers.reset();
  }
});
