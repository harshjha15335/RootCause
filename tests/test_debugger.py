from debugger import counterfactual, trace
from debugger.blame import blame_shares
from engine.models import EvidencePackage
from engine.simulate import Match


def test_blame_normalises_and_floors_negatives():
    shares = blame_shares(0.6, [0.1, 0.4, 0.7])
    assert shares[2] == 0.0
    assert abs(sum(shares) - 1.0) < 1e-9
    assert shares[0] > shares[1]


def test_blame_all_zero_when_no_fix_helps():
    assert blame_shares(0.2, [0.3, 0.2]) == [0.0, 0.0]


def _plan(seed=21):
    m = Match(seed).run(record_states=True)
    gi = next(i for i, e in enumerate(m.events) if e.type == "goal")
    return m, counterfactual.build_plan(m, gi, m.events[gi].clock_s - 8)


def test_goal_rate_is_deterministic_and_bounded():
    m, plan = _plan()
    a = counterfactual.goal_rate(plan, m.ctx, 30, seed=1)
    b = counterfactual.goal_rate(plan, m.ctx, 30, seed=1)
    assert a == b and 0.0 <= a <= 1.0


def test_goal_count_is_a_whole_count_matching_the_rate():
    m, plan = _plan()
    n = counterfactual.goal_count(plan, m.ctx, 40, seed=2)
    assert isinstance(n, int) and 0 <= n <= 40
    assert counterfactual.goal_rate(plan, m.ctx, 40, seed=2) == n / 40


def test_baseline_mostly_reproduces_the_goal():
    m, plan = _plan()
    assert counterfactual.goal_rate(plan, m.ctx, 50, seed=1) > 0.3


def test_trace_returns_valid_evidence():
    m = Match(21).run(record_states=True)
    goal = next(e for e in m.events if e.type == "goal")
    ev = trace(m, goal.seq, runs=20)
    assert isinstance(ev, EvidencePackage)
    assert ev.clock_s == goal.clock_s and ev.chain_start_s <= ev.clock_s
