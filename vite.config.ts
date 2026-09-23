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
        snakeDemo: resolve(root, "demos/snake/index.html"),
        invadersDemo: resolve(root, "demos/invaders/index.html"),
      },
    },
  },
  plugins: [fullReload()],
});
