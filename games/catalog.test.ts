import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createEngine,
  keyEvent,
  Key,
  type InputSource,
  type Painter,
} from "tinycell";
import { createTetrisApp } from "./tetris/Tetris.ts";
import {
  bindFilePersist,
  createFilePersist,
  readLastPlayed,
  writeLastPlayed,
} from "./FilePersist.ts";
import { GAMES, menuKey, openEngine, openTarget } from "./catalog.ts";

function fakePainter(): Painter {
  return {
    ready: true,
    size: { w: 80, h: 40 },
    onResize() {},
    resize() {},
    paint() {},
    dispose() {},
  };
}

test("first open lists games; a known last id opens that game", () => {
  assert.equal(openTarget(null), null);
  assert.equal(openTarget("nope"), null);
  assert.equal(openTarget("tetris"), "tetris");
  assert.deepEqual(
    GAMES.map((game) => game.id),
    ["battle-city", "invaders", "snake", "2048", "flappy", "tetris", "contra"],
  );
});

test("menu keys move, play, and quit", () => {
  const down = menuKey(0, Key.Down, 7);
  const up = menuKey(0, Key.Up, 7);
  const wrap = menuKey(6, Key.Down, 7);
  assert.equal(down.kind, "move");
  assert.equal(up.kind, "move");
  assert.equal(wrap.kind, "move");
  if (down.kind === "move") assert.equal(down.index, 1);
  if (up.kind === "move") assert.equal(up.index, 6);
  if (wrap.kind === "move") assert.equal(wrap.index, 0);
  assert.deepEqual(menuKey(3, Key.Enter, 7), { kind: "play", index: 3 });
  assert.equal(menuKey(3, Key.CtrlC, 7).kind, "quit");
  assert.equal(menuKey(3, Key.Space, 7).kind, "ignore");
});

test("last id and a game snapshot share the tinycell directory", () => {
  const dir = mkdtempSync(join(tmpdir(), "tinycell-"));
  try {
    assert.equal(readLastPlayed(dir), null);
    writeLastPlayed("tetris", dir);
    assert.equal(readLastPlayed(dir), "tetris");
    writeLastPlayed("  snake\n", dir);
    assert.equal(readLastPlayed(dir), "snake");

    const persist = createFilePersist(join(dir, "tetris"));
    let stops = 0;
    const engine = createEngine({
      app: createTetrisApp(),
      painter: fakePainter(),
      tickHz: 20,
    });
    bindFilePersist(engine, persist, {
      gameId: "tetris",
      dir,
      onStop() {
        stops++;
      },
    });
    engine.stop();
    engine.stop();
    assert.equal(stops, 1);
    assert.equal(readLastPlayed(dir), "tetris");
    const saved = persist.readPersistedState();
    assert.ok(saved);
    assert.equal(saved[0], 1);
    assert.ok(saved.length > 9);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resume restores a mid-game snapshot and a bad blob starts fresh", () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"] });
  try {
    const source: InputSource = {
      attach(queue) {
        queue.push(keyEvent(Key.Left));
        return () => {};
      },
    };
    const live = openEngine({
      app: createTetrisApp(),
      painter: fakePainter(),
      inputs: [source],
      tickHz: 20,
      saved: null,
    });
    live.start();
    mock.timers.tick(100);
    const blob = live.snapshot();
    live.stop();

    const fresh = openEngine({
      app: createTetrisApp(),
      painter: fakePainter(),
      tickHz: 20,
      saved: null,
    });
    assert.notDeepEqual(fresh.snapshot(), blob);
    fresh.stop();

    const restored = openEngine({
      app: createTetrisApp(),
      painter: fakePainter(),
      tickHz: 20,
      saved: blob,
    });
    assert.deepEqual(restored.snapshot(), blob);
    assert.equal(restored.tick, live.tick);
    restored.stop();

    const bad = new Uint8Array(9);
    bad[0] = 2;
    const again = openEngine({
      app: createTetrisApp(),
      painter: fakePainter(),
      tickHz: 20,
      saved: bad,
    });
    assert.equal(again.tick, 0);
    assert.notDeepEqual(again.snapshot(), blob);
    again.stop();
  } finally {
    mock.timers.reset();
  }
});

const catalogPath = fileURLToPath(new URL("./catalog.ts", import.meta.url));

function runPty(home: string, mode: "list" | "resume"): Promise<void> {
  const py = `
import os, pty, select, time, sys
catalog, mode = sys.argv[1], sys.argv[2]

def pull(fd, buf, needle, timeout, start):
    end = time.time() + timeout
    while needle not in buf[start:]:
        if time.time() > end:
            tail = buf[start:].decode("utf-8", "replace")[-800:]
            raise SystemExit("timeout waiting for %r\\n%s" % (needle, tail))
        ready, _, _ = select.select([fd], [], [], 0.2)
        if not ready:
            continue
        try:
            chunk = os.read(fd, 8192)
        except OSError:
            break
        if not chunk:
            break
        buf += chunk
    return buf

pid, fd = pty.fork()
if pid == 0:
    os.environ["HOME"] = os.environ["TINYCELL_HOME"]
    os.environ["TERM"] = "xterm-256color"
    os.execvp("node", ["node", "--experimental-transform-types", catalog])

buf = b""
try:
    if mode == "list":
        buf = pull(fd, buf, b"enter play", 20, 0)
        if b"Battle City" not in buf or b"Tetris" not in buf:
            raise SystemExit("catalog did not list the games")
        mark = len(buf)
        os.write(fd, b"\\r")
        buf = pull(fd, buf, b"\\x1b[?1049h", 20, mark)
        os.write(fd, b"\\x03")
        buf = pull(fd, buf, b"enter play", 20, len(buf))
        os.write(fd, b"\\x03")
    else:
        buf = pull(fd, buf, b"\\x1b[?1049h", 20, 0)
        if b"enter play" in buf.split(b"\\x1b[?1049h", 1)[0]:
            raise SystemExit("resume open showed the catalog")
        os.write(fd, b"\\x03")
        buf = pull(fd, buf, b"enter play", 20, len(buf))
        os.write(fd, b"\\x03")
    deadline = time.time() + 5
    while time.time() < deadline:
        wpid, _ = os.waitpid(pid, os.WNOHANG)
        if wpid != 0:
            break
        time.sleep(0.05)
    else:
        os.kill(pid, 15)
        os.waitpid(pid, 0)
        raise SystemExit("catalog did not exit")
except BaseException:
    try:
        os.kill(pid, 15)
        os.waitpid(pid, 0)
    except OSError:
        pass
    raise
`;
  return new Promise((resolve, reject) => {
    const child = spawn("python3", ["-c", py, catalogPath, mode], {
      env: { ...process.env, TINYCELL_HOME: home },
    });
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err || `pty driver exited ${code}`));
    });
  });
}

test("catalog lists games, starts one, and the next open resumes it", async () => {
  const home = mkdtempSync(join(tmpdir(), "tinycell-home-"));
  try {
    await runPty(home, "list");
    const root = join(home, ".tinycell");
    assert.equal(readFileSync(join(root, "last"), "utf8"), "battle-city");
    const saved = readFileSync(join(root, "battle-city"));
    assert.equal(saved[0], 1);
    assert.ok(saved.length > 9);
    await runPty(home, "resume");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
