"""Root Cause Debugger: causal chain + counterfactual blame. Plain Python, no AI.

Role 3 calls `trace(match, goal_event_index)` from the goal detector and passes the
EvidencePackage to the agents. Every number the agents say must come from it.
"""

from debugger.trace import trace  # noqa: F401
