import { spawn } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const gamePattern = /^[a-z0-9][a-z0-9-]*$/i;

const usage = `usage:
  npm run demo --web --game=<name>
  npm run demo --terminal --game=<name>
  npm run demo -- --web <name>
  npm run demo -- --terminal <name>`;

function fail(message) {
  console.error(message);
  console.error(usage);
  process.exit(1);
}

function npmFlag(name) {
  const value = process.env[`npm_config_${name}`];
  return value === "true" || value === "";
}

function parse() {
  const argv = process.argv.slice(2);
  let platform;
  let game;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--web" || arg === "--terminal") {
      platform = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) game = argv[++i];
      continue;
    }
    if (arg === "--game") {
      game = argv[++i];
      continue;
    }
    if (arg.startsWith("--game=")) {
      game = arg.slice("--game=".length);
      continue;
    }
    if (!arg.startsWith("-") && !game) {
      game = arg;
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }

  if (!platform) {
    if (npmFlag("web")) platform = "web";
    if (npmFlag("terminal")) {
      if (platform) fail("pass one of --web or --terminal");
      platform = "terminal";
    }
  }
  if (!game) game = process.env.npm_config_game;

  if (platform !== "web" && platform !== "terminal") fail("pass --web or --terminal");
  if (!game || !gamePattern.test(game)) fail(`game name must match ${gamePattern}`);
  return { platform, game };
}

function command(platform, game) {
  const dir = join(root, "games", game);
  if (!existsSync(dir)) fail(`no games/${game}`);
  if (platform === "web") {
    const config = join(dir, "vite.config.ts");
    if (!existsSync(config)) fail(`missing ${config}`);
    return { bin: "vite", args: ["--config", config] };
  }
  const entries = readdirSync(dir).filter((name) => name.endsWith("Terminal.ts"));
  if (entries.length !== 1) {
    fail(
      entries.length === 0
        ? `no *Terminal.ts in games/${game}`
        : `expected one *Terminal.ts in games/${game}, found ${entries.join(", ")}`,
    );
  }
  return { bin: "tsx", args: [join(dir, entries[0])] };
}

const { platform, game } = parse();
const { bin, args } = command(platform, game);
const child = spawn(bin, args, { stdio: "inherit", cwd: root });
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
