export function bindPlay(root: ParentNode): void {
  const screens = root.querySelectorAll<HTMLElement>(".screen");

  function fit(): void {
    for (const screen of screens) {
      const w = Number(screen.dataset.w);
      const h = Number(screen.dataset.h);
      const scale = Math.min(1, screen.clientWidth / w);
      const iframe = screen.querySelector("iframe");
      if (!(iframe instanceof HTMLIFrameElement)) continue;
      iframe.style.width = `${w}px`;
      iframe.style.height = `${h}px`;
      iframe.style.transform = `scale(${scale})`;
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

  fit();
  addEventListener("resize", fit);
}
