import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogFile, catalogShell, launchArgv, repoOf, type LaunchHave } from "./launch.ts";

const none: LaunchHave = {
  darwin: false,
  setsid: false,
  gnome: false,
  kitty: false,
  ghostty: false,
  ghosttyApp: false,
  xterm: false,
  emulator: false,
  iterm: false,
  osascript: false,
};

const mac = "/Users/farzad/lottiefiles/projects/personal/TinyGM/games/catalog.ts";
const macShell =
  "cd '/Users/farzad/lottiefiles/projects/personal/TinyGM' && node '/Users/farzad/lottiefiles/projects/personal/TinyGM/games/catalog.ts'";

test("catalog path is the repo games entry", () => {
  const root = "/work/tinycell/mods/play";
  const catalog = catalogFile(root);
  assert.equal(catalog, "/work/tinycell/games/catalog.ts");
  assert.equal(repoOf(catalog), "/work/tinycell");
  assert.throws(() => catalogFile("/work/tinycell"), /mods\/play/);
});

test("node is invoked with no type flag", () => {
  assert.equal(
    catalogShell("/Users/farzad/My Games/games/catalog.ts"),
    "cd '/Users/farzad/My Games' && node '/Users/farzad/My Games/games/catalog.ts'",
  );
  assert.equal(catalogShell(mac).includes("--experimental-transform-types"), false);
});

test("tmux split wins, otherwise a detached terminal", () => {
  const catalog = "/work/tinycell/games/catalog.ts";
  assert.deepEqual(launchArgv({ catalog, inTmux: true, have: none }), [
    "tmux",
    "split-window",
    "-h",
    "cd '/work/tinycell' && node '/work/tinycell/games/catalog.ts'",
  ]);
  assert.equal(launchArgv({ catalog, inTmux: false, have: none }), null);
  assert.deepEqual(
    launchArgv({
      catalog,
      inTmux: false,
      have: { ...none, setsid: true, gnome: true, xterm: true },
    })?.slice(0, 5),
    ["setsid", "-f", "gnome-terminal", "--", "node"],
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

test("macOS opens Terminal.app without setsid", () => {
  const argv = launchArgv({
    catalog: mac,
    inTmux: false,
    have: { ...none, darwin: true, osascript: true },
  });
  assert.ok(argv);
  assert.equal(argv[0], "osascript");
  assert.equal(argv.includes("setsid"), false);
  assert.match(argv.join("\n"), /tell application "Terminal"/);
  assert.match(argv.join("\n"), /do script "cd '\/Users\/farzad\/lottiefiles\/projects\/personal\/TinyGM' && node '\/Users\/farzad\/lottiefiles\/projects\/personal\/TinyGM\/games\/catalog.ts'"/);
  assert.equal(argv.join("\n").includes("--experimental-transform-types"), false);
  assert.equal(argv.join("\n").includes(macShell), true);
});

test("macOS uses iTerm when it is installed", () => {
  const argv = launchArgv({
    catalog: mac,
    inTmux: false,
    have: { ...none, darwin: true, osascript: true, iterm: true, kitty: true, setsid: false },
  });
  assert.ok(argv);
  assert.equal(argv[0], "osascript");
  assert.equal(argv.includes("setsid"), false);
  assert.equal(argv.includes("kitty"), false);
  assert.match(argv.join("\n"), /tell application "iTerm2"/);
  assert.match(argv.join("\n"), /write text "/);
  assert.equal(argv.join("\n").includes(macShell), true);
});

test("macOS kitty and Ghostty do not need setsid", () => {
  const kitty = launchArgv({
    catalog: mac,
    inTmux: false,
    have: { ...none, darwin: true, kitty: true, osascript: true },
  });
  assert.deepEqual(kitty, ["kitty", "--detach", "/bin/zsh", "-lc", macShell]);

  const ghosttyApp = launchArgv({
    catalog: mac,
    inTmux: false,
    have: { ...none, darwin: true, ghosttyApp: true, osascript: true },
  });
  assert.deepEqual(ghosttyApp, ["open", "-na", "Ghostty", "--args", "-e", macShell]);

  const ghostty = launchArgv({
    catalog: mac,
    inTmux: false,
    have: { ...none, darwin: true, ghostty: true, osascript: true },
  });
  assert.deepEqual(ghostty, ["ghostty", "-e", macShell]);
});
