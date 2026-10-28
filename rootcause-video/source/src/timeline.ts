// One place for every timing in the cut. Seconds -> frames at 30 fps.
export const FPS = 30;
export const TOTAL = 120 * FPS;
export const s = (sec: number) => Math.round(sec * FPS);

// captured clips: folder under public/captures and frame count, all recorded at 15 fps
export const CLIP_FPS = 15;
export const CLIPS = {
  goal: { dir: "captures/autopsy/the-goal", n: 105 },
  move: { dir: "captures/autopsy/the-move", n: 90 },
  mistakes: { dir: "captures/autopsy/mistakes", n: 75 },
  test: { dir: "captures/autopsy/the-test", n: 75 },
  replays: { dir: "captures/autopsy/200-replays", n: 90 },
  verdict: { dir: "captures/autopsy/verdict", n: 60 },
  fix: { dir: "captures/autopsy/the-fix", n: 75 },
  home: { dir: "captures/pages/home-clip", n: 60 },
  matchScroll: { dir: "captures/pages/match-scroll", n: 120, fps: 30 },
  labSpace: { dir: "captures/pages/lab-space", n: 45 },
  labOptions: { dir: "captures/pages/lab-options", n: 15 },
  labPressure: { dir: "captures/pages/lab-pressure", n: 15 },
  labRuns: { dir: "captures/pages/lab-runs", n: 15 },
} as const;

export const SCENES = [
  { id: "01", name: "The hook", from: 0, to: 12 },
  { id: "02", name: "The product", from: 12, to: 26 },
  { id: "03", name: "The replay", from: 26, to: 48 },
  { id: "04", name: "Root-cause autopsy", from: 48, to: 72 },
  { id: "05", name: "The counterfactual", from: 72, to: 94 },
  { id: "06", name: "Every perspective", from: 94, to: 112 },
  { id: "07", name: "Finale", from: 112, to: 120 },
];
