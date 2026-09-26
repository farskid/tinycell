import { bindPlay } from "../play.ts";
import { mountSamples } from "../samples.ts";
import core from "../../games/battle-city/BattleCity.ts?raw";
import web from "../../games/battle-city/BattleCityWeb.ts?raw";
import terminal from "../../games/battle-city/BattleCityTerminal.ts?raw";

const root = document.querySelector("#samples");
if (!(root instanceof HTMLElement)) throw new Error("missing #samples");

mountSamples(root, [
  { role: "Core", path: "games/battle-city/BattleCity.ts", source: core },
  { role: "Web", path: "games/battle-city/BattleCityWeb.ts", source: web },
  {
    role: "Terminal",
    path: "games/battle-city/BattleCityTerminal.ts",
    source: terminal,
  },
]);
bindPlay(document);
