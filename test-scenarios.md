# Untested scenarios

Scenarios below are not covered by the current tests. Each one must be tested.

## engine.ts

- `Surface.writeText` writes each code unit into the row, starting at `x`.
- `writeText` returns without writing when `y` is outside the surface.
- `writeText` skips cells whose `x` is outside the surface and still writes the cells that fit.
- Packing a bright foreground (`Color.BrightWhite` and another bright color) sets the fg hi bit, and `cellFg` returns the original color.
- `Surface.set` does not write when `x` or `y` is outside the surface.
- `InputQueue.at` returns `0` for an index below `0` or at or past `length`.
- `keyOf` returns `0` for a key event whose code is above `Key.CtrlC`.
- `createEngine` throws when `tickHz` is `0` or negative.
- A snapshot whose app payload is larger than the 256-byte scratch grows the scratch, calls `snapshot` again, and round-trips the full payload.
- `Engine.snapshot` throws when `app.snapshot` returns a negative length or a length larger than the buffer it was given.
- `createEngine({ resume })` throws on a truncated snapshot whose declared length runs past the blob.
- `createEngine({ resume })` throws on an empty blob.
- After a wake that leaves a remainder (`acc` greater than 0 and less than one step), the next timer delay is `step - acc`, and that delay produces the next tick.
- `resume` uses the same remainder delay when a pause happens with `acc` still between 0 and one step.
- If `app.tick` calls `pause` or `stop` during a multi-tick wake, no further ticks run and no frame is painted for that wake.
- `start` does nothing when the engine is already running, paused, or stopped.
- `pause` does nothing when the engine is idle, already paused, or stopped.
- `resume` does nothing when the engine is idle, running, or stopped.
- `onResize` during `syncGrid` does not re-enter grid sync.
- A non-positive app size or painter size clamps that axis to `0`.

## TTY.ts

- A `data` chunk that is a string is parsed the same way as bytes.
- ESC followed by a byte other than `[` or `O` cancels the escape and parses that byte as ground (a following `!` is a char event, not `Key.Escape`).
- A CSI sequence ended by a byte outside `0x20`–`0x7e` aborts, returns to ground, and parses that byte as ground.
- An SS3 sequence ended by a byte outside `0x40`–`0x7e` aborts, returns to ground, and parses that byte as ground.
- CSI and SS3 Down (`0x42`) push `Key.Down`.
- A second `attach` detaches the first listener; later bytes go only to the new queue, and the first stream's raw mode is restored.
- An ESC timer that fires after `detach` does not push `Key.Escape`.

## ANSIPainter.ts

- A host `resize` that changes columns or rows updates `size` and notifies `onResize` listeners.
- A host `resize` that leaves the cell grid unchanged does not notify listeners.
- Missing, zero, or negative `columns` / `rows` fall back to 80×24 before dividing by `cellW`.
- Bold, dim, underline, and inverse are emitted as SGR parameters `1`, `2`, `4`, and `7`, including when several are set on one cell.
- A control character (`ch < 0x20`) is painted as `?`.
- A glyph in `U+0080`–`U+07FF` is emitted as 2-byte UTF-8.
- `createANSIPainter` throws when `cellW` is `0` or negative.
- With `cellW` greater than 2, an ASCII pair is the two packed bytes followed by spaces out to `cellW`.
- `write` returning false from the alt-screen enter or from a clear sets `ready` to false until `drain`.
- A second `write` that returns false while a drain is already armed does not register another drain listener.
- `drain` after `dispose` leaves `ready` false.
- `resize` to the current grid size writes nothing.
- `resize` after `dispose` writes nothing.
- `paint` of a surface whose size differs from the painter's grid writes nothing.

## CanvasPainter.ts

- A canvas with `nodeType === 1` is observed with `ResizeObserver`, and a resize notification updates the grid.
- `dispose` calls `observer.disconnect` and ignores a later observer notification.
- When `clientWidth` / `clientHeight` echo the bitmap just written, the grid does not grow.
- `devicePixelRatio` of 2 sizes the bitmap at twice the CSS box and sets the canvas transform to that scale.
- A missing, zero, or negative `devicePixelRatio` uses scale `1`.
- A missing or non-positive `clientWidth` / `clientHeight` falls back to `canvas.width` / `canvas.height`, then to `0`.
- A CSS box smaller than one cell reports a `0` grid on that axis.
- Dim halves foreground and background channels.
- Underline draws a bar along the bottom of the cell in the foreground color.
- A bold ASCII pair uses the half-size bold font for both glyphs.
- `createWebCanvas` throws when `getContext` is missing.
- `createWebCanvas` throws when `cellPx` is `0` or negative.
- `resize` to the current grid size does not clear the canvas again.
- `resize` after `dispose` does not draw.
- `paint` of a surface whose size differs from the painter's grid draws nothing.
- A packed char with either byte outside `0x20`–`0x7e` is not split into two glyphs.
- A control character is drawn as `?`.

## WebEvent.ts

- Bare `c` and bare `C` are char events, not `Key.CtrlC`.
- A one-character key whose code is below `0x21` or above `0x7e` (and not already a mapped key) is ignored.
