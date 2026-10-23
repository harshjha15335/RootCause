import { useQuery } from "@tanstack/react-query";
import { SHOWCASE_MATCH } from "./rest";

/**
 * Full-match analysis exported offline by web/tools/export_analysis.py from the engine's own
 * 90 minutes (socceraction xT, engine xG and pass models). Shape documented in web/tools/ANALYSIS.md.
 * Pitch points are metres, 105 x 68. Shapes, networks and heat grids are drawn with the team
 * attacking toward x = 105; chance frames are raw engine coordinates with the side's attack_dir.
 */
export type Side = "home" | "away";
export type Unit = "gk" | "def" | "mid" | "att";
export type XY = [number, number];

export type TeamStats = {
  possession_pct: number;
  field_tilt_pct: number;
  passes: number;
  pass_pct: number;
  progressive_passes: number;
  offsides: number;
  ppda: number;
  regain_height_m: number | null;
  shots: number;
  on_target: number;
  goals: number;
  xg: number;
  xt: number;
  duels_won_pct: number;
  final_third_entries: { left: number; centre: number; right: number };
};

export type Bucket = {
  from_s: number;
  to_s: number;
  home_xt: number;
  away_xt: number;
  home_xg: number;
  away_xg: number;
  home_shots: number;
  away_shots: number;
  goals: { side: Side; second: number; player_id: string }[];
};

export type ShapePlayer = { id: string; x: number; y: number; unit: Unit };
export type Shape = { players: ShapePlayer[]; lines: Record<"def" | "mid" | "att", number>; depth_m: number; width_m: number };

export type LineRow = { from_s: number; home_line: number | null; home_depth: number | null; away_line: number | null; away_depth: number | null };

export type Network = { nodes: { id: string; x: number; y: number; passes: number }[]; edges: { a: string; b: string; n: number }[] };

export type PlayerStats = {
  id: string;
  side: Side;
  position: string;
  unit: Unit;
  touches: number;
  passes: number;
  pass_pct: number;
  progressive: number;
  key_passes: number;
  assists: number;
  shots: number;
  goals: number;
  xg: number;
  xt: number;
  duels_won: number;
  duels_lost: number;
  tackles: number;
  losses: number;
  rating: number;
  heat: number[][];
};

export type Option = { id: string; pass_p: number; xg: number; value: number; chosen?: boolean };
export type Reason = "better_pass" | "better_assist" | "earlier" | "crowded" | "long_range" | "tight_angle" | "pressured" | "big_chance";

export type Chance = {
  seq: number;
  second: number;
  period: number;
  side: Side;
  attack_dir: number;
  shooter: string;
  outcome: "goal" | "saved" | "blocked" | "off_target";
  xg: number;
  distance_m: number;
  angle_deg: number;
  blockers: number;
  nearest_m: number;
  score_before: [number, number];
  assist: { id: string; second: number; from: XY; to: XY } | null;
  build_up_s: number;
  reach: { id: string; t: number; m: number }[];
  xg_1s_before: number;
  assist_options: Option[];
  alternatives: Option[];
  reasons: Reason[];
  frames: { second: number; ball: XY; pos: XY[] }[];
};

export type Turnover = {
  second: number;
  side: Side;
  player_id: string;
  kind: "pass" | "duel";
  ball: XY;
  own_x: number;
  shot_second: number;
  shot_seq: number;
  xg_conceded: number;
  goal: boolean;
};

export type Insight = { key: string; side: Side | null; params: Record<string, number | string | null> };

export type Analysis = {
  match_id: string;
  score: [number, number];
  duration_s: number;
  bucket_s: number;
  models: Record<string, string>;
  xt_grid: number[][];
  teams: Record<Side, TeamStats>;
  momentum: Bucket[];
  shapes: Record<Side, { in: Shape; out: Shape }>;
  lines: LineRow[];
  networks: Record<Side, Network>;
  players: PlayerStats[];
  chances: Chance[];
  turnovers: Turnover[];
  mistakes: { goal_id: string; second: number; goal_second: number; player_id: string; bug: string; params: Record<string, number> }[];
  insights: Insight[];
  /** per-minute pitch control (21 x 14 cells, -100 away .. 100 home, home attacks x = 105) */
  territory?: { slice_s: number; nx: number; ny: number; control: number[][]; ball: [number, number, number][]; home_xt: number[]; away_xt: number[] };
};

export function useAnalysis(matchId = SHOWCASE_MATCH) {
  return useQuery<Analysis, Error>({
    queryKey: ["analysis", matchId],
    queryFn: async () => {
      const url = `${import.meta.env.BASE_URL}showcase/${matchId}/analysis.json`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${url} returned ${r.status}`);
      return r.json();
    },
    staleTime: Infinity,
  });
}
