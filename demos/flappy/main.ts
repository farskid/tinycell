import { bindPlay } from "../play.ts";
import { mountSamples } from "../samples.ts";
import core from "../../games/flappy/Flappy.ts?raw";
import web from "../../games/flappy/FlappyWeb.ts?raw";
import terminal from "../../games/flappy/FlappyTerminal.ts?raw";

const root = document.querySelector("#samples");
if (!(root instanceof HTMLElement)) throw new Error("missing #samples");

mountSamples(root, [
  { role: "Core", path: "games/flappy/Flappy.ts", source: core },
  { role: "Web", path: "games/flappy/FlappyWeb.ts", source: web },
  {
    role: "Terminal",
    path: "games/flappy/FlappyTerminal.ts",
    source: terminal,
  },
]);
bindPlay(document);
