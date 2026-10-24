import { fixedTracks } from "../store/broadcast";
import { useMatch } from "../store/matchStore";
import { playhead, useTrace } from "../store/traceStore";

const fixedPos = new Float32Array(44);
const fixedBall = new Float32Array(2);

/**
 * Positions for the current frame: the recorded match at playhead.t, blended toward the
 * recorded fixed replay (counterfactual) by playhead.morph. Before the fixed replay starts it
 * is identical to what happened; after the attack breaks down it holds its last frame.
 */
export function samplePositions(out: Float32Array, ball: Float32Array): boolean {
  const { track } = useMatch.getState();
  if (!track.sample(playhead.t, out, ball)) return false;
  const m = playhead.morph;
  const eid = useTrace.getState().morphEvidenceId;
  if (m > 0.001 && eid) {
    const fixed = fixedTracks.get(eid);
    if (fixed && fixed.size && playhead.t >= fixed.first() - 1) {
      if (fixedPos.length !== out.length) return true;
      fixed.sample(Math.min(playhead.t, fixed.last()), fixedPos, fixedBall);
      for (let i = 0; i < out.length; i++) out[i] += (fixedPos[i] - out[i]) * m;
      ball[0] += (fixedBall[0] - ball[0]) * m;
      ball[1] += (fixedBall[1] - ball[1]) * m;
    }
  }
  return true;
}

/** Where the fixed replay broke the attack, if it did (e.g. "offside" at 62:29). */
export function breakdown(evidenceId: string): { second: number; note: string } | null {
  const goalId = evidenceId.replace(/-l\d+$/, "");
  const rep = useMatch.getState().replays[goalId]?.[evidenceId];
  const last = rep?.frames[rep.frames.length - 1];
  return last?.note ? { second: last.clock_s, note: last.note } : null;
}
