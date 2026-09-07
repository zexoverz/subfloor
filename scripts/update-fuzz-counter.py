#!/usr/bin/env python3
"""Fold one campaign's result into the cumulative counter.

The counter only ever goes up, and it only counts campaigns that passed. A failed campaign is a
counterexample, which is a finding rather than a number to add — and a counter that grew during a
red run would be claiming coverage the suite did not have.
"""
import json
import sys
from datetime import datetime, timezone

result = json.loads(sys.argv[1])
path = "docs/fuzz-counter.json"
state = json.load(open(path))

if not result.get("ok"):
    print("campaign failed; counter left untouched", file=sys.stderr)
    sys.exit(1)

state["programs"] = state.get("programs", 0) + result["programs"]
state["campaigns"] = state.get("campaigns", 0) + 1
state["lastRun"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
state["lastCampaign"] = result["detail"]

json.dump(state, open(path, "w"), indent=2)
open(path, "a").write("\n")
print(f"programs={state['programs']} campaigns={state['campaigns']}")
