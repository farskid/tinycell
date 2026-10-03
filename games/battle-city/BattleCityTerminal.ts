import { homedir } from "node:os";
import { join } from "node:path";
import { createEngine } from "tinycell";
import { createANSIPainter, createTTY } from "tinycell/terminal";
import { bindFilePersist, createFilePersist } from "../FilePersist.ts";
import { createBattleCityApp } from "./BattleCity.ts";
import { tankGlyphs } from "./glyphs.ts";

const persist = createFilePersist(join(homedir(), ".tinycell", "battle-city"));
const opts = {
  app: createBattleCityApp(),
  painter: createANSIPainter(process.stdout, { cellW: 2, glyphs: tankGlyphs() }),
  inputs: [createTTY(process.stdin)],
  tickHz: 20,
};
const saved = persist.readPersistedState();
let engine;
try {
  engine = createEngine(saved ? { ...opts, resume: saved } : opts);
} catch {
  engine = createEngine(opts);
}
bindFilePersist(engine, persist, { gameId: "battle-city" });
engine.start();
