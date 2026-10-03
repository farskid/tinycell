import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Engine } from "tinycell";

const LAST_FILE = "last";

export function tinycellDir(): string {
  return join(homedir(), ".tinycell");
}

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

export function readLastPlayed(dir = tinycellDir()): string | null {
  const bytes = createFilePersist(join(dir, LAST_FILE)).readPersistedState();
  if (!bytes || bytes.length === 0) return null;
  const id = new TextDecoder().decode(bytes).trim();
  return id === "" ? null : id;
}

export function writeLastPlayed(id: string, dir = tinycellDir()): void {
  if (id === "") return;
  createFilePersist(join(dir, LAST_FILE)).writePersistedState(
    new TextEncoder().encode(id),
  );
}

export function bindFilePersist(
  engine: Engine,
  persist: { writePersistedState(bytes: Uint8Array): void },
  opts?: { gameId?: string; dir?: string; onStop?: () => void },
): void {
  const stop = engine.stop.bind(engine);
  let stopped = false;
  engine.stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      persist.writePersistedState(engine.snapshot());
      if (opts?.gameId) writeLastPlayed(opts.gameId, opts.dir);
    } finally {
      stop();
      opts?.onStop?.();
    }
  };
}
