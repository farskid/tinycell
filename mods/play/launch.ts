export type LaunchHave = {
  setsid: boolean;
  gnome: boolean;
  kitty: boolean;
  xterm: boolean;
  emulator: boolean;
};

export function catalogFile(pluginRoot: string): string {
  const root = pluginRoot.replace(/\/+$/, "");
  const repo = root.replace(/\/mods\/play$/, "");
  if (repo === root) {
    throw new Error("tinycell play mod must live in mods/play");
  }
  return `${repo}/games/catalog.ts`;
}

export function repoOf(catalog: string): string {
  return catalog.replace(/\/games\/catalog\.ts$/, "");
}

function shQuote(text: string): string {
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

export function launchArgv(opts: {
  catalog: string;
  inTmux: boolean;
  have: LaunchHave;
}): readonly string[] | null {
  const node = ["node", "--experimental-transform-types", opts.catalog];
  if (opts.inTmux) {
    return [
      "tmux",
      "split-window",
      "-h",
      `node --experimental-transform-types ${shQuote(opts.catalog)}`,
    ];
  }
  if (!opts.have.setsid) return null;
  if (opts.have.gnome) return ["setsid", "-f", "gnome-terminal", "--", ...node];
  if (opts.have.kitty) return ["setsid", "-f", "kitty", "--detach", ...node];
  if (opts.have.emulator) {
    return ["setsid", "-f", "x-terminal-emulator", "-e", ...node];
  }
  if (opts.have.xterm) return ["setsid", "-f", "xterm", "-e", ...node];
  return null;
}
