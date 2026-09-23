import { highlight } from "./highlight.ts";

export interface Sample {
  role: string;
  path: string;
  source: string;
}

export function mountSamples(root: HTMLElement, samples: readonly Sample[]): void {
  root.replaceChildren();
  const tabs = document.createElement("div");
  tabs.className = "tabs";
  tabs.setAttribute("role", "tablist");
  const path = document.createElement("span");
  path.className = "tab-path";
  const bar = document.createElement("div");
  bar.className = "tabbar";
  bar.append(tabs, path);
  const panels = document.createElement("div");

  const buttons: HTMLButtonElement[] = [];
  const blocks: HTMLElement[] = [];

  function select(index: number): void {
    for (let i = 0; i < samples.length; i++) {
      const on = i === index;
      buttons[i]!.setAttribute("aria-selected", on ? "true" : "false");
      buttons[i]!.tabIndex = on ? 0 : -1;
      blocks[i]!.hidden = !on;
    }
    path.textContent = samples[index]!.path;
  }

  samples.forEach((sample, i) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.role = "tab";
    tab.id = `sample-tab-${i}`;
    tab.setAttribute("aria-controls", `sample-panel-${i}`);
    tab.textContent = sample.role;
    tab.addEventListener("click", () => select(i));
    buttons.push(tab);
    tabs.append(tab);

    const panel = document.createElement("section");
    panel.className = "sample";
    panel.id = `sample-panel-${i}`;
    panel.role = "tabpanel";
    panel.setAttribute("aria-labelledby", tab.id);
    const pre = document.createElement("pre");
    pre.className = "code";
    pre.innerHTML = highlight(sample.source);
    panel.append(pre);
    blocks.push(panel);
    panels.append(panel);
  });

  tabs.addEventListener("keydown", (ev) => {
    const current = buttons.findIndex((button) => button === document.activeElement);
    if (current < 0) return;
    if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
    ev.preventDefault();
    const next =
      ev.key === "ArrowRight"
        ? (current + 1) % buttons.length
        : (current - 1 + buttons.length) % buttons.length;
    select(next);
    buttons[next]!.focus();
  });

  select(0);
  root.append(bar, panels);
}
