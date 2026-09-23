import { homedir } from "node:os";
import { join } from "node:path";
import { createEngine } from "../../src/engine.ts";
import { createANSIPainter } from "../../src/ANSIPainter.ts";
import { createTTY } from "../../src/TTY.ts";
import { bindFilePersist, createFilePersist } from "../FilePersist.ts";
import { createSpaceInvadersApp } from "./SpaceInvaders.ts";

const persist = createFilePersist(join(homedir(), ".tinygm", "invaders"));
const opts = {
  app: createSpaceInvadersApp(),
  painter: createANSIPainter(process.stdout, { cellW: 2 }),
  inputs: [createTTY(process.stdin)],
  tickHz: 30,
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
