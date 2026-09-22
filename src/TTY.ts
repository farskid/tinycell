// Raw-mode stdin parser. The only module that reads stdin or sets terminal mode.
// No SIGINT handler and no process.exit. Ctrl-C arrives as byte 0x03 because
// setRawMode(true) clears ISIG.
import type { ReadStream } from "node:tty";
import { charEvent, keyEvent, Key, type InputQueue, type InputSource } from "./engine.ts";

interface TtyStream {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode(mode: boolean): void;
  on(event: "data", listener: (chunk: Uint8Array | string) => void): void;
  off(event: "data", listener: (chunk: Uint8Array | string) => void): void;
  pause?(): void;
  resume?(): void;
}

const GROUND = 0;
const ESCAPE = 1;
const CSI = 2;
const SS3 = 3;
const ESC_TIMEOUT_MS = 10;

export function createTTY(stream: ReadStream): InputSource;
export function createTTY(stream: TtyStream): InputSource;
export function createTTY(stream: ReadStream | TtyStream): InputSource {
  const input = stream as TtyStream;
  if (input.isTTY !== true) throw new Error("createTTY requires a TTY stream");

  let activeDetach: (() => void) | null = null;

  return {
    attach(queue: InputQueue): () => void {
      activeDetach?.();

      const wasRaw = input.isRaw === true;
      input.setRawMode(true);
      input.resume?.();

      let state = GROUND;
      let csiArgs = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let done = false;

      function clearTimer(): void {
        if (timer === undefined) return;
        clearTimeout(timer);
        timer = undefined;
      }

      function armEscape(): void {
        clearTimer();
        timer = setTimeout(() => {
          timer = undefined;
          if (done || state !== ESCAPE) return;
          state = GROUND;
          queue.push(keyEvent(Key.Escape));
        }, ESC_TIMEOUT_MS);
      }

      function emitArrow(finalByte: number): void {
        if (finalByte === 0x41) queue.push(keyEvent(Key.Up));
        else if (finalByte === 0x42) queue.push(keyEvent(Key.Down));
        else if (finalByte === 0x43) queue.push(keyEvent(Key.Right));
        else if (finalByte === 0x44) queue.push(keyEvent(Key.Left));
      }

      function ground(b: number): void {
        if (b === 0x1b) {
          state = ESCAPE;
          armEscape();
          return;
        }
        if (b === 0x03) {
          queue.push(keyEvent(Key.CtrlC));
          return;
        }
        if (b === 0x0d || b === 0x0a) {
          queue.push(keyEvent(Key.Enter));
          return;
        }
        if (b === 0x09) {
          queue.push(keyEvent(Key.Tab));
          return;
        }
        if (b === 0x7f || b === 0x08) {
          queue.push(keyEvent(Key.Backspace));
          return;
        }
        if (b === 0x20) {
          queue.push(keyEvent(Key.Space));
          return;
        }
        if (b >= 0x21 && b <= 0x7e) queue.push(charEvent(b));
      }

      function parseByte(b: number): void {
        if (state === GROUND) {
          ground(b);
          return;
        }
        if (state === ESCAPE) {
          clearTimer();
          if (b === 0x5b) {
            state = CSI;
            csiArgs = false;
            return;
          }
          if (b === 0x4f) {
            state = SS3;
            return;
          }
          state = GROUND;
          ground(b);
          return;
        }
        if (state === CSI) {
          if (b >= 0x40 && b <= 0x7e) {
            const simple = !csiArgs;
            state = GROUND;
            csiArgs = false;
            if (simple) emitArrow(b);
            return;
          }
          if (b >= 0x20 && b <= 0x3f) {
            csiArgs = true;
            return;
          }
          state = GROUND;
          csiArgs = false;
          ground(b);
          return;
        }
        if (b >= 0x40 && b <= 0x7e) {
          state = GROUND;
          emitArrow(b);
          return;
        }
        state = GROUND;
        ground(b);
      }

      function onData(chunk: Uint8Array | string): void {
        if (done) return;
        if (typeof chunk === "string") {
          for (let i = 0; i < chunk.length; i++) parseByte(chunk.charCodeAt(i) & 0xff);
          return;
        }
        for (let i = 0; i < chunk.length; i++) parseByte(chunk[i]!);
      }

      input.on("data", onData);

      const detach = (): void => {
        if (done) return;
        done = true;
        if (activeDetach === detach) activeDetach = null;
        clearTimer();
        state = GROUND;
        input.off("data", onData);
        input.pause?.();
        input.setRawMode(wasRaw);
      };
      activeDetach = detach;
      return detach;
    },
  };
}
