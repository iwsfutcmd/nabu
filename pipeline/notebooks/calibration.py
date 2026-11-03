# %% [markdown]
# # Calibration of the performance model (gameplan §9.3)
#
# Every first try the planner predicted carries `prediction: {p, model}` (shadow mode). This
# notebook compares those predictions with what learners did: a reliability table and diagram,
# Brier score, log loss and expected calibration error (ECE), overall and per template. §9.3 asks
# for this curve to look sane before predictions drive the planner.
#
# Open it as a notebook (VS Code, or Jupyter with Jupytext) or run it as a script:
#
#     cd pipeline && uv run python notebooks/calibration.py events.jsonl [more.jsonl …]
#
# Event logs (JSONL, one learner event per line) come from:
# - the app: "Download my learning data" on the home screen;
# - the API: `GET /v1/events?since=0` for an account, or `copy (select payload from events) to
#   stdout` in Postgres for a whole instance;
# - simulated learners, before any real ones exist:
#   `pnpm --filter @nabu/core simulate --out /tmp/simulated.jsonl`.

# %%
from __future__ import annotations

import sys
from pathlib import Path

from nabu.analytics.calibration import GroupBy, calibration, format_report, reliability_svg

paths = [Path(p) for p in sys.argv[1:] if not p.startswith("-")] or [Path("/tmp/simulated.jsonl")]
missing = [p for p in paths if not p.exists()]
if missing:
    sys.exit(f"no event log at {', '.join(map(str, missing))}: see the instructions at the top")

# %% [markdown]
# ## Overall: one reliability table per model

# %%
overall = calibration(paths, bins=10)
for report in overall:
    print(format_report(report), end="\n\n")

# %% [markdown]
# ## Per template
#
# A template whose observed rate sits well above its p̂ is easier than its prior says (and the
# reverse). The model learns template difficulty online, so large gaps here should shrink with data.

# %%
for report in calibration(paths, bins=5, group_by=GroupBy.template):
    gap = report.observed - report.predicted
    print(
        f"{report.group:28} n={report.n:5d}  p̂={report.predicted:.3f}  "
        f"observed={report.observed:.3f}  gap={gap:+.3f}  ECE={report.ece:.3f}"
    )

# %% [markdown]
# ## Reliability diagram
#
# Written next to the first log as `<name>.calibration.svg` (light and dark mode; tooltips on
# every bin).

# %%
out = paths[0].with_suffix(".calibration.svg")
out.write_text(reliability_svg(overall), encoding="utf-8")
print(f"wrote {out}")
