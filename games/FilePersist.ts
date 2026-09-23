import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Engine } from "../src/engine.ts";

export function createFilePersist(path: string) {
  return {
    writePersistedState(bytes: Uint8Array): void {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
    },
    readPersistedState(): Uint8Array | null {
      try {
        return new Uint8Array(readFileSync(path));
      } catch {
        return null;
      }
    },
  };
}

export function bindFilePersist(
  engine: Engine,
  persist: { writePersistedState(bytes: Uint8Array): void },
): void {
  const stop = engine.stop.bind(engine);
  engine.stop = () => {
    try {
      persist.writePersistedState(engine.snapshot());
    } finally {
      stop();
    }
  };
}
