"""Shadow-mode calibration of the performance model (gameplan §9.3).

Every first try the planner predicted carries ``prediction: {p, model}``. This
module bins those predictions and compares them with what learners actually
did: a reliability table per model (optionally per template or course), the
Brier score, log loss and expected calibration error (ECE). §9.3 asks for this
curve to "look sane" before predictions drive the planner.

Input is JSONL learner events, one per line, as exported by the app ("Download
my learning data"), by the API (``GET /v1/events``) or by
``pnpm --filter @nabu/core simulate``.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path

import duckdb


class GroupBy(StrEnum):
    none = "none"
    template = "template"
    course = "course"


@dataclass(frozen=True)
class Bin:
    lo: float
    hi: float
    n: int
    predicted: float
    observed: float


@dataclass(frozen=True)
class Report:
    model: str
    group: str | None
    n: int
    predicted: float
    observed: float
    brier: float
    log_loss: float
    ece: float
    bins: tuple[Bin, ...]


# First tries with a logged prediction. A verdict counts as right when it is one of the
# CORRECT* kinds, as in @nabu/core (isCorrect).
_ANSWERS = """
select
  (json ->> '$.prediction.model') as model,
  (json ->> '$.exercise.template') as template,
  (json ->> '$.course') as course,
  greatest(1e-6, least(1 - 1e-6, (json ->> '$.prediction.p')::double)) as p,
  case when starts_with((json ->> '$.outcome.kind'), 'CORRECT') then 1 else 0 end as y
from read_ndjson_objects($paths)
where (json ->> '$.type') = 'answer_submitted'
  and (json ->> '$.attempt')::int = 1
  and (json -> '$.prediction') is not null
"""


def calibration(
    paths: Sequence[Path], bins: int = 10, group_by: GroupBy = GroupBy.none
) -> list[Report]:
    """Reliability reports, one per model (and group), sorted by model then group."""
    if bins < 2:
        raise ValueError("bins must be at least 2")
    con = duckdb.connect()
    con.execute(f"create temp table answers as {_ANSWERS}", {"paths": [str(p) for p in paths]})
    group = "null" if group_by is GroupBy.none else group_by.value
    totals = con.execute(
        f"""
        select model, {group} as grp, count(*) as n, avg(p), avg(y),
               avg((p - y) * (p - y)),
               -avg(y * ln(p) + (1 - y) * ln(1 - p))
        from answers group by all order by model, grp
        """
    ).fetchall()
    rows = con.execute(
        f"""
        select model, {group} as grp, least(floor(p * $bins), $bins - 1)::int as b,
               count(*) as n, avg(p), avg(y)
        from answers group by all order by model, grp, b
        """,
        {"bins": bins},
    ).fetchall()
    reports: list[Report] = []
    for model, grp, n, predicted, observed, brier, log_loss in totals:
        mine = [r for r in rows if r[0] == model and r[1] == grp]
        table = tuple(
            Bin(lo=b / bins, hi=(b + 1) / bins, n=k, predicted=mp, observed=mo)
            for _, _, b, k, mp, mo in mine
        )
        ece = sum(x.n / n * abs(x.predicted - x.observed) for x in table)
        reports.append(Report(model, grp, n, predicted, observed, brier, log_loss, ece, table))
    return reports


def format_report(report: Report) -> str:
    """A plain-text reliability table."""
    title = report.model if report.group is None else f"{report.model} · {report.group}"
    lines = [
        f"{title}: n={report.n}  p̂={report.predicted:.3f}  observed={report.observed:.3f}  "
        f"Brier={report.brier:.4f}  log loss={report.log_loss:.4f}  ECE={report.ece:.4f}",
        "    bin          n   predicted  observed",
    ]
    lines += [
        f"  {b.lo:.1f}–{b.hi:.1f}  {b.n:6d}   {b.predicted:8.3f}  {b.observed:8.3f}"
        for b in report.bins
    ]
    return "\n".join(lines)


# ---- Reliability diagram (SVG) -----------------------------------------------------------------
# Predicted p̂ against observed success per bin, with the diagonal of perfect calibration. Colours
# are roles (light and dark steps of a validated categorical palette); at most three models share a
# chart, the most that stay distinguishable for colour-blind readers as dots. Every marker has a
# tooltip, and format_report() prints the same numbers as a table.

_STYLE = """
.viz-root { color-scheme: light;
  --surface: #fcfcfb; --text-primary: #0b0b0b; --text-secondary: #52514e; --muted: #898781;
  --grid: #e1e0d9; --axis: #c3c2b7; --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; }
@media (prefers-color-scheme: dark) { .viz-root { color-scheme: dark;
  --surface: #1a1a19; --text-primary: #f0efec; --text-secondary: #c3c2b7; --muted: #898781;
  --grid: #2c2c2a; --axis: #383835; --s1: #3987e5; --s2: #d95926; --s3: #199e70; } }
text { font-family: system-ui, sans-serif; fill: var(--text-secondary); font-size: 12px; }
.title { fill: var(--text-primary); font-size: 15px; font-weight: 600; }
.muted { fill: var(--muted); }
"""


def _escape(text: str) -> str:
    return (
        text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    )


def reliability_svg(reports: Sequence[Report], min_n: int = 20) -> str:
    """A reliability diagram of up to three reports. Bins with fewer than `min_n` answers are
    hollow: their observed rate is noise."""
    shown = list(reports)[:3]
    size, left, top, right, bottom = 360, 56, 80, 24, 48
    width, height = left + size + right, top + size + bottom

    def x(p: float) -> float:
        return left + p * size

    def y(p: float) -> float:
        return top + (1 - p) * size

    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" class="viz-root" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" role="img" aria-labelledby="t d">',
        f"<style>{_STYLE}</style>",
        f'<rect width="{width}" height="{height}" fill="var(--surface)"/>',
    ]
    if len(shown) == 1:
        r = shown[0]
        title = f"Calibration of {r.model}: n={r.n}, ECE={r.ece:.3f}"
    else:
        title = "Calibration: " + ", ".join(f"{r.model} (ECE {r.ece:.3f})" for r in shown)
    out.append(f'<text id="t" class="title" x="{left}" y="24">{_escape(title)}</text>')
    out.append(
        f'<text id="d" x="{left}" y="44">Observed first-try success by predicted p̂.'
        f'<tspan x="{left}" dy="17">Hollow: bins with fewer than {min_n} answers.</tspan></text>'
    )
    for i in range(6):
        v = i / 5
        out.append(
            f'<line x1="{x(0)}" x2="{x(1)}" y1="{y(v)}" y2="{y(v)}" '
            f'stroke="var(--{"axis" if i == 0 else "grid"})" stroke-width="1"/>'
        )
        out.append(f'<line x1="{x(v)}" x2="{x(v)}" y1="{y(0)}" y2="{y(1)}" stroke="var(--grid)"/>')
        out.append(
            f'<text class="muted" x="{x(v)}" y="{y(0) + 18}" text-anchor="middle">{v:.1f}</text>'
        )
        out.append(
            f'<text class="muted" x="{x(0) - 8}" y="{y(v) + 4}" text-anchor="end">{v:.1f}</text>'
        )
    out.append(f'<text x="{x(0.5)}" y="{height - 8}" text-anchor="middle">Predicted p̂</text>')
    out.append(
        f'<text x="14" y="{y(0.5)}" text-anchor="middle" '
        f'transform="rotate(-90 14 {y(0.5)})">Observed success</text>'
    )
    # Perfect calibration: a recessive dashed diagonal, labelled once at its end.
    out.append(
        f'<line x1="{x(0)}" y1="{y(0)}" x2="{x(1)}" y2="{y(1)}" stroke="var(--muted)" '
        f'stroke-width="1.5" stroke-dasharray="4 4"/>'
    )
    lx, ly = x(0.22) + 6, y(0.22) + 6
    out.append(
        f'<text class="muted" x="{lx:.1f}" y="{ly:.1f}" '
        f'transform="rotate(-45 {lx:.1f} {ly:.1f})" dominant-baseline="hanging">'
        "perfect calibration</text>"
    )
    for s, r in enumerate(shown, start=1):
        colour = f"var(--s{s})"
        solid = [b for b in r.bins if b.n >= min_n]
        if len(solid) > 1:
            points = " ".join(f"{x(b.predicted):.1f},{y(b.observed):.1f}" for b in solid)
            out.append(
                f'<polyline points="{points}" fill="none" stroke="{colour}" stroke-width="2"/>'
            )
        for b in r.bins:
            fill = colour if b.n >= min_n else "var(--surface)"
            tip = (
                f"{r.model} · {b.lo:.1f}–{b.hi:.1f}: n={b.n}, "
                f"predicted {b.predicted:.3f}, observed {b.observed:.3f}"
            )
            cx, cy = f"{x(b.predicted):.1f}", f"{y(b.observed):.1f}"
            out.append(
                f"<g><title>{_escape(tip)}</title>"
                f'<circle cx="{cx}" cy="{cy}" r="12" fill="transparent"/>'
                f'<circle cx="{cx}" cy="{cy}" r="5" fill="{fill}" '
                f'stroke="var(--surface)" stroke-width="2"/>'
                f'<circle cx="{cx}" cy="{cy}" r="4" fill="none" '
                f'stroke="{colour}" stroke-width="1.5"/></g>'
            )
    if len(shown) > 1:  # legend: identity never by colour alone
        for s, r in enumerate(shown, start=1):
            ly = y(1) + 16 + 18 * s
            out.append(f'<circle cx="{x(0) + 12}" cy="{ly - 4}" r="5" fill="var(--s{s})"/>')
            out.append(f'<text x="{x(0) + 24}" y="{ly}">{_escape(r.model)}</text>')
    out.append("</svg>")
    return "\n".join(out) + "\n"
