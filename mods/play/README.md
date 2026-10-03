# tinycell

Play the demo games while a Claude Code turn is in flight.

```
claude --plugin-dir mods/play
```

Type `/play`. It is a plugin command (`commands/play.md`), so it is in the slash menu as soon as the plugin loads, and the hooks module runs it immediately, without a model turn. It opens a pane in the current Claude Code session: a Raster of the game grid, and a keys row you click once. `q` leaves a game for the list and leaves the list to close the pane. Escape is Claude's own key and is not used. From a shell, `npm run play` is `node games/catalog.ts` in that terminal. If the hooks module fails to load, Claude Code prints the reason in the transcript.

The first launch lists the games. The next launch opens the last one. In the pane, q leaves a game for the list, and q on the list closes the pane. `npm run play` still uses Ctrl-C for those two steps.

Games: Battle City, Invaders, Snake, 2048, Flappy, Tetris, Contra.

Saves are the engine snapshots already written under `~/.tinycell/<game>` (`createEngine({ resume })` plus `createFilePersist`). The last game id is `~/.tinycell/last`, written by the same file persist when a game starts and when it stops.
