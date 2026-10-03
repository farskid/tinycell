import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appleString,
  catalogFile,
  catalogShell,
  launchArgv,
  repoOf,
  terminalAppArgv,
  terminalFallback,
  type LaunchHave,
} from "./launch.ts";

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

const terminalScript = [
  `tell application "Terminal" to do script "${macShell}"`,
  'tell application "Terminal" to activate',
].join("\n");

const itermScript = [
  'tell application "iTerm2"',
  "activate",
  "create window with default profile",
  "tell current session of current window",
  `write text "${macShell}"`,
  "end tell",
  "end tell",
].join("\n");

test("macOS opens Terminal.app without setsid", () => {
  const argv = launchArgv({
    catalog: mac,
    inTmux: false,
    have: { ...none, darwin: true, osascript: true },
  });
  assert.deepEqual(argv, ["osascript", "-e", terminalScript]);
  assert.equal(argv.join("\n").includes("--experimental-transform-types"), false);
  assert.equal(argv.join("\n").includes("setsid"), false);
  assert.equal(appleScriptLiteralsClosed(terminalScript), true);
});

test("macOS uses iTerm when it is installed", () => {
  const argv = launchArgv({
    catalog: mac,
    inTmux: false,
    have: { ...none, darwin: true, osascript: true, iterm: true, kitty: true, setsid: false },
  });
  assert.deepEqual(argv, ["osascript", "-e", itermScript]);
  assert.equal(itermScript.includes("(create window"), false);
  assert.equal(itermScript.includes(" command "), false);
  assert.equal(appleScriptLiteralsClosed(itermScript), true);
});

test("AppleScript escapes quotes, backslashes, and newlines", () => {
  const catalog = "/tmp/a\"b\\c\n/games/catalog.ts";
  const expression = appleString(catalogShell(catalog));
  assert.equal(
    expression,
    `"cd '/tmp/a\\"b\\\\c" & linefeed & "' && node '/tmp/a\\"b\\\\c" & linefeed & "/games/catalog.ts'"`,
  );
  const argv = terminalAppArgv(catalog);
  const script = argv[2] ?? "";
  assert.equal(script.startsWith("tell application \"Terminal\" to do script "), true);
  assert.equal(script.endsWith('tell application "Terminal" to activate'), true);
  assert.equal(appleScriptLiteralsClosed(script), true);
  assert.equal(script.includes("\n\""), false);
});

test("an iTerm compile error falls through to Terminal.app", () => {
  const iterm = launchArgv({
    catalog: mac,
    inTmux: false,
    have: { ...none, darwin: true, osascript: true, iterm: true },
  });
  assert.ok(iterm);
  const err = '60:66: syntax error: Expected "," but found class name. (-2741)';
  assert.deepEqual(terminalFallback(iterm, err, mac), ["osascript", "-e", terminalScript]);
  assert.equal(terminalFallback(iterm, "Connection is invalid. (-609)", mac), null);
  assert.equal(terminalFallback(["osascript", "-e", terminalScript], err, mac), null);
  const kitty = launchArgv({
    catalog: mac,
    inTmux: false,
    have: { ...none, darwin: true, kitty: true, osascript: true },
  });
  assert.ok(kitty);
  assert.equal(terminalFallback(kitty, err, mac), null);
});

function appleScriptLiteralsClosed(script: string): boolean {
  let inString = false;
  for (let i = 0; i < script.length; i++) {
    const c = script[i];
    if (inString && c === "\n") return false;
    if (inString && c === "\\") {
      i += 1;
      continue;
    }
    if (c === '"') inString = !inString;
  }
  return !inString;
}

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
