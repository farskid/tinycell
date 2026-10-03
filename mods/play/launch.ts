export type LaunchHave = {
  darwin: boolean;
  setsid: boolean;
  gnome: boolean;
  kitty: boolean;
  ghostty: boolean;
  ghosttyApp: boolean;
  xterm: boolean;
  emulator: boolean;
  iterm: boolean;
  osascript: boolean;
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

function appleString(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Type stripping is on by default. No transform flag: Node 26 removed it. */
export function catalogShell(catalog: string): string {
  return `cd ${shQuote(repoOf(catalog))} && node ${shQuote(catalog)}`;
}

function terminalApp(catalog: string): readonly string[] {
  const script = [
    'tell application "Terminal"',
    "activate",
    `do script ${appleString(catalogShell(catalog))}`,
    "end tell",
  ].join("\n");
  return ["osascript", "-e", script];
}

function iterm(catalog: string): readonly string[] {
  const script = [
    'tell application "iTerm2"',
    "activate",
    "set newWindow to (create window with default profile)",
    "tell current session of newWindow",
    `write text ${appleString(catalogShell(catalog))}`,
    "end tell",
    "end tell",
  ].join("\n");
  return ["osascript", "-e", script];
}

function darwinGui(catalog: string, have: LaunchHave): readonly string[] | null {
  if (have.iterm && have.osascript) return iterm(catalog);
  if (have.kitty) {
    return ["kitty", "--detach", "/bin/zsh", "-lc", catalogShell(catalog)];
  }
  if (have.ghosttyApp) {
    return ["open", "-na", "Ghostty", "--args", "-e", catalogShell(catalog)];
  }
  if (have.ghostty) return ["ghostty", "-e", catalogShell(catalog)];
  if (have.osascript) return terminalApp(catalog);
  return null;
}

export function launchArgv(opts: {
  catalog: string;
  inTmux: boolean;
  have: LaunchHave;
}): readonly string[] | null {
  const node = ["node", opts.catalog];
  if (opts.inTmux) {
    return ["tmux", "split-window", "-h", catalogShell(opts.catalog)];
  }
  if (opts.have.darwin) return darwinGui(opts.catalog, opts.have);
  if (!opts.have.setsid) return null;
  if (opts.have.gnome) return ["setsid", "-f", "gnome-terminal", "--", ...node];
  if (opts.have.kitty) return ["setsid", "-f", "kitty", "--detach", ...node];
  if (opts.have.emulator) {
    return ["setsid", "-f", "x-terminal-emulator", "-e", ...node];
  }
  if (opts.have.xterm) return ["setsid", "-f", "xterm", "-e", ...node];
  return null;
}
