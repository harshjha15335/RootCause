from eval.accuracy import report_md, summarise


def _case(bug, top1, player, innocent, abstained):
    return {
        "planted": True,
        "bug": bug,
        "top1": top1,
        "top1_player": player,
        "top3": top1,
        "innocent_blamed": innocent,
        "abstained": abstained,
        "trace_s": 1.0,
    }


def test_summary_counts_hits_misses_and_failed_plants():
    rows = [
        _case("LATE_STEP_UP", True, True, False, False),
        _case("LATE_STEP_UP", False, False, True, False),
        _case("MARKING_LOST", False, False, False, True),
        {"seed": 9, "planted": False},
    ]
    s = summarise(rows, seed=1, runs=20)
    assert (s["planted"], s["plant_failed"], s["top1_count"]) == (3, 1, 1)
    assert s["top1"] == 0.333 and s["abstained"] == 0.333
    assert s["by_bug"]["LATE_STEP_UP"] == {
        "n": 2,
        "top1": 0.5,
        "top1_player": 0.5,
        "top3": 0.5,
        "innocent_blamed": 0.5,
        "abstained": 0.0,
    }
    assert s["by_bug"]["DUEL_LOST"]["top1"] is None
    assert "**1 of 3**" in report_md(s)
