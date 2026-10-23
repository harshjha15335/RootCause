import { useUi, type Screen } from "../store/uiStore";

/** Moving between screens. */
export function go(screen: Screen) {
  useUi.getState().setScreen(screen);
}
