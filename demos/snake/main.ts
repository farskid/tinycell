import { bindPlay } from "../play.ts";
import { mountSamples } from "../samples.ts";
import core from "../../games/snake/Snake.ts?raw";
import web from "../../games/snake/SnakeWeb.ts?raw";
import terminal from "../../games/snake/SnakeTerminal.ts?raw";

const root = document.querySelector("#samples");
if (!(root instanceof HTMLElement)) throw new Error("missing #samples");

mountSamples(root, [
  { role: "Core", path: "games/snake/Snake.ts", source: core },
  { role: "Web", path: "games/snake/SnakeWeb.ts", source: web },
  { role: "Terminal", path: "games/snake/SnakeTerminal.ts", source: terminal },
]);
bindPlay(document);
