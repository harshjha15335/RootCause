# analysis.json

Written by `tools/export_analysis.py` into `public/showcase/<match_id>/analysis.json`, read by the
Match analysis screen (`src/screens/Analysis.tsx`, types in `src/api/analysis.ts`). Derived from the
engine's own 90 minutes; it is a static file, not an API response, and adds no backend endpoint.

    pip install --target <dir> -r web/tools/requirements-analysis.txt
    PYTHONPATH=<dir> .venv/bin/python web/tools/export_analysis.py --match p-1008 --train 200

Units are metres on a 105 x 68 pitch and seconds of match clock.

| key | what |
|---|---|
| `score`, `duration_s`, `bucket_s` | final score, match length, bucket size for time series (300 s) |
| `models` | which model produced each number |
| `xt_grid` | socceraction Expected Threat grid (12 rows x 16 cols, row 0 = y high), fitted on `--train` simulated matches |
| `teams.<side>` | possession, field tilt, passes, progressive passes, PPDA, regain height, shots, xG, xT, duels, final-third entries by lane |
| `momentum[]` | per bucket: xT created, xG, shots, goals per side |
| `shapes.<side>.in/out` | average positions with and without the ball, the team attacking toward x = 105; unit line heights, block depth and width |
| `lines[]` | per bucket, out of possession: back-line distance from own goal and block depth |
| `networks.<side>` | average pass origin per player, and pairs with 4+ completed passes |
| `players[]` | touches, passes, progressive, key passes, assists, shots, xG, xT added, duels, tackles, losses, rating, 8 x 12 heat grid (attacking right) |
| `chances[]` | every shot: xG, distance, angle, blockers, nearest defender, assist, build-up time, time for the nearest defenders to reach the ball (engine press speed), xG one second earlier, the shooter's pass options and the assister's options (pass probability x receiver xG), reason codes, and 6 frames of raw engine positions (use `attack_dir`) |
| `turnovers[]` | build-up losses in a team's own half followed by an opponent shot within 25 s |
| `mistakes[]` | the planted mistake the Debugger traces (from `ground_truth.json`) |
| `insights[]` | `{key, side, params}` claims the screen turns into translated sentences |

Reason codes: `better_pass`, `better_assist`, `earlier`, `crowded`, `long_range`, `tight_angle`,
`pressured`, `big_chance`.
