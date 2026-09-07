#!/usr/bin/env bash
# Run the floor fuzz suites and report how many distinct programs were executed against the
# settlement check. The number on the showcase page comes from here and from nowhere else.
#
# Counts only the suites that actually assert the floor property. A run of an unrelated fuzz test
# is not a hostile program, and inflating the number with them would make the headline figure a lie
# that is trivial to check.
set -euo pipefail

RUNS="${FUZZ_RUNS:-5000}"
cd "$(dirname "$0")/../contracts"
export PATH="$HOME/.foundry/bin:$PATH"
export FOUNDRY_FUZZ_RUNS="$RUNS"

forge test --match-path 'test/subfloor/*' --json > /tmp/fuzz-campaign.json 2>/dev/null || {
  echo '{"ok":false,"reason":"forge test failed"}'
  exit 1
}

python3 - <<'PY'
import json

COUNTED = {
    "testFuzz_noProgramSettlesAnyRecipientBelowItsFloor",
    "testFuzz_quoteAndSwapAlwaysAgree",
    "testFuzz_hostileExtructionCannotSettleBelowAFloor",
    "testFuzz_hostileExtructionKeepsQuoteAndSwapInAgreement",
}

d = json.load(open("/tmp/fuzz-campaign.json"))
total, failed, detail = 0, 0, {}
for suite, info in d.items():
    for name, res in (info.get("test_results") or {}).items():
        base = name.split("(")[0]
        if res.get("status") != "Success":
            failed += 1
        if base in COUNTED:
            runs = ((res.get("kind") or {}).get("Fuzz") or {}).get("runs", 0)
            total += runs
            detail[base] = detail.get(base, 0) + runs

print(json.dumps({"ok": failed == 0, "failed": failed, "programs": total, "detail": detail}))
PY
