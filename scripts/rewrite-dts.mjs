import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

for (const name of await readdir(dist)) {
  if (!name.endsWith(".d.ts")) continue;
  const path = join(dist, name);
  const text = await readFile(path, "utf8");
  const next = text.replaceAll(
    /from (["'])(\.[^"']+)\.ts\1/g,
    "from $1$2.js$1",
  );
  if (next !== text) await writeFile(path, next);
}
