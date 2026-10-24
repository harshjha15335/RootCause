import { lazyPage } from "../lib/lazyPage";
import { Component, Suspense, useState, type ReactNode } from "react";
import { useUi } from "../store/uiStore";
import { Pitch } from "./Pitch";

const Stage3D = lazyPage(() => import("../three/Stage"));

function canRun3D() {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function useStageMode() {
  const view = useUi((s) => s.view);
  const reduced = useUi((s) => s.reducedMotion);
  const [webgl] = useState(canRun3D);
  return { webgl, reduced, view, use3d: view === "3d" && webgl && !reduced };
}

/** The pitch: 3D when the device can, the flat pitch otherwise. Never a blank box. */
export function StageView() {
  const { use3d } = useStageMode();
  return use3d ? (
    // the flat pitch holds the stage while the 3D chunk loads
    <StageBoundary>
      <Suspense fallback={<FlatStage />}>
        <Stage3D />
      </Suspense>
    </StageBoundary>
  ) : (
    <FlatStage />
  );
}

/** If WebGL or the 3D chunk fails, the flat pitch takes over; the match never stops. */
class StageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("3D stage unavailable, using the flat pitch", error);
  }
  render() {
    return this.state.failed ? <FlatStage /> : this.props.children;
  }
}

export function FlatStage() {
  return (
    <div className="absolute inset-0 grid place-items-center p-3 sm:p-6">
      <div className="aspect-[111/74] max-h-full w-full max-w-full">
        <Pitch />
      </div>
    </div>
  );
}
