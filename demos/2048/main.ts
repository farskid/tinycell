import { bindPlay } from "../play.ts";
import { mountSamples } from "../samples.ts";
import core from "../../games/2048/Game2048.ts?raw";
import fx from "../../src/fx.ts?raw";
import web from "../../games/2048/Game2048Web.ts?raw";
import terminal from "../../games/2048/Game2048Terminal.ts?raw";

const root = document.querySelector("#samples");
if (!(root instanceof HTMLElement)) throw new Error("missing #samples");

mountSamples(root, [
  { role: "Core", path: "games/2048/Game2048.ts", source: core },
  { role: "Playback", path: "src/fx.ts", source: fx },
  { role: "Web", path: "games/2048/Game2048Web.ts", source: web },
  {
    role: "Terminal",
    path: "games/2048/Game2048Terminal.ts",
    source: terminal,
  },
]);
bindPlay(document);
