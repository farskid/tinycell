# TinyCell

Host-blind fixed-timestep cell engine. One `App` owns rules and pixels. The host only paints, feeds keys, and stores bytes.

The core (`src/engine.ts`) imports nothing from Node, the DOM, or a canvas. Terminal and browser are adapters. A native port would be the same: rewrite the adapters, keep the `App`.

## Philosophy

**The game is a grid, not a scene.** Every frame is a `Surface` of packed cells. No sprites, no DOM, no immediate-mode draw list. If it is not a cell, it is not on screen.

**Logic and presentation share a clock, not a host.** `tick` mutates state. `view` writes cells. Neither knows whether the next `paint` is ANSI or canvas. Swap the painter and the same `App` runs elsewhere.

**Time is discrete.** The engine steps at `tickHz`. Missed time is caught up, then capped (`maxTicksPerWake`) so a tab-wake cannot explode into a hundred ticks. Paint happens after ticks, never between them. Input is drained at the end of each tick — one queue, one consumer.

**Color is a slot, not an RGB.** `Color.White` is a theme name. Painters map slots to ANSI / 256 / truecolor / canvas RGB. Pinning lives in the painter so Ghostty and Chrome can disagree without the game caring.

**Persist is I/O.** The engine snapshots a header (version, tick, length) plus whatever `App.snapshot` writes. Hydrate is the inverse. Files, `localStorage`, anything — the host writes bytes. Mutation policy is the game's problem.

**Input is packed integers.** `[kind:8][code:24]`. Games call `keyOf`, not bit masks. Adapters push; the engine never reads a keyboard.

## How it works

```
InputSource ──► InputQueue ──► App.tick
                                   │
                              App.view(Surface)
                                   │
                              Painter.paint
```

`createEngine` wires three things:

| Piece           | Job                                               |
| --------------- | ------------------------------------------------- |
| `App`           | `tick` / `view` / `size` / `snapshot` / `hydrate` |
| `Painter`       | resize + diff-paint a `Surface`                   |
| `InputSource[]` | attach to the shared queue                        |

Phases: `idle → running ⇄ paused → stopped`. `start` arms the timer. `pause` / `resume` freeze and thaw the clock without dropping adapters. `stop` detaches input and disposes the painter.

Grid size is `min(app.size, painter.size)`. A resize from either side rebuilds the surface and calls `app.onResize`.

A cell is one `u32`:

```
[attrs:8][bg:4][fg:4][char:16]
```

Attrs occupy the low nibble (bold, dim, underline, inverse). Bit 4/5 of the attr byte carry the high bit of fg/bg so `BrightWhite` (16) round-trips.

Events are the same idea: `keyEvent(Key.Left)` or `charEvent(codepoint)`. The queue is a 64-slot ring; overflow drops the oldest.

Snapshots are off the tick path. The engine may call `App.snapshot` twice (size, then write). `resume: Uint8Array` on `createEngine` hydrates before the first wake.

## What it can do

- Same `App` on a TTY and in a browser.
- Fixed-rate simulation with bounded catch-up.
- Pause / resume / stop from the host (tab hide, blur, process exit).
- Binary save / restore with a versioned header.
- 16-color palette + 4 attr flags. Painters may pin RGB so theme-collapsing terminals stay readable.
- Square cells: ANSI `cellW: 2`, canvas `cellPx`.
- Diff painters — only dirty cells hit stdout or the canvas.
- Multiple input sources on one queue.
- Resize from host or app.

What it will not do _yet_: sprites, audio, physics, networking, or compile to a native binary without a runtime. That last one is a port, not `tsc`.

## Layout

```
src/engine.ts          clock, Surface, InputQueue, snapshots
src/ANSIPainter.ts     TTY diff painter
src/TTY.ts             raw stdin → Key / char events
src/CanvasPainter.ts   canvas diff painter
src/WebEvent.ts        DOM keydown → same events
games/snake/           first App + host wiring
```

Snake is the proof, not the engine. Modes (wrap, extra food, rocks, laser, …) are rule hooks inside the game.

## Run

Node 22+. No runtime dependencies.

```bash
npm install
npm test
npm run typecheck
npm run dev                          # Snake in the browser
npx tsx games/snake/SnakeTerminal.ts # Snake in the terminal
```

Web persist: `localStorage`. Terminal persist: `~/.tinycell/snake`.

## Wire an App

```ts
const engine = createEngine({
  app,
  painter: createANSIPainter(process.stdout, { cellW: 2 }),
  inputs: [createTTY(process.stdin)],
  tickHz: 40,
  resume: saved ?? undefined,
});
engine.start();
```

Browser is the same `app` with `createWebCanvas` + `createWebEvent`. The engine does not change.
