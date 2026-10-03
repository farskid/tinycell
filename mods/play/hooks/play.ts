import type { On } from "claude-code";

const PANE_ID = "tinycell";

// A Client cannot draw a Raster (ClientElements omits it). The pane render
// hook places them as siblings: Raster is the grid, Client receives onKey.
type View = { columns: number; rows: number; cells: string };

const view: View = { columns: 56, rows: 12, cells: blank(56, 12) };

let keysDir = "";
let keySeq = 0;
let generation = 0;
let reader: { return(value: undefined): Promise<unknown> } | null = null;

type HostChunk = { stream?: "stdout" | "stderr"; text?: string };
type HostEnd = { code: number | null; signal: string | null };
type HostStream = AsyncIterable<HostChunk> & {
  return(value: undefined): Promise<HostEnd>;
  result: Promise<HostEnd>;
};

export function register(on: On): void {
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
    const line = `tinycell: play failed to start (${next.error.message ?? next.error.kind})`;
    $.ui.log(line);
    $.ui.toast(line);
  });

  on("ui.close", async ($, e, next) => {
    if (e.id !== PANE_ID) return next(e);
    stopHost();
    return next(e);
  });

  on("ui.message", async ($, e, next) => {
    if (e.requestId !== PANE_ID || typeof e.data !== "string" || e.data === "") {
      return next(e);
    }
    if (keysDir === "") return next(e);
    keySeq += 1;
    await $.fs.write(`${keysDir}/${String(keySeq).padStart(8, "0")}`, e.data);
    return {};
  });

  on("ui.render", { component: "Pane" }, async ($, e, next) => {
    if (e.requestId !== PANE_ID || e.surface !== "terminal") return next(e);
    const { Box, Text, Raster, Client } = $.ui.resolve(e);
    // h is the hooks JSX factory. ClientElements omit Raster, so it stays a sibling.
    return h(
      Box,
      { flexDirection: "column", key: "root" },
      h(Client, {
        key: "keys",
        module: "./keys.tsx",
        width: "100%",
        height: 1,
      }),
      h(Text, { dimColor: true }, "q back"),
      h(Raster, {
        key: "grid",
        columns: view.columns,
        rows: view.rows,
        cells: view.cells,
      }),
    );
  });

  on("command.run", async ($, e, next) => {
    if (e.command !== "play" && !e.command.endsWith(":play")) return next(e);
    const root = $.plugin.root.replace(/\/+$/, "");
    const repo = root.replace(/\/mods\/play$/, "");
    if (repo === root) {
      return { text: "tinycell play mod must live in mods/play" };
    }
    const home = (await $.env.get("HOME")) ?? "";
    if (home === "") return { text: "tinycell needs HOME to save games" };
    stopHost();
    const gen = generation;
    keysDir = `${home}/.tinycell/pane-keys`;
    keySeq = 0;
    const opened = await $.ui.open({
      id: PANE_ID,
      title: "tinycell",
      focus: true,
      rows: 36,
      columns: 80,
      closeOnEscape: false,
    });
    if (!opened.isPlaced) {
      return {
        text: "tinycell could not place its pane. Widen the terminal and run /play again.",
      };
    }
    const stream = $.process.spawn({
      argv: ["node", `${root}/host.ts`, keysDir],
      cwd: repo,
    }) as unknown as HostStream;
    reader = stream;
    void readHost($, stream, gen);
    return {
      text: "tinycell is in this session. Click the keys row, then play. q goes back, and q on the list closes the pane.",
    };
  });
}

function stopHost(): void {
  generation += 1;
  const current = reader;
  reader = null;
  void current?.return(undefined);
}

async function readHost(
  $: {
    ui: {
      log(text: string): void;
      close(pane: { id: string }): Promise<void>;
      blit(args: {
        requestId: string;
        key: string;
        cells: string;
        columns: number;
        rows: number;
      }): Promise<unknown>;
      invalidate(event: "ui.render"): void;
    };
  },
  stream: HostStream,
  gen: number,
): Promise<void> {
  let pending = "";
  let stderr = "";
  try {
    for await (const chunk of stream) {
      if (gen !== generation) return;
      if (chunk.stream === "stderr") {
        stderr += chunk.text ?? "";
        continue;
      }
      pending += chunk.text ?? "";
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) applyLine($, line);
    }
    if (gen !== generation) return;
    const ended = await stream.result;
    if (ended.code !== 0 && ended.code !== null) {
      const err = stderr.trim() || `host exited ${ended.code}`;
      $.ui.log(`tinycell: ${err}`);
    }
  } catch (err) {
    if (gen !== generation) return;
    const message = err instanceof Error ? err.message : String(err);
    $.ui.log(`tinycell: ${message}`);
  }
}

function applyLine(
  $: {
    ui: {
      close(pane: { id: string }): Promise<void>;
      blit(args: {
        requestId: string;
        key: string;
        cells: string;
        columns: number;
        rows: number;
      }): Promise<unknown>;
      invalidate(event: "ui.render"): void;
    };
  },
  line: string,
): void {
  if (line === "Q") {
    void $.ui.close({ id: PANE_ID });
    return;
  }
  const match = /^F (\d+) (\d+) ([A-Za-z0-9+/=]+)$/.exec(line);
  if (!match) return;
  const columns = Number(match[1]);
  const rows = Number(match[2]);
  const cells = match[3] ?? "";
  if (columns === view.columns && rows === view.rows) {
    view.cells = cells;
    void $.ui.blit({ requestId: PANE_ID, key: "grid", cells, columns, rows });
    return;
  }
  view.columns = columns;
  view.rows = rows;
  view.cells = cells;
  $.ui.invalidate("ui.render");
}

function blank(columns: number, rows: number): string {
  const words = new Uint32Array(columns * rows * 3);
  for (let i = 0; i < columns * rows; i++) {
    words[i * 3] = 0x20;
    words[i * 3 + 1] = 0xccccc6;
    words[i * 3 + 2] = 0;
  }
  return new Uint8Array(words.buffer).toBase64();
}
