import type { Evidence, Link } from "../api/types";

export const PITCH_L = 105;
export const PITCH_W = 68;

/** The goal end a goal was scored at: the defending team's own goal line. */
export function goalEnd(ev: Evidence): 0 | 105 {
  return ev.goal.ball.x < PITCH_L / 2 ? 0 : 105;
}

/** "(metres behind line: 4.0)" from the Debugger's LATE_STEP_UP description. */
export function metresBehind(link: Link): number | null {
  const m = /metres behind line:\s*([\d.]+)/.exec(link.description);
  return m ? Number(m[1]) : null;
}

/**
 * For a late step-up: x of the line the rest of the back four held, derived from the culprit's
 * position and the Debugger's measured distance. The line is on the side away from his own goal.
 */
export function backLineX(link: Link, culpritX: number, ev: Evidence): number | null {
  const d = metresBehind(link);
  if (d === null) return null;
  return goalEnd(ev) === 0 ? culpritX + d : culpritX - d;
}

/** Links ordered as the play happened (root cause is not always first in time). */
export function chronological(ev: Evidence): Link[] {
  return [...ev.links].sort((a, b) => a.second - b.second);
}

export function rootLink(ev: Evidence): Link | undefined {
  return ev.links.find((l) => l.evidence_id === ev.root_cause_evidence_id) ?? ev.links[0];
}
