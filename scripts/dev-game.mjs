import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const game = process.argv[2];
if (!game) {
  console.error("usage: node scripts/dev-game.mjs <folder>");
  process.exit(1);
}

const gameDir = resolve(repo, "games", game);
const tsc = spawn(
  "npx",
  ["tsc", "-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"],
  { cwd: repo, stdio: ["ignore", "pipe", "inherit"] },
);

let vite;
let buf = "";

tsc.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);
  buf += text;
  if (!buf.includes("Watching for file changes")) return;
  buf = "";
  spawn("node", ["scripts/rewrite-dts.mjs"], { cwd: repo, stdio: "inherit" });
  if (vite) return;
  vite = spawn("npx", ["vite"], { cwd: gameDir, stdio: "inherit" });
  vite.on("exit", (code) => {
    tsc.kill();
    process.exit(code ?? 0);
  });
});

function stop() {
  vite?.kill();
  tsc.kill();
  process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
