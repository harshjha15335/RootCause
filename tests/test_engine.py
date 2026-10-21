import itertools

import numpy as np

from engine.simulate import Match, summary


def _fingerprint(m: Match):
    return [(e.seq, e.type, e.player, e.outcome, round(float(e.ball[0]), 6)) for e in m.events]


def test_same_seed_same_match():
    a, b = Match(3).run(until_s=900), Match(3).run(until_s=900)
    assert _fingerprint(a) == _fingerprint(b)
    assert np.array_equal(a.state.pos, b.state.pos)


def test_different_seed_different_match():
    assert _fingerprint(Match(3).run(until_s=600)) != _fingerprint(Match(4).run(until_s=600))


def test_snapshot_resume_is_exact():
    m = Match(5).run(until_s=1200)
    snap = m.snapshot()
    n = len(m.events)
    m.run(until_s=1800)
    first = _fingerprint(m)[n:]
    end_pos = m.state.pos.copy()

    m.restore(snap)
    del m.events[n:]
    m.run(until_s=1800)
    assert _fingerprint(m)[n:] == first
    assert np.array_equal(m.state.pos, end_pos)


def test_full_match_shape():
    m = Match(6).run()
    assert m.state.finished
    events = m.match_events()  # validates every event against contract 1
    assert events[0].type == "kickoff" and events[-1].type == "full_time"
    seconds = {e.clock_s for e in events}
    assert seconds >= set(range(5400))  # at least one event every second
    assert all(a.seq < b.seq for a, b in itertools.pairwise(events))
    assert all(0 <= p.x <= 105 and 0 <= p.y <= 68 for e in events[::50] for p in e.players)
    s = summary(m.events)
    assert sum(s["score"]) == s["goals"]
