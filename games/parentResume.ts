export const PARENT_RESUME = "tinycell-resume-audio";

export function resumeWhenParentAsks(sink: { resume(): void }): void {
  addEventListener("message", (ev: MessageEvent) => {
    if (ev.origin !== location.origin) return;
    if (ev.data !== PARENT_RESUME) return;
    sink.resume();
  });
}
