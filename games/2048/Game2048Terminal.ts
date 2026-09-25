import { homedir } from "node:os";
import { join } from "node:path";
import { createEngine } from "tinycell";
import { createANSIPainter, createTTY } from "tinycell/terminal";
import { bindFilePersist, createFilePersist } from "../FilePersist.ts";
import { createGame2048App } from "./Game2048.ts";

const persist = createFilePersist(join(homedir(), ".tinycell", "2048"));
const opts = {
  app: createGame2048App(),
  painter: createANSIPainter(process.stdout, { cellW: 2 }),
  inputs: [createTTY(process.stdin)],
  tickHz: 60,
};
const saved = persist.readPersistedState();
let engine;
try {
  engine = createEngine(saved ? { ...opts, resume: saved } : opts);
} catch {
  engine = createEngine(opts);
}
bindFilePersist(engine, persist);
engine.start();
