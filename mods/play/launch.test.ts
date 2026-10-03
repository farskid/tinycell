import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogFile, launchArgv, repoOf, type LaunchHave } from "./launch.ts";

const none: LaunchHave = {
  setsid: false,
  gnome: false,
  kitty: false,
  xterm: false,
  emulator: false,
};

test("catalog path is the repo games entry", () => {
  const root = "/work/tinycell/mods/play";
  const catalog = catalogFile(root);
  assert.equal(catalog, "/work/tinycell/games/catalog.ts");
  assert.equal(repoOf(catalog), "/work/tinycell");
  assert.throws(() => catalogFile("/work/tinycell"), /mods\/play/);
});

test("tmux split wins, otherwise a detached terminal", () => {
  const catalog = "/work/tinycell/games/catalog.ts";
  assert.deepEqual(
    launchArgv({ catalog, inTmux: true, have: none }),
    [
      "tmux",
      "split-window",
      "-h",
      "node --experimental-transform-types '/work/tinycell/games/catalog.ts'",
    ],
  );
  assert.equal(
    launchArgv({ catalog, inTmux: false, have: none }),
    null,
  );
  assert.deepEqual(
    launchArgv({
      catalog,
      inTmux: false,
      have: { ...none, setsid: true, gnome: true, xterm: true },
    })?.slice(0, 4),
    ["setsid", "-f", "gnome-terminal", "--"],
  );
  assert.equal(
    launchArgv({
      catalog,
      inTmux: false,
      have: { ...none, setsid: true, kitty: true },
    })?.[2],
    "kitty",
  );
});
