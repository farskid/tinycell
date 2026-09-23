import { highlight } from "./highlight.ts";

export interface Sample {
  role: string;
  path: string;
  source: string;
}

export function mountSamples(root: HTMLElement, samples: readonly Sample[]): void {
  root.replaceChildren();
  for (const sample of samples) {
    const block = document.createElement("section");
    block.className = "sample";
    const head = document.createElement("div");
    head.className = "sample-head";
    const role = document.createElement("b");
    role.textContent = sample.role;
    const path = document.createElement("span");
    path.textContent = sample.path;
    head.append(role, path);
    const pre = document.createElement("pre");
    pre.className = "code";
    pre.innerHTML = highlight(sample.source);
    block.append(head, pre);
    root.append(block);
  }
}
