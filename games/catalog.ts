// Terminal catalog for the demo games. The first launch lists them. Later
// launches open the last game. Ctrl-C leaves a game for this list. Progress
// is the usual ~/.tinycell snapshot; the last id sits beside those files.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createEngine,
  InputQueue,
  Key,
  keyOf,
  type App,
  type Engine,
  type InputSource,
  type Painter,
} from "tinycell";
import {
  createANSIPainter,
  createTTY,
  type ANSIPainterOptions,
} from "tinycell/terminal";
import {
  bindFilePersist,
  createFilePersist,
  readLastPlayed,
  tinycellDir,
  writeLastPlayed,
} from "./FilePersist.ts";

export type CatalogGame = {
  id: string;
  title: string;
  blurb: string;
  tickHz: number;
  load: () => Promise<() => App>;
  painter: () => Promise<ANSIPainterOptions>;
};

const square = (): Promise<ANSIPainterOptions> => Promise.resolve({ cellW: 2 });

export const GAMES: readonly CatalogGame[] = [
  {
    id: "battle-city",
    title: "Battle City",
    blurb: "enter starts, arrows drive, space fires",
    tickHz: 20,
    load: () =>
      import("./battle-city/BattleCity.ts").then((m) => m.createBattleCityApp),
    painter: () =>
      import("./battle-city/glyphs.ts").then((m) => ({
        cellW: 2,
        glyphs: m.tankGlyphs(),
      })),
  },
  {
    id: "invaders",
    title: "Invaders",
    blurb: "enter starts, arrows move, space fires",
    tickHz: 30,
    load: () =>
      import("./space-invaders/SpaceInvaders.ts").then(
        (m) => m.createSpaceInvadersApp,
      ),
    painter: square,
  },
  {
    id: "snake",
    title: "Snake",
    blurb: "arrows start",
    tickHz: 40,
    load: () => import("./snake/Snake.ts").then((m) => m.createSnakeApp),
    painter: square,
  },
  {
    id: "2048",
    title: "2048",
    blurb: "arrows slide, enter retries",
    tickHz: 60,
    load: () => import("./2048/Game2048.ts").then((m) => m.createGame2048App),
    painter: square,
  },
  {
    id: "flappy",
    title: "Flappy",
    blurb: "space flaps",
    tickHz: 30,
    load: () => import("./flappy/Flappy.ts").then((m) => m.createFlappyApp),
    painter: square,
  },
  {
    id: "tetris",
    title: "Tetris",
    blurb: "arrows move, up rotates, space drops",
    tickHz: 20,
    load: () => import("./tetris/Tetris.ts").then((m) => m.createTetrisApp),
    painter: square,
  },
  {
    id: "contra",
    title: "Contra",
    blurb: "arrows move, space fires",
    tickHz: 30,
    load: () => import("./contra/Contra.ts").then((m) => m.createContraApp),
    painter: square,
  },
];

export function openTarget(
  last: string | null,
  games: readonly { id: string }[] = GAMES,
): string | null {
  if (last !== null && games.some((game) => game.id === last)) return last;
  return null;
}

export type MenuAction =
  | { kind: "move"; index: number }
  | { kind: "play"; index: number }
  | { kind: "quit" }
  | { kind: "ignore"; index: number };

export function menuKey(
  index: number,
  key: Key | 0,
  count: number,
): MenuAction {
  if (count < 1) return { kind: "quit" };
  if (key === Key.CtrlC) return { kind: "quit" };
  if (key === Key.Enter) return { kind: "play", index };
  if (key === Key.Up) return { kind: "move", index: (index + count - 1) % count };
  if (key === Key.Down) return { kind: "move", index: (index + 1) % count };
  return { kind: "ignore", index };
}

export function openEngine(opts: {
  app: App;
  painter: Painter;
  inputs?: InputSource[];
  tickHz: number;
  saved: Uint8Array | null;
}): Engine {
  const base = {
    app: opts.app,
    painter: opts.painter,
    inputs: opts.inputs,
    tickHz: opts.tickHz,
  };
  if (!opts.saved) return createEngine(base);
  try {
    return createEngine({ ...base, resume: opts.saved });
  } catch {
    return createEngine(base);
  }
}

// Ctrl-C leaves the game for the catalog. The games that already stop on
// Ctrl-C never see it. Battle City does not handle it, so the host has to.
function stopOnCtrlC(source: InputSource, stop: () => void): InputSource {
  return {
    attach(queue) {
      const push = queue.push.bind(queue);
      queue.push = (ev: number) => {
        if (keyOf(ev) === Key.CtrlC) {
          stop();
          return;
        }
        push(ev);
      };
      return source.attach(queue);
    },
  };
}

const HIDE = "\x1b[?25l";
const CLEAR = "\x1b[2J\x1b[H";

function drawMenu(games: readonly CatalogGame[], index: number): void {
  const lines = [
    "tinycell",
    "",
    ...games.map((game, i) => {
      const mark = i === index ? ">" : " ";
      return `${mark} ${game.title}  ${game.blurb}`;
    }),
    "",
    "enter play    ctrl-c quit",
    "ctrl-c in a game returns here",
  ];
  process.stdout.write(HIDE + CLEAR + lines.join("\n") + "\n");
}

function pickGame(games: readonly CatalogGame[]): Promise<string | null> {
  return new Promise((resolve) => {
    let index = 0;
    const queue = new InputQueue();
    const detach = createTTY(process.stdin).attach(queue);
    drawMenu(games, index);
    const timer = setInterval(() => {
      let redraw = false;
      for (let i = 0; i < queue.length; i++) {
        const action = menuKey(index, keyOf(queue.at(i)), games.length);
        if (action.kind === "quit" || action.kind === "play") {
          clearInterval(timer);
          detach();
          resolve(action.kind === "play" ? games[action.index]!.id : null);
          return;
        }
        if (action.kind === "move" && action.index !== index) {
          index = action.index;
          redraw = true;
        }
      }
      queue.clear();
      if (redraw) drawMenu(games, index);
    }, 30);
  });
}

async function playGame(game: CatalogGame, dir: string): Promise<void> {
  writeLastPlayed(game.id, dir);
  const createApp = await game.load();
  const painterOpts = await game.painter();
  const persist = createFilePersist(join(dir, game.id));
  const saved = persist.readPersistedState();
  const held: { engine?: Engine } = {};
  const engine = openEngine({
    app: createApp(),
    painter: createANSIPainter(process.stdout, painterOpts),
    inputs: [stopOnCtrlC(createTTY(process.stdin), () => held.engine?.stop())],
    tickHz: game.tickHz,
    saved,
  });
  held.engine = engine;
  await new Promise<void>((resolve) => {
    bindFilePersist(engine, persist, {
      gameId: game.id,
      dir,
      onStop: () => resolve(),
    });
    engine.start();
  });
}

async function main(): Promise<void> {
  if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
    process.stderr.write("tinycell catalog needs a terminal\n");
    process.exitCode = 1;
    return;
  }
  const dir = tinycellDir();
  let direct = openTarget(readLastPlayed(dir));
  try {
    for (;;) {
      const id = direct ?? (await pickGame(GAMES));
      direct = null;
      if (id === null) return;
      const game = GAMES.find((item) => item.id === id);
      if (!game) return;
      await playGame(game, dir);
    }
  } finally {
    process.stdout.write("\x1b[?25h\x1b[0m\x1b[2J\x1b[H");
  }
}

function launchedDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (launchedDirectly()) {
  main().catch((err: unknown) => {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exitCode = 1;
  });
}
