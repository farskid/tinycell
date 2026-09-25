import { bindPlay } from "../play.ts";
import { mountSamples } from "../samples.ts";
import core from "../../games/contra/Contra.ts?raw";
import web from "../../games/contra/ContraWeb.ts?raw";
import terminal from "../../games/contra/ContraTerminal.ts?raw";

const root = document.querySelector("#samples");
if (!(root instanceof HTMLElement)) throw new Error("missing #samples");

mountSamples(root, [
  { role: "Core", path: "games/contra/Contra.ts", source: core },
  { role: "Web", path: "games/contra/ContraWeb.ts", source: web },
  {
    role: "Terminal",
    path: "games/contra/ContraTerminal.ts",
    source: terminal,
  },
]);
bindPlay(document);
