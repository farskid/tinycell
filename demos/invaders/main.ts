import { bindPlay } from "../play.ts";
import { mountSamples } from "../samples.ts";
import core from "../../games/space-invaders/SpaceInvaders.ts?raw";
import web from "../../games/space-invaders/SpaceInvadersWeb.ts?raw";
import terminal from "../../games/space-invaders/SpaceInvadersTerminal.ts?raw";

const root = document.querySelector("#samples");
if (!(root instanceof HTMLElement)) throw new Error("missing #samples");

mountSamples(root, [
  { role: "Core", path: "games/space-invaders/SpaceInvaders.ts", source: core },
  { role: "Web", path: "games/space-invaders/SpaceInvadersWeb.ts", source: web },
  {
    role: "Terminal",
    path: "games/space-invaders/SpaceInvadersTerminal.ts",
    source: terminal,
  },
]);
bindPlay(document);
