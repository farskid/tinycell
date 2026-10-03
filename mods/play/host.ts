// Node host for the /play pane. The hooks sandbox cannot load the games, so
// this process runs the real engine and prints Raster frames on stdout.
// Keys arrive as files in the directory named by argv[2]. No extra terminal.
import { readdirSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { join } from "node:path";
import {
  Color,
  keyEvent,
  Key,
  packCell,
  Surface,
  type InputQueue,
  type InputSource,
  type Painter,
} from "tinycell";
import {
  GAMES,
  menuKey,
  openEngine,
  openTarget,
  type CatalogGame,
} from "../../games/catalog.ts";
import {
  bindFilePersist,
  createFilePersist,
  readLastPlayed,
  tinycellDir,
  writeLastPlayed,
} from "../../games/FilePersist.ts";
import { encodeRaster, isBackKey, type RasterFrame } from "./raster.ts";

const keysDir = process.argv[2];
if (!keysDir) {
  writeSync(2, "tinycell host needs a keys directory\n");
  process.exit(1);
}

class KeyPump implements InputSource {
  private push: ((ev: number) => void) | null = null;

  attach(queue: InputQueue): () => void {
    const push = queue.push.bind(queue);
    this.push = push;
    return () => {
      if (this.push === push) this.push = null;
    };
  }

  send(key: Key): void {
    this.push?.(keyEvent(key));
  }
}

function createBlitPainter(
  cellW: number,
  glyphs: Readonly<Record<number, number>> | undefined,
  emit: (frame: RasterFrame) => void,
): Painter {
  let last = "";
  const size = { w: 512, h: 256 };
  return {
    ready: true,
    size,
    onResize() {},
    resize() {},
    paint(front) {
      const frame = encodeRaster(front, cellW, glyphs);
      if (frame.cells === last) return;
      last = frame.cells;
      emit(frame);
    },
    dispose() {},
  };
}

function emit(frame: RasterFrame): void {
  writeSync(1, `F ${frame.columns} ${frame.rows} ${frame.cells}\n`);
}

function drawMenu(index: number): void {
  const width = 56;
  const height = GAMES.length + 5;
  const surface = new Surface(width, height);
  surface.fill(packCell(0x20, Color.White, Color.Black));
  surface.writeText(0, 0, "tinycell", Color.BrightWhite, Color.Black);
  for (let i = 0; i < GAMES.length; i++) {
    const game = GAMES[i]!;
    const mark = i === index ? ">" : " ";
    const line = `${mark} ${game.title}  ${game.blurb}`.slice(0, width);
    surface.writeText(0, i + 2, line, Color.White, Color.Black);
  }
  surface.writeText(0, height - 2, "enter play    q closes", Color.BrightBlack, Color.Black);
  surface.writeText(0, height - 1, "q in a game returns here", Color.BrightBlack, Color.Black);
  emit(encodeRaster(surface, 1));
}

let mode: "menu" | "game" = "menu";
let index = 0;
let pump = new KeyPump();
let engineStop: (() => void) | null = null;
let busy = false;

function leaveGame(): void {
  const stop = engineStop;
  engineStop = null;
  mode = "menu";
  stop?.();
  drawMenu(index);
}

function quit(): void {
  const stop = engineStop;
  engineStop = null;
  stop?.();
  writeSync(1, "Q\n");
  process.exit(0);
}

function engineKey(token: string): Key | null {
  switch (token) {
    case "up":
      return Key.Up;
    case "down":
      return Key.Down;
    case "left":
      return Key.Left;
    case "right":
      return Key.Right;
    case "return":
    case "enter":
      return Key.Enter;
    case "space":
    case " ":
      return Key.Space;
    case "tab":
      return Key.Tab;
    case "backspace":
      return Key.Backspace;
    default:
      return null;
  }
}

async function enter(game: CatalogGame): Promise<void> {
  writeLastPlayed(game.id);
  const createApp = await game.load();
  const painterOpts = await game.painter();
  const dir = tinycellDir();
  const persist = createFilePersist(join(dir, game.id));
  const saved = persist.readPersistedState();
  pump = new KeyPump();
  const engine = openEngine({
    app: createApp(),
    painter: createBlitPainter(painterOpts.cellW ?? 1, painterOpts.glyphs, emit),
    inputs: [pump],
    tickHz: game.tickHz,
    saved,
  });
  bindFilePersist(engine, persist, { gameId: game.id, dir });
  engineStop = () => engine.stop();
  mode = "game";
  engine.start();
}

function onKey(token: string): void {
  if (isBackKey(token)) {
    if (mode === "game") leaveGame();
    else quit();
    return;
  }
  if (mode === "game") {
    const key = engineKey(token);
    if (key !== null) pump.send(key);
    return;
  }
  const action = menuKey(index, engineKey(token) ?? 0, GAMES.length);
  if (action.kind === "move" && action.index !== index) {
    index = action.index;
    drawMenu(index);
    return;
  }
  if (action.kind === "play") {
    const game = GAMES[action.index];
    if (!game || busy) return;
    busy = true;
    void enter(game).finally(() => {
      busy = false;
    });
  }
}

function drain(): string[] {
  let names: string[] = [];
  try {
    names = readdirSync(keysDir)
      .filter((name) => /^\d+$/.test(name))
      .sort();
  } catch {
    return [];
  }
  const tokens: string[] = [];
  for (const name of names) {
    const path = join(keysDir, name);
    try {
      tokens.push(readFileSync(path, "utf8").trim());
      unlinkSync(path);
    } catch {
      // The writer may still be creating it. The next poll reads it.
    }
  }
  return tokens;
}

drain();

const last = openTarget(readLastPlayed());
const resume = GAMES.find((game) => game.id === last);
if (resume) {
  busy = true;
  void enter(resume).finally(() => {
    busy = false;
  });
} else {
  drawMenu(0);
}

setInterval(() => {
  if (busy && mode !== "game") return;
  for (const token of drain()) onKey(token);
}, 20);
