// Web Audio sink. The only module that touches an AudioContext.
// The engine passes cue ids. This file maps them to tones or buffers.

import type { AudioSink, CueQueue } from "./engine.ts";

export type Wave = "square" | "triangle" | "sawtooth" | "noise";
export type Lane = "sfx" | "music";

export interface ToneCue {
  wave: Wave;
  /** MIDI note. Ignored for noise. */
  note: number;
  /** SFX length. Music holds until the next music cue. */
  ms?: number;
  /** 0..1. A music cue with gain 0 releases the held voice. */
  gain: number;
  lane?: Lane;
}

export interface SampleBuffer {
  readonly duration: number;
  readonly length: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

export interface SampleCue {
  sample: SampleBuffer;
  /** Music defaults to looping. SFX defaults to once. */
  loop?: boolean;
  gain: number;
  lane?: Lane;
}

export type CueDef = ToneCue | SampleCue;

export interface WebAudioOptions {
  cues: Readonly<Record<number, CueDef>>;
  /** SFX voice cap. Default 4. */
  voices?: number;
  /** Master gain. Default 0.3. */
  volume?: number;
  /** Gesture target. Omitted when the context is already running. */
  unlock?: {
    addEventListener(type: string, cb: () => void): void;
    removeEventListener(type: string, cb: () => void): void;
  };
}

interface AudioParam {
  value: number;
}

interface AudioNode {
  connect(dest: AudioNode): void;
  disconnect(): void;
}

interface Oscillator extends AudioNode {
  type: Exclude<Wave, "noise">;
  frequency: AudioParam;
  start(when?: number): void;
  stop(when?: number): void;
}

interface Gain extends AudioNode {
  gain: AudioParam;
}

interface BufferSource extends AudioNode {
  buffer: SampleBuffer | null;
  loop: boolean;
  start(when?: number): void;
  stop(when?: number): void;
}

interface AudioContextLike {
  readonly state: string;
  readonly sampleRate: number;
  readonly currentTime: number;
  readonly destination: AudioNode;
  createGain(): Gain;
  createOscillator(): Oscillator;
  createBufferSource(): BufferSource;
  createBuffer(channels: number, length: number, sampleRate: number): SampleBuffer;
  suspend(): Promise<void> | void;
  resume(): Promise<void> | void;
  close(): Promise<void> | void;
}

const DEFAULT_VOICES = 4;
const DEFAULT_VOLUME = 0.3;
const DEFAULT_SFX_MS = 100;

export function createWebAudio(
  ctx: AudioContextLike,
  opts: WebAudioOptions,
): AudioSink {
  const cap = Math.max(1, opts.voices ?? DEFAULT_VOICES);
  const table = opts.cues;
  const master = ctx.createGain();
  master.gain.value = clamp01(opts.volume ?? DEFAULT_VOLUME);
  master.connect(ctx.destination);

  const sfx: Array<() => void> = [];
  let music: (() => void) | undefined;
  let unlockTarget: WebAudioOptions["unlock"];
  let disposed = false;

  function onUnlock(): void {
    void ctx.resume();
    detachUnlock();
  }

  function detachUnlock(): void {
    if (!unlockTarget) return;
    unlockTarget.removeEventListener("pointerdown", onUnlock);
    unlockTarget.removeEventListener("keydown", onUnlock);
    unlockTarget = undefined;
  }

  if (ctx.state !== "running" && opts.unlock) {
    unlockTarget = opts.unlock;
    unlockTarget.addEventListener("pointerdown", onUnlock);
    unlockTarget.addEventListener("keydown", onUnlock);
  }

  function stopMusic(): void {
    music?.();
    music = undefined;
  }

  function startVoice(def: CueDef, hold: boolean): () => void {
    const gain = ctx.createGain();
    gain.gain.value = clamp01(def.gain);
    gain.connect(master);
    if ("sample" in def) {
      const src = ctx.createBufferSource();
      src.buffer = def.sample;
      src.loop = def.loop ?? hold;
      src.connect(gain);
      src.start(ctx.currentTime);
      return () => {
        try {
          src.stop();
        } catch {
          /* already ended */
        }
        src.disconnect();
        gain.disconnect();
      };
    }
    if (def.wave === "noise") {
      const ms = hold ? 250 : (def.ms ?? DEFAULT_SFX_MS);
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, ms);
      src.loop = hold;
      src.connect(gain);
      src.start(ctx.currentTime);
      if (!hold) src.stop(ctx.currentTime + ms / 1000);
      return () => {
        try {
          src.stop();
        } catch {
          /* already ended */
        }
        src.disconnect();
        gain.disconnect();
      };
    }
    const osc = ctx.createOscillator();
    osc.type = def.wave;
    osc.frequency.value = midiHz(def.note);
    osc.connect(gain);
    osc.start(ctx.currentTime);
    if (!hold) {
      const ms = def.ms ?? DEFAULT_SFX_MS;
      osc.stop(ctx.currentTime + ms / 1000);
    }
    return () => {
      try {
        osc.stop();
      } catch {
        /* already ended */
      }
      osc.disconnect();
      gain.disconnect();
    };
  }

  function addSfx(def: CueDef): void {
    if (sfx.length >= cap) sfx.shift()?.();
    sfx.push(startVoice(def, false));
  }

  return {
    get ready() {
      return ctx.state === "running";
    },
    play(cues: CueQueue) {
      if (disposed) return;
      let next: CueDef | undefined;
      let sawMusic = false;
      for (let i = 0; i < cues.length; i++) {
        const def = table[cues.at(i)];
        if (!def) continue;
        if ((def.lane ?? "sfx") === "music") {
          next = def;
          sawMusic = true;
        } else {
          addSfx(def);
        }
      }
      if (!sawMusic) return;
      stopMusic();
      if (next && next.gain > 0) music = startVoice(next, true);
    },
    suspend() {
      if (!disposed) void ctx.suspend();
    },
    resume() {
      if (!disposed) void ctx.resume();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      detachUnlock();
      stopMusic();
      while (sfx.length > 0) sfx.pop()?.();
      master.disconnect();
      void ctx.close();
    },
  };
}

function midiHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function noiseBuffer(ctx: AudioContextLike, ms: number): SampleBuffer {
  const length = Math.max(1, Math.round((ctx.sampleRate * ms) / 1000));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
