import type { On } from "claude-code";
import { catalogFile, launchArgv, repoOf, type LaunchHave } from "../launch.js";

export function register(on: On): void {
  // commands/play.md is what the slash menu lists at plugin load. Registering
  // here marks that same name immediate, so it runs during a turn. A failure
  // is a transcript line: the debug log is not where a missing /play shows up.
  on("session.start", async ($, e, next) => {
    const result = await next(e);
    await $.command.register({
      name: "play",
      description: "Play a tinycell demo while you wait",
      immediate: true,
    });
    $.ui.invalidate("command.describe");
    return result;
  }).catch(($, _e, next) => {
    report($, `play failed to start (${next.error.message ?? next.error.kind})`);
  });

  on("command.run", async ($, e, next) => {
    if (!isPlay(e.command)) return next(e);
    const catalog = catalogFile($.plugin.root);
    const cwd = repoOf(catalog);
    const inTmux = Boolean(await $.env.get("TMUX"));
    const darwin = (await uname($)) === "Darwin";
    const home = (await $.env.get("HOME")) ?? "";
    const have: LaunchHave = {
      darwin,
      setsid: await which($, "setsid"),
      gnome: await which($, "gnome-terminal"),
      kitty: await which($, "kitty"),
      ghostty: await which($, "ghostty"),
      ghosttyApp: darwin && (await appExists($, "Ghostty.app", home)),
      xterm: await which($, "xterm"),
      emulator: await which($, "x-terminal-emulator"),
      iterm: darwin && (await appExists($, "iTerm.app", home)),
      osascript: (await which($, "osascript")) || (await isExec($, "/usr/bin/osascript")),
    };
    const argv = launchArgv({ catalog, inTmux, have });
    if (!argv) {
      return { text: manual(catalog) };
    }
    const run = await $.process.run(argv, { cwd, timeoutMs: 15_000 });
    if (run.exitCode !== 0) {
      const err = run.stderr.trim() || run.stdout.trim() || `exit ${run.exitCode}`;
      return { text: `tinycell could not open a terminal: ${err}` };
    }
    return {
      text: inTmux
        ? "tinycell is in the other pane. ctrl-c returns to the game list."
        : "tinycell opened in a new terminal. ctrl-c returns to the game list.",
    };
  });
}

function isPlay(command: string): boolean {
  return command === "play" || command.endsWith(":play");
}

function report(
  $: { ui: { log(text: string): void; toast(text: string): void } },
  message: string,
): void {
  const line = `tinycell: ${message}`;
  $.ui.log(line);
  $.ui.toast(line);
}

function manual(catalog: string): string {
  return `Open another terminal and run: node ${catalog}`;
}

type Proc = {
  process: {
    run: (
      argv: readonly string[],
      init?: { timeoutMs?: number },
    ) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  };
};

async function which($: Proc, name: string): Promise<boolean> {
  try {
    const run = await $.process.run(["which", name], { timeoutMs: 5_000 });
    return run.exitCode === 0;
  } catch {
    return false;
  }
}

async function isExec($: Proc, path: string): Promise<boolean> {
  try {
    const run = await $.process.run(["test", "-x", path], { timeoutMs: 5_000 });
    return run.exitCode === 0;
  } catch {
    return false;
  }
}

async function appExists($: Proc, bundle: string, home: string): Promise<boolean> {
  const paths = [`/Applications/${bundle}`];
  if (home !== "") paths.push(`${home}/Applications/${bundle}`);
  for (const path of paths) {
    try {
      const run = await $.process.run(["test", "-d", path], { timeoutMs: 5_000 });
      if (run.exitCode === 0) return true;
    } catch {
      // The next candidate is the only other place the app is installed.
    }
  }
  return false;
}

async function uname($: Proc): Promise<string> {
  try {
    const run = await $.process.run(["uname", "-s"], { timeoutMs: 5_000 });
    return run.exitCode === 0 ? run.stdout.trim() : "";
  } catch {
    return "";
  }
}
