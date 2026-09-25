import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

function fullReload(): Plugin {
  return {
    name: "full-reload",
    handleHotUpdate({ server }) {
      server.ws.send({ type: "full-reload" });
      return [];
    },
  };
}

export default defineConfig({
  root,
  // Relative URLs so the same build works at / and at /tinycell/ on Pages.
  base: "./",
  // The site compiles the library from source. Package exports point at dist,
  // and Pages never runs the library build before this one.
  resolve: {
    alias: [
      { find: "tinycell/terminal", replacement: resolve(root, "src/terminal.ts") },
      { find: "tinycell/web", replacement: resolve(root, "src/web.ts") },
      { find: "tinycell/fx", replacement: resolve(root, "src/fx.ts") },
      { find: /^tinycell$/, replacement: resolve(root, "src/engine.ts") },
    ],
  },
  server: {
    open: false,
    fs: { allow: [root] },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        snake: resolve(root, "games/snake/index.html"),
        invaders: resolve(root, "games/space-invaders/index.html"),
        flappy: resolve(root, "games/flappy/index.html"),
        contra: resolve(root, "games/contra/index.html"),
        g2048: resolve(root, "games/2048/index.html"),
        tetris: resolve(root, "games/tetris/index.html"),
        snakeDemo: resolve(root, "demos/snake/index.html"),
        invadersDemo: resolve(root, "demos/invaders/index.html"),
        flappyDemo: resolve(root, "demos/flappy/index.html"),
        contraDemo: resolve(root, "demos/contra/index.html"),
        g2048Demo: resolve(root, "demos/2048/index.html"),
        tetrisDemo: resolve(root, "demos/tetris/index.html"),
      },
    },
  },
  plugins: [fullReload()],
});
