import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const dir = dirname(fileURLToPath(import.meta.url));
const repo = join(dir, "../..");

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
  root: dir,
  server: {
    open: true,
    fs: { allow: [repo] },
  },
  plugins: [fullReload()],
});
