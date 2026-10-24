# stacks.json (web/tools/export_stacks.py)

One file per demo match, read by the Match page (`useStacks` in src/api/analysis.ts) and, for the
pre-match dossier, by the Goal Autopsy. Built only from files the showcase export already wrote;
no engine or debugger maths. Regenerate: `python3 web/tools/export_stacks.py [match_id ...]`.

- `shape_stack.windows[]`: per 5 minutes, each player's average position with (`<side>_in`) and
  without (`<side>_out`) the ball, 11 per team, in the team's own frame (attacking toward x = 105).
- `shape_stack.teams.<side>`: `units`, per-window `metrics` (back line, width, depth, metres) and
  `bends`: a move of 5 m or more in the back line or block width, held 10 minutes. `next` compares
  the 15 minutes after with the 15 before; `verdict` is `conceded` (goal against), `worked` /
  `backfired` (expected goals against moved 0.15 or more) or `level`. Never a manager's reason.
- `chances[]`: every shot, its frame at the shot second (raw engine coordinates) and `best`, a
  team-mate whose pass success x shot value beat the shot by 0.01 expected goals or more.
- `goals[]`: in order. Traced goals carry the Debugger's `verdict` (culprit, blame, replays);
  the rest carry `honest`, the chance's own numbers.
- `moments.<player_id>[]`: goals, assists, shots with a better option, big misses, traced
  mistakes (with the culprit's position in the recorded fixed replay) and costly turnovers.
- `dossier.<side>`: formation, average shapes, line/width/depth/press/possession for this match,
  `usual` (mean of the other meetings), flat `line_usual_m` / `width_usual_m`, and `notes`:
  `{key, params}` facts (`line_higher`, `line_deeper`, `wider`, `narrower`, `press_higher`,
  `press_lower`, `more_ball`, `less_ball`, `as_usual`, `last_meeting`).
