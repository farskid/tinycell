# TinyGM

Fixed-timestep cell engine for terminals. The core never touches a TTY. Snake is not in this package; it implements `App` and wires the two adapters.

- `src/engine.ts` — clock, surface, input queue, snapshots
- `src/ANSIPainter.ts` — `createANSIPainter`
- `src/TTY.ts` — `createTTY`

No runtime dependencies. Node 22+.

```bash
npm install
npm test
npx tsc --noEmit
```

```ts
import { createEngine } from "./src/engine.ts";
import { createANSIPainter } from "./src/ANSIPainter.ts";
import { createTTY } from "./src/TTY.ts";
const engine = createEngine({
  app, // Snake implements App
  painter: createANSIPainter(process.stdout),
  inputs: [createTTY(process.stdin)],
  tickHz: 20,
});
engine.start();
```
