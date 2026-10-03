# tinycell

Play the demo games while a Claude Code turn is in flight.

```
claude --plugin-dir mods/play
```

Type `/play`. It is a plugin command (`commands/play.md`), so it is in the slash menu as soon as the plugin loads, and the hooks module runs it immediately, without a model turn. Inside tmux it opens the catalog in the other pane. Otherwise it opens a new terminal. From a shell, `npm run play` is the same catalog. If the hooks module fails to load, Claude Code prints the reason in the transcript.

The first launch lists the games. The next launch opens the last one. Ctrl-C leaves a game and returns to the list. Ctrl-C on the list quits.

Games: Battle City, Invaders, Snake, 2048, Flappy, Tetris, Contra.

Saves are the engine snapshots already written under `~/.tinycell/<game>` (`createEngine({ resume })` plus `createFilePersist`). The last game id is `~/.tinycell/last`, written by the same file persist when a game starts and when it stops.
