import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const hostPath = fileURLToPath(new URL("./host.ts", import.meta.url));
const repo = fileURLToPath(new URL("../../", import.meta.url));

test("the pane host lists games, starts one, and q returns", async () => {
  const home = mkdtempSync(join(tmpdir(), "tinycell-pane-"));
  const keys = join(home, "keys");
  mkdirSync(keys);
  const child = spawn(process.execPath, [hostPath, keys], {
    cwd: repo,
    env: { ...process.env, HOME: home },
  });
  let out = "";
  child.stdout.on("data", (chunk: Buffer) => {
    out += chunk.toString();
  });
  let err = "";
  child.stderr.on("data", (chunk: Buffer) => {
    err += chunk.toString();
  });
  const menu = await waitFor(child, () => frameSize(out), 3000);
  assert.ok(menu, err);
  assert.equal(textOf(out).includes("Battle City"), true);
  assert.equal(textOf(out).includes("q closes"), true);
  writeFileSync(join(keys, "00000001"), "return");
  const playing = await waitFor(child, () => {
    const size = frameSize(out);
    return size && size.columns > menu.columns ? size : null;
  }, 4000);
  assert.ok(playing, err || textOf(out).slice(0, 200));
  assert.equal(readFileSync(join(home, ".tinycell", "last"), "utf8"), "battle-city");
  writeFileSync(join(keys, "00000002"), "q");
  const back = await waitFor(child, () => {
    const size = frameSize(out);
    return size && size.columns === menu.columns ? size : null;
  }, 4000);
  assert.ok(back, err);
  const saved = readFileSync(join(home, ".tinycell", "battle-city"));
  assert.equal(saved[0], 1);
  assert.ok(saved.length > 9);
  writeFileSync(join(keys, "00000003"), "q");
  const code = await new Promise<number | null>((resolve) => {
    child.on("exit", resolve);
  });
  assert.equal(code, 0);
  assert.equal(out.includes("\nQ\n"), true);

  const again = spawn(process.execPath, [hostPath, keys], {
    cwd: repo,
    env: { ...process.env, HOME: home },
  });
  let resumed = "";
  again.stdout.on("data", (chunk: Buffer) => {
    resumed += chunk.toString();
  });
  const direct = await waitFor(again, () => {
    const size = frameSize(resumed);
    return size && size.columns > menu.columns ? size : null;
  }, 4000);
  again.kill();
  assert.ok(direct);
  assert.equal(textOf(resumed).includes("enter play"), false);
});

function frameSize(out: string): { columns: number; rows: number } | null {
  let found: { columns: number; rows: number } | null = null;
  for (const line of out.split("\n")) {
    const match = /^F (\d+) (\d+) /.exec(line);
    if (match) found = { columns: Number(match[1]), rows: Number(match[2]) };
  }
  return found;
}

function textOf(out: string): string {
  const lines = out.trim().split("\n");
  const last = lines.filter((line) => line.startsWith("F ")).at(-1) ?? "";
  const cells = last.split(" ")[3] ?? "";
  const copy = Uint8Array.from(Buffer.from(cells, "base64"));
  const words = new Uint32Array(copy.buffer);
  let text = "";
  for (let i = 0; i < words.length; i += 3) text += String.fromCodePoint(words[i] || 32);
  return text;
}

function waitFor<T>(
  child: { exitCode: number | null },
  read: () => T | null,
  ms: number,
): Promise<T | null> {
  const start = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (child.exitCode !== null) {
        clearInterval(timer);
        resolve(read());
        return;
      }
      const value = read();
      if (value) {
        clearInterval(timer);
        resolve(value);
        return;
      }
      if (Date.now() - start > ms) {
        clearInterval(timer);
        resolve(null);
      }
    }, 30);
  });
}
