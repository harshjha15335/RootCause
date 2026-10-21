import pytest

from debugger import chain, counterfactual, fixes
from engine import pitch
from engine.mistakes import ELIGIBLE, inject_mistake, random_plant
from engine.models import GroundTruth


@pytest.fixture(scope="module")
def planted():
    return inject_mistake("LATE_STEP_UP", "A4", minute=20, seed=1004)


def test_plant_ends_in_a_goal_by_the_other_team(planted):
    m, gt = planted
    assert isinstance(gt, GroundTruth)
    goal = next(e for e in m.events if e.seq == gt.goal_seq)
    assert goal.type == "goal" and pitch.TEAM_CODES[goal.team] == gt.scoring_team
    assert (
        gt.scoring_team
        != pitch.TEAM_CODES[pitch.team_of(pitch.player_index(gt.root_cause_player_id))]
    )
    assert gt.planted_at_s <= gt.root_cause_clock_s < gt.goal_clock_s <= gt.planted_at_s + 25
    assert m.state.finished  # the match was played to full time
    metres = gt.params["metres_behind_line"]
    assert isinstance(metres, float) and 4.0 <= metres <= 6.0


def test_plant_is_deterministic(planted):
    _, gt = planted
    _, again = inject_mistake("LATE_STEP_UP", "A4", minute=20, seed=1004)
    assert again == gt


def test_history_carries_the_planted_override_before_it_starts(planted):
    m, gt = planted
    p = pitch.player_index(gt.root_cause_player_id)
    before = m.history[gt.planted_at_s - 1]
    o = next(o for o in before.overrides if o.bug == gt.bug and o.player == p)
    assert o.from_s == gt.planted_at_s
    assert before.active_overrides() == [x for x in before.overrides if x.from_s <= before.clock_s]


def test_fixing_the_planted_mistake_lowers_the_goal_chance(planted):
    m, gt = planted
    gi = next(i for i, e in enumerate(m.events) if e.seq == gt.goal_seq)
    plan = counterfactual.build_plan(m, gi, gt.root_cause_clock_s - 1)
    p = pitch.player_index(gt.root_cause_player_id)
    base = counterfactual.goal_rate(plan, m.ctx, 60, seed=1)
    fixed = counterfactual.goal_rate(
        plan,
        m.ctx,
        60,
        seed=1,
        intervention=fixes.make_intervention(
            chain.Candidate(gt.root_cause_clock_s, p, gt.bug), m.ctx
        ),
    )
    assert fixed < base


def test_ineligible_player_is_rejected():
    with pytest.raises(ValueError):
        inject_mistake("CROSS_NOT_BLOCKED", "H9", minute=10, seed=1)


def test_random_plant_picks_an_eligible_player():
    _, gt = random_plant(1003)
    assert pitch.player_index(gt.root_cause_player_id) % 11 in ELIGIBLE[gt.bug]
