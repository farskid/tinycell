import type { On } from "claude-code";
import { catalogFile, launchArgv, repoOf, type LaunchHave } from "../launch.js";

export function register(on: On): void {
  on("session.start", async ($, e, next) => {
    const result = await next(e);
    try {
      await $.command.register({
        name: "play",
        description: "Play a tinycell demo while you wait",
        immediate: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      $.ui.log(`tinycell: /play was not registered (${message})`, {
        to: "debug",
      });
    }
    return result;
  });

  on("command.run", { command: "play" }, async ($) => {
    const catalog = catalogFile($.plugin.root);
    const cwd = repoOf(catalog);
    const inTmux = Boolean(await $.env.get("TMUX"));
    const have: LaunchHave = {
      setsid: await which($, "setsid"),
      gnome: await which($, "gnome-terminal"),
      kitty: await which($, "kitty"),
      xterm: await which($, "xterm"),
      emulator: await which($, "x-terminal-emulator"),
    };
    const argv = launchArgv({ catalog, inTmux, have });
    if (!argv) {
      return { text: manual(catalog) };
    }
    const run = await $.process.run(argv, { cwd, timeoutMs: 15_000 });
    if (run.exitCode !== 0) {
      const err = run.stderr.trim() || `exit ${run.exitCode}`;
      return { text: `${manual(catalog)} (${err})` };
    }
    return {
      text: inTmux
        ? "tinycell is in the other pane. ctrl-c returns to the game list."
        : "tinycell opened in a new terminal. ctrl-c returns to the game list.",
    };
  });
}

function manual(catalog: string): string {
  return `Open another terminal and run: node --experimental-transform-types ${catalog}`;
}

async function which(
  $: {
    process: {
      run: (
        argv: readonly string[],
        init?: { timeoutMs?: number },
      ) => Promise<{ exitCode: number }>;
    };
  },
  name: string,
): Promise<boolean> {
  try {
    const run = await $.process.run(["which", name], { timeoutMs: 5_000 });
    return run.exitCode === 0;
  } catch {
    return false;
  }
}
