import { bindPlay } from "../play.ts";
import { mountSamples } from "../samples.ts";
import core from "../../games/block-blast/BlockBlast.ts?raw";
import web from "../../games/block-blast/BlockBlastWeb.ts?raw";
import terminal from "../../games/block-blast/BlockBlastTerminal.ts?raw";

const root = document.querySelector("#samples");
if (!(root instanceof HTMLElement)) throw new Error("missing #samples");

mountSamples(root, [
  { role: "Core", path: "games/block-blast/BlockBlast.ts", source: core },
  { role: "Web", path: "games/block-blast/BlockBlastWeb.ts", source: web },
  {
    role: "Terminal",
    path: "games/block-blast/BlockBlastTerminal.ts",
    source: terminal,
  },
]);
bindPlay(document);
