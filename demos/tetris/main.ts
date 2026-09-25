import { bindPlay } from "../play.ts";
import { mountSamples } from "../samples.ts";
import core from "../../games/tetris/Tetris.ts?raw";
import web from "../../games/tetris/TetrisWeb.ts?raw";
import terminal from "../../games/tetris/TetrisTerminal.ts?raw";

const root = document.querySelector("#samples");
if (!(root instanceof HTMLElement)) throw new Error("missing #samples");

mountSamples(root, [
  { role: "Core", path: "games/tetris/Tetris.ts", source: core },
  { role: "Web", path: "games/tetris/TetrisWeb.ts", source: web },
  {
    role: "Terminal",
    path: "games/tetris/TetrisTerminal.ts",
    source: terminal,
  },
]);
bindPlay(document);
