import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function capture(cmd, args) {
  return execFileSync(cmd, args, { cwd: root, encoding: "utf8" }).trim();
}

function run(cmd, args) {
  execFileSync(cmd, args, { cwd: root, stdio: "inherit" });
}

function exists(cmd, args) {
  try {
    capture(cmd, args);
    return true;
  } catch {
    return false;
  }
}

const dirty = capture("git", ["status", "--porcelain"]);
if (dirty) {
  console.error("Working tree is dirty. Commit before releasing.");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const { name, version } = pkg;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Refusing version ${version}.`);
  process.exit(1);
}

const tag = `v${version}`;
const head = capture("git", ["rev-parse", "HEAD"]);
const tagged = exists("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`])
  ? capture("git", ["rev-parse", `${tag}^{}`])
  : "";

if (tagged && tagged !== head) {
  console.error(`${tag} already points at ${tagged.slice(0, 7)}, not HEAD. Bump the version first.`);
  process.exit(1);
}

if (!tagged) run("git", ["tag", "-a", tag, "-m", `${name} ${version}`]);

run("git", ["push", "origin", "HEAD"]);
run("git", ["push", "origin", tag]);

if (!exists("gh", ["release", "view", tag])) {
  run("gh", ["release", "create", tag, "--title", tag, "--generate-notes"]);
}

const onNpm = exists("npm", ["view", `${name}@${version}`, "version"]);
if (onNpm) {
  console.log(`${name}@${version} is already on npm.`);
} else {
  run("npm", ["publish"]);
}
