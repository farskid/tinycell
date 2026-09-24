import { PARENT_RESUME } from "../games/parentResume.ts";

const STAGE_KEY = "tinycell-stage";
const STAGE_MIN = 220;
const SAMPLES_MIN = 240;

export function bindPlay(root: ParentNode): void {
  const screens = root.querySelectorAll<HTMLElement>(".screen");
  const stages = new Set<HTMLElement>();

  function fit(): void {
    for (const screen of screens) {
      const w = Number(screen.dataset.w);
      const h = Number(screen.dataset.h);
      const scale = screen.clientWidth / w;
      const iframe = screen.querySelector("iframe");
      if (!(iframe instanceof HTMLIFrameElement)) continue;
      if (!Number.isFinite(scale) || scale <= 0) continue;
      iframe.style.width = `${w}px`;
      iframe.style.height = `${h}px`;
      iframe.style.transform = `scale(${scale})`;
      iframe.style.imageRendering = scale > 1 ? "pixelated" : "auto";
      screen.style.height = `${Math.ceil(h * scale)}px`;
    }
  }

  for (const screen of screens) {
    const machine = screen.closest(".machine");
    const iframe = screen.querySelector("iframe");
    const veil = screen.querySelector(".veil");
    if (!(iframe instanceof HTMLIFrameElement)) continue;
    if (!(veil instanceof HTMLButtonElement)) continue;
    if (!(machine instanceof HTMLElement)) continue;
    veil.addEventListener("click", () => {
      iframe.focus();
      iframe.contentWindow?.postMessage(PARENT_RESUME, location.origin);
    });
    iframe.addEventListener("focus", () => {
      veil.hidden = true;
      machine.classList.add("live");
    });
    iframe.addEventListener("blur", () => {
      veil.hidden = false;
      machine.classList.remove("live");
    });
  }

  for (const screen of screens) {
    const stage = screen.closest(".stage");
    if (stage instanceof HTMLElement) stages.add(stage);
  }
  for (const stage of stages) bindResize(stage, fit);

  fit();
  addEventListener("resize", () => {
    for (const stage of stages) applyStage(stage);
    fit();
  });
}

function bindResize(stage: HTMLElement, fit: () => void): void {
  const screen = stage.querySelector(".screen");
  if (!(screen instanceof HTMLElement)) return;
  const grip = document.createElement("button");
  grip.type = "button";
  grip.className = "grip";
  grip.setAttribute("aria-label", "Resize game");
  screen.append(grip);

  applyStage(stage);

  const setWidth = (px: number): void => {
    writeStage(Math.round(Math.max(STAGE_MIN, px)));
    applyStage(stage);
    fit();
  };

  let lastTap = 0;
  grip.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const origin = e.clientX;
    const start = stage.getBoundingClientRect().width;
    const html = document.documentElement;
    const prevCursor = html.style.cursor;
    const prevSelect = html.style.userSelect;
    html.style.cursor = "nwse-resize";
    html.style.userSelect = "none";
    const move = (ev: PointerEvent): void => {
      setWidth(start + ev.clientX - origin);
    };
    const up = (ev: PointerEvent): void => {
      html.style.cursor = prevCursor;
      html.style.userSelect = prevSelect;
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      if (Math.abs(ev.clientX - origin) > 3) {
        lastTap = 0;
        return;
      }
      const now = performance.now();
      if (now - lastTap < 400) {
        writeStage(null);
        applyStage(stage);
        fit();
        lastTap = 0;
        return;
      }
      lastTap = now;
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
    grip.setPointerCapture(e.pointerId);
  });

  grip.addEventListener("keydown", (e) => {
    const w = stage.getBoundingClientRect().width;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setWidth(w + 24);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setWidth(w - 24);
    }
  });
}

function stageMax(stage: HTMLElement): number {
  const layout = stage.closest(".layout");
  if (!(layout instanceof HTMLElement)) return STAGE_MIN;
  const columns = getComputedStyle(layout).gridTemplateColumns.split(" ").length;
  if (columns < 2) return layout.clientWidth;
  return Math.max(STAGE_MIN, layout.clientWidth - 28 - SAMPLES_MIN);
}

function applyStage(stage: HTMLElement): void {
  const layout = stage.closest(".layout");
  const saved = readStage();
  if (!(layout instanceof HTMLElement) || saved == null) {
    stage.style.width = "";
    if (layout instanceof HTMLElement) layout.style.removeProperty("--stage");
    return;
  }
  const px = `${Math.round(Math.min(stageMax(stage), Math.max(STAGE_MIN, saved)))}px`;
  layout.style.setProperty("--stage", px);
  stage.style.width = px;
}

function readStage(): number | null {
  try {
    const n = Number(localStorage.getItem(STAGE_KEY));
    return Number.isFinite(n) && n >= STAGE_MIN ? n : null;
  } catch {
    return null;
  }
}

function writeStage(px: number | null): void {
  try {
    if (px == null) localStorage.removeItem(STAGE_KEY);
    else localStorage.setItem(STAGE_KEY, String(px));
  } catch {
    /* private mode */
  }
}
