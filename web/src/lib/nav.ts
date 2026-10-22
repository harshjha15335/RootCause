import { begin } from "../store/broadcast";
import { useTrace } from "../store/traceStore";
import { useUi, type Screen } from "../store/uiStore";

/**
 * Moving between screens. The story always starts from the build-up so the trace happens on
 * screen; every other screen shows the traced goal, so leaving the story mid-way lands on the verdict.
 */
export function go(screen: Screen) {
  const ui = useUi.getState();
  const from = ui.screen;
  if (screen === "story") begin("buildup");
  else if (from === "story") {
    const phase = useTrace.getState().phase;
    if (phase === "live" || phase === "goal" || phase === "tracing") begin("verdict");
    useTrace.getState().setMorph(0);
  }
  ui.setScreen(screen);
}
