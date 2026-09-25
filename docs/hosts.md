# Hosts

The engine guarantees two things. Games function logically on every host. Audio cues function logically on every host. How a host draws or sounds is not part of either guarantee.

One `App` owns the rules and the grid. It does not ask whether the next paint is ANSI or a canvas, or whether anyone is listening to cues. Swap the painter, the sink, or both, and the same ticks, collisions, score, and saves still run.

## Cells

There is no sprite list and no tilemap. A picture the rules depend on is cells written in `view`. A ship, an alien, and a repeating floor are the same kind of object: a stamp of packed cells. A sprite, in the usual sense, is a movable picture. A tilemap is a repeating background. The engine has neither. Both are stamps.

Animation that ends as cells is logic. A fractional position may live in the `App`. `view` rounds it onto cells. Every painter receives those cells. The surface has no fractional channel, so motion between cells is not something the engine can express. A painter that glides a bitmap between cells is inventing that motion on its own.

## Painters

Swap-and-run means the game still ticks. It does not mean every painter draws the same pixels.

`Color.White` is a name. One painter maps it to ANSI, another to a canvas RGB. That split is already the model. A game does not aim at the visual subset shared by every host. The cell is the baseline: a glyph and a color, which every painter can draw. A painter may interpret the same cell more richly. The `App` does not branch on which painter it got.

## Bitmaps

A bitmap is a host limit. It lives in the painter, the way a sample lives in the sink.

`view` writes a cell. The web painter may map that character code to a PNG and draw it. The terminal painter draws the glyph and the color for the same code. The `App` never sees a URL or an image. Silence of the extra picture is a valid host, same as a missing audio sink.

The bitmap should occupy the cells the rules already use. A picture that spills past those cells no longer matches collision.

## Cues

A cue is a game fact, same as a hit or a score. The engine guarantees the log of those facts, not the waveform.

`tick` pushes ids `1..255`. Anything else is dropped. The queue holds 16 ids and drops the oldest past that. After the ticks in a wake, a ready sink receives `play` once with those ids, in order. The queue is then cleared, including when `play` throws. No sink, or a sink that is not ready, still clears that wake. Those cues do not wait for a later one. Pause clears anything not yet flushed and suspends the sink. Resume does not replay.

What an id sounds like stays in `AudioSink`. A missing sink is silence, and the same ticks still run. Dropped, reordered, or replayed ids would be an engine bug. A different sample for the same id is a different host.
