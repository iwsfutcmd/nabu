"""`nabu corrections apply` (ADR 0051): learners' corrections into the course source.

Reads corrections as JSON Lines (the review queue's GET /admin/v1/corrections.jsonl, or a
device's own export from the app) and edits each item's unit file in place, value by value, so
comments and formatting stay:

- **Readings**: a word's pinned reading in a scheme (Jyutping).
- **Text**: the form's `text`. Its tokens follow when every word is still there (a punctuation
  fix), or when each change falls inside one word (a spelling fix): that token's `surface`
  changes, and its reading is flagged if the correction did not also give one. A change that adds,
  removes or splits words, or falls in a token that writes several lexemes, needs new tokens, so
  it is left for a person, with the place.
- **Translation**: a sentence's first accepted translation, edited inside its accept notation when
  the change touches only plain text (`(Hello|Hi), Maryam!` keeps its alternatives); otherwise
  the line is replaced and the variants it accepted are flagged. A story line's, replaced.
- **Words** (ADR 0057): a lexeme's first spelling in an orthography (what word exercises show)
  and its gloss, in its language's lexicon (lexicons/<lang>/lexemes.yaml, or a one-file course's
  `own` lexicon). The item is the lexeme's id; an older correction names the id the word had
  before the lexical model, which the course's aliases.yaml turns into the lexeme's. Sentences
  and stories that write the word are listed to check, not changed. A word's reading comes from
  the sentences that pin it, so a reading correction is left for a person.

Every edit first checks that the source still says what the learner saw (`shown`); if not, the
correction is skipped with the reason, never applied to text it was not about. Nothing is dropped
silently: every row is either applied or listed with why not.
"""

from __future__ import annotations

import html
import json
import unicodedata
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, cast

import regex
import yaml

from nabu.notation import canonical_map, escape, literal
from nabu.schema.models import SentenceCorrection
from nabu.vocalization import unmarker
from nabu.yamlio import INVISIBLE, FlowList, dump

WORDISH = regex.compile(r"[\p{L}\p{M}\p{N}]")


# ------------------------------------------------------------------------------------- reading


def read_rows(path: Path) -> list[SentenceCorrection]:
    return [
        SentenceCorrection.model_validate(json.loads(line))
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


def _get(node: yaml.Node | None, key: str) -> yaml.Node | None:
    if not isinstance(node, yaml.MappingNode):
        return None
    for k, v in node.value:
        if isinstance(k, yaml.ScalarNode) and k.value == key:
            return v
    return None


def _items(node: yaml.Node | None) -> list[yaml.Node]:
    return list(node.value) if isinstance(node, yaml.SequenceNode) else []


def _scalar(node: yaml.Node | None) -> str | None:
    return str(node.value) if isinstance(node, yaml.ScalarNode) else None


def _graphemes(s: str) -> list[str]:
    return cast(list[str], regex.findall(r"\X", s))


# ------------------------------------------------------------------------------------- writing


def flow_scalar(value: str) -> str:
    """A string as a YAML scalar that is valid anywhere, flow collections included: plain when
    safe, quoted otherwise, invisibles as backslash-u escapes (yamlio)."""
    out = dump(FlowList([value]), width=10**9).strip()
    if out.endswith("..."):
        out = out[:-3].strip()
    return out[1:-1]


def inline_scalar(value: str) -> str:
    """A one-line string as a YAML scalar in block context (after `key: `): plain when safe."""
    out = dump({"k": value}, width=10**9)
    return out[len("k: ") :].rstrip("\n")


def block_scalar(value: str, indent: int) -> str:
    """A multi-line value as a literal block (one accept-set alternative per line), or
    double-quoted with escapes if it holds an invisible character."""
    if INVISIBLE.search(value) or "\n" not in value:
        return flow_scalar(value)
    pad = " " * indent
    return "|-\n" + "\n".join(f"{pad}{line}" if line else "" for line in value.split("\n"))


@dataclass(frozen=True)
class Edit:
    start: int
    end: int
    text: str


def _replace(
    node: yaml.Node, value: str, source: str, *, flow: bool, block_indent: int | None = None
) -> Edit:
    """Replace a scalar's value, keeping its style where the value allows: in a flow collection,
    a flow-safe scalar; in block context, plain when safe, and a literal block for several lines
    (`block_indent`: its content's indent). A block scalar's span runs past its last line: those
    line breaks stay."""
    if flow:
        text = flow_scalar(value)
    elif "\n" in value and block_indent is not None:
        text = block_scalar(value, block_indent)
    else:
        text = inline_scalar(value)
    span = source[node.start_mark.index : node.end_mark.index]
    trail = len(span) - len(span.rstrip("\n"))
    return Edit(node.start_mark.index, node.end_mark.index - trail, text)


def _flow(node: yaml.Node | None) -> bool:
    return bool(getattr(node, "flow_style", False))


def _apply_edits(text: str, edits: list[Edit]) -> str:
    for e in sorted(edits, key=lambda e: e.start, reverse=True):
        text = text[: e.start] + e.text + text[e.end :]
    return text


# ------------------------------------------------------------------------------------- locating


@dataclass
class Entry:
    """A sentence or a story step's `line` in its unit file, or a word (a lexeme) in its
    lexicon."""

    file: Path
    node: yaml.MappingNode
    line: int
    word: bool = False

    def where(self, root: Path) -> str:
        try:
            shown = self.file.relative_to(root).as_posix()
        except ValueError:
            shown = self.file.as_posix()
        return f"{shown}:{self.line}"


def locate(units: list[Path], texts: dict[Path, str], item: str, step: int | None) -> Entry | None:
    for file in units:
        root = cast(yaml.Node | None, yaml.compose(texts[file]))  # pyright: ignore[reportUnknownMemberType]
        if step is None:
            for s in _items(_get(root, "sentences")):
                if _scalar(_get(s, "id")) == item and isinstance(s, yaml.MappingNode):
                    return Entry(file, s, s.start_mark.line + 1)
        else:
            for story in _items(_get(root, "stories")):
                if _scalar(_get(story, "id")) != item:
                    continue
                steps = _items(_get(story, "steps"))
                line = _get(steps[step], "line") if 0 <= step < len(steps) else None
                return (
                    Entry(file, line, line.start_mark.line + 1)
                    if isinstance(line, yaml.MappingNode)
                    else None
                )
    return None


LEXEME = "lexeme:"


def lexicon_file(course: Path) -> tuple[Path, tuple[str, ...]] | None:
    """Where a course's words are kept, and where in that file the entries are: its language's
    lexemes.yaml, or a one-file course's own lexicon (course.yaml, under own, lexicon, lexemes)."""
    course_file = course / "course.yaml"
    if not course_file.is_file():
        return None
    data = yaml.safe_load(course_file.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return None
    data = cast(dict[str, Any], data)
    if isinstance(data.get("own"), dict):
        return course_file, ("own", "lexicon", "lexemes")
    code = data.get("lexicon")
    if not isinstance(code, str):
        return None
    from nabu.compiler.build import lexicons_dir

    return lexicons_dir(course_file) / code / "lexemes.yaml", ("lexemes",)


def lexeme_of(course: Path, item: str) -> str | None:
    """The lexeme a word's correction is about: its id, or the id it had before the lexical model
    (sense:ketab) as the course's aliases.yaml says it became one. None for an id that became no
    lexeme of its own (a form that is a token's feature values now, a lexeme's gender)."""
    if item.startswith(LEXEME):
        return item
    path = course / "aliases.yaml"
    if not path.is_file():
        return None
    table: Any = yaml.safe_load(path.read_text(encoding="utf-8"))
    found: Any = cast(dict[str, Any], table).get("aliases") if isinstance(table, dict) else None
    aliases = cast(dict[str, Any], found) if isinstance(found, dict) else {}
    alias = aliases.get(item)
    part = cast(dict[str, Any], alias).get("part") if isinstance(alias, dict) else None
    if isinstance(part, str) and part.startswith(LEXEME) and "|" not in part:
        return part
    return None


def locate_word(file: Path, text: str, at: tuple[str, ...], lexeme: str) -> Entry | None:
    """A lexeme's entry in a lexicon file."""
    node = cast(yaml.Node | None, yaml.compose(text))  # pyright: ignore[reportUnknownMemberType]
    for key in at:
        node = _get(node, key)
    for entry in _items(node):
        if _scalar(_get(entry, "id")) == lexeme and isinstance(entry, yaml.MappingNode):
            return Entry(file, entry, entry.start_mark.line + 1, word=True)
    return None


# ------------------------------------------------------------------------------------- tokens


def align(surfaces: list[str], text: str) -> list[tuple[int, int]] | None:
    """Where each token sits in `text`, left to right, with nothing but spaces and punctuation
    between them (as the compiler pairs tokens with text); None if they do not fit."""
    spans: list[tuple[int, int]] = []
    pos = 0
    for s in surfaces:
        at = text.find(s, pos)
        if at < 0 or WORDISH.search(text[pos:at]):
            return None
        spans.append((at, at + len(s)))
        pos = at + len(s)
    return None if WORDISH.search(text[pos:]) else spans


def retokenize(old: str, new: str, surfaces: list[str]) -> dict[int, str] | str:
    """New surfaces of the tokens a text change falls inside, by token index ({} when every word
    is unchanged), or why the tokens cannot follow."""
    if align(surfaces, new) is not None:
        return {}
    spans = align(surfaces, old)
    if spans is None:
        return "the source's tokens do not fit its text"
    og, ng = _graphemes(old), _graphemes(new)
    # Token spans in graphemes.
    starts = [0]
    for g in og:
        starts.append(starts[-1] + len(g))
    gspans = [(starts.index(a), starts.index(b)) for a, b in spans]
    changed: dict[int, list[tuple[int, int, int, int]]] = {}
    for tag, i1, i2, j1, j2 in SequenceMatcher(None, og, ng, autojunk=False).get_opcodes():
        if tag == "equal":
            continue
        inside = [
            k
            for k, (gs, ge) in enumerate(gspans)
            if (gs < i1 < ge if tag == "insert" else gs <= i1 and i2 <= ge and (i2 - i1) < ge - gs)
        ]
        if len(inside) != 1:
            return "the change adds, removes or splits words: its tokens need writing by hand"
        changed.setdefault(inside[0], []).append((i1, i2, j1, j2))
    out: dict[int, str] = {}
    for k, ops in changed.items():
        gs, ge = gspans[k]
        parts: list[str] = []
        at = gs
        for i1, i2, j1, j2 in ops:
            parts += og[at:i1] + ng[j1:j2]
            at = i2
        parts += og[at:ge]
        out[k] = "".join(parts)
    final = [out.get(k, s) for k, s in enumerate(surfaces)]
    if align(final, new) is None:
        return "the change adds, removes or splits words: its tokens need writing by hand"
    return out


# --------------------------------------------------------------------------------- translations


def edit_notation(line: str, new: str) -> str | None:
    """`line` with its canonical answer changed to `new`, edited inside the notation where every
    change touches only plain text; None when it cannot be."""
    old, spans = canonical_map(line)
    og, ng = _graphemes(old), _graphemes(new)
    edits: list[tuple[int, int, str]] = []
    for tag, i1, i2, j1, j2 in SequenceMatcher(None, og, ng, autojunk=False).get_opcodes():
        if tag == "equal":
            continue
        replacement = escape("".join(ng[j1:j2]), at_start=i1 == 0)
        if tag == "insert":
            left = spans[i1 - 1] if i1 > 0 else None
            right = spans[i1] if i1 < len(spans) else None
            if (i1 > 0 and left is None) or (i1 < len(spans) and right is None):
                return None
            if left is not None and right is not None and left[1] != right[0]:
                return None
            at = left[1] if left is not None else right[0] if right is not None else 0
            edits.append((at, at, replacement))
            continue
        covered = spans[i1:i2]
        if any(s is None for s in covered):
            return None
        first, last = cast(tuple[int, int], covered[0]), cast(tuple[int, int], covered[-1])
        if any(
            cast(tuple[int, int], covered[n])[0] != cast(tuple[int, int], covered[n - 1])[1]
            for n in range(1, len(covered))
        ):
            return None
        edits.append((first[0], last[1], replacement))
    out = line
    for start, end, text in sorted(edits, reverse=True):
        out = out[:start] + text + out[end:]
    return out


def _first_answer(accept: str) -> int | None:
    """Index of the accept set's first alternative line (comments and blanks skipped)."""
    for n, line in enumerate(accept.split("\n")):
        if line.strip() and not line.lstrip().startswith("#"):
            return n
    return None


# --------------------------------------------------------------------------------- applying


@dataclass
class Applied:
    row: SentenceCorrection
    where: str
    changes: list[str] = field(default_factory=lambda: [])
    checks: list[str] = field(default_factory=lambda: [])


@dataclass
class Skipped:
    row: SentenceCorrection
    reason: str
    where: str | None = None


@dataclass
class Outcome:
    applied: list[Applied] = field(default_factory=lambda: [])
    skipped: list[Skipped] = field(default_factory=lambda: [])
    files: dict[Path, str] = field(default_factory=lambda: {})
    """Edited unit and lexicon files and their new text."""


class Conflict(Exception):
    """The source no longer says what the learner saw, or the change cannot be made by itself."""


def _label(row: SentenceCorrection) -> str:
    return row.item if row.step is None else f"{row.item} step {row.step}"


def _apply_word(row: SentenceCorrection, entry: Entry, text: str) -> tuple[list[Edit], Applied]:
    """A word: its lexeme's first spelling in each orthography, and its gloss (ADR 0057)."""
    applied = Applied(row, "")
    edits: list[Edit] = []
    fixed, shown = row.correction, row.shown
    forms = _get(entry.node, "spelled")
    for orth, change in (fixed.forms or {}).items():
        if change.readings:
            raise Conflict(
                f"{orth}: a word's reading comes from the sentences that pin it: correct it there"
            )
        if change.text is None:
            continue
        listed = _items(_get(forms, str(orth)))
        first = listed[0] if listed else None
        current = _scalar(first)
        before = (shown.forms or {}).get(orth)
        if first is None or current is None or before is None or before.text is None:
            raise Conflict(f"no {orth} spelling in the lexicon")
        unmark = unmarker(str(orth))
        if unmark(_nfc(current)) != unmark(_nfc(before.text)):
            raise Conflict(f"the source changed since: {orth} now reads {current!r}")
        new = change.text
        if unmark(new) == unmark(current):
            raise Conflict(
                f"{orth}: only vowel marks changed: correct them in the course's vocalization"
            )
        if unmark(current) == current and unmark(new) != new:
            new = unmark(new)
            applied.checks.append(
                f"{orth}: the correction's vowel marks were left to the vocalization: "
                f"are they right? The learner wrote {change.text!r}"
            )
        edits.append(_replace(first, new, text, flow=_flow(_get(forms, str(orth)))))
        applied.changes.append(f"{orth} spelling: {current} → {new}")
        applied.checks.append(
            f"{orth}: sentences, stories, other spellings of the lexeme and the vocalization "
            f"that write {current!r} may need the same change"
        )
    if fixed.translation is not None:
        gloss = _get(entry.node, "gloss")
        node = _get(gloss, row.support)
        current = _scalar(node)
        if node is None or current is None:
            raise Conflict(f"no {row.support} gloss in the lexicon")
        if _nfc(current) != _nfc(shown.translation or ""):
            raise Conflict(f"the source changed since: the gloss now reads {current!r}")
        edits.append(_replace(node, fixed.translation, text, flow=_flow(gloss)))
        applied.changes.append(f"gloss: {current} → {fixed.translation}")
    if not edits:
        raise Conflict(
            "nothing to change: a note only" + (f" ({'; '.join(row.notes)})" if row.notes else "")
        )
    return edits, applied


def _apply_one(
    row: SentenceCorrection, entry: Entry, text: str, cli: Any
) -> tuple[list[Edit], Applied]:
    if entry.word:
        return _apply_word(row, entry, text)
    applied = Applied(row, "")
    edits: list[Edit] = []
    fixed = row.correction
    shown = row.shown
    forms = _get(entry.node, "forms")
    for orth, change in (fixed.forms or {}).items():
        form = _get(forms, str(orth))
        before = (shown.forms or {}).get(orth)
        if form is None or before is None:
            raise Conflict(f"no {orth} form in the source")
        # The app shows words with the vowel marks the course's vocalization adds (ADR 0053);
        # the source has the letters, so text is compared without them.
        unmark = unmarker(str(orth))
        text_node = _get(form, "text")
        current = _scalar(text_node)
        if (
            current is None
            or before.text is None
            or unmark(_nfc(current)) != unmark(_nfc(before.text))
        ):
            raise Conflict(f"the source changed since: {orth} now reads {current!r}")
        tokens = _items(_get(form, "tokens"))
        surfaces = [_scalar(_get(t, "surface")) or "" for t in tokens]
        read_fixed: set[int] = set()
        for r in change.readings or []:
            token = tokens[r.token] if r.token < len(tokens) else None
            was = next(
                (
                    b.reading
                    for b in before.readings or []
                    if b.token == r.token and b.scheme == r.scheme
                ),
                None,
            )
            reading_node = _get(_get(token, "readings"), str(r.scheme))
            if (
                token is None
                or unmark(surfaces[r.token]) != unmark(r.surface)
                or reading_node is None
            ):
                raise Conflict(
                    f"{orth}: no token {r.token} {r.surface!r} with a {r.scheme} reading"
                )
            if _scalar(reading_node) != was:
                raise Conflict(
                    f"the source changed since: {r.surface!r} now reads {_scalar(reading_node)!r}"
                )
            edits.append(_replace(reading_node, r.reading, text, flow=True))
            read_fixed.add(r.token)
            applied.changes.append(f"{orth} {r.surface}: {r.scheme} {was} → {r.reading}")
        if change.text is not None and text_node is not None:
            new = change.text
            if unmark(new) == unmark(current):
                raise Conflict(
                    f"{orth}: only vowel marks changed: correct them in the course's "
                    "vocalization, or give the word's token its own `vocalized`"
                )
            if unmark(current) == current and unmark(new) != new:
                # The source is unvocalized: the vocalization supplies the marks.
                new = unmark(new)
                applied.checks.append(
                    f"{orth}: the correction's vowel marks were left to the vocalization: "
                    f"are they right? The learner wrote {change.text!r}"
                )
            moved = retokenize(current, new, surfaces)
            if isinstance(moved, str):
                raise Conflict(f"{orth}: {moved}")
            edits.append(_replace(text_node, new, text, flow=_flow(form)))
            applied.changes.append(f"{orth} text: {current} → {new}")
            for k, surface in sorted(moved.items()):
                token = tokens[k]
                if _get(token, "lexemes") is not None:
                    raise Conflict(
                        f"{orth}: {surfaces[k]!r} writes several lexemes, each with its letters: "
                        "its token needs writing by hand"
                    )
                surface_node = _get(token, "surface")
                if surface_node is not None:
                    edits.append(_replace(surface_node, surface, text, flow=_flow(token)))
                applied.changes.append(f"{orth} token {k}: {surfaces[k]} → {surface}")
                readings = _get(token, "readings")
                if isinstance(readings, yaml.MappingNode) and k not in read_fixed:
                    pinned = ", ".join(f"{_scalar(key)} {_scalar(v)}" for key, v in readings.value)
                    applied.checks.append(f"{orth} {surface}: is the reading still {pinned}?")
            reverse = _scalar(_get(form, "reverse"))
            if reverse is not None:
                applied.checks.append(f"{orth}: does `reverse` still fit? It reads {reverse!r}")
    if fixed.translation is not None:
        translations = _get(entry.node, "translations")
        node = _get(translations, row.support)
        accept = _scalar(node)
        if node is None or accept is None:
            raise Conflict(f"no {row.support} translation in the source")
        # A block mapping can hold a literal block; a flow one ({en: ...}) cannot.
        column = _key_column(translations, row.support)
        block = None if column is None else column + 2
        flow = _flow(translations)
        if row.step is not None:
            if _nfc(accept) != _nfc(shown.translation or ""):
                raise Conflict(f"the source changed since: the translation now reads {accept!r}")
            edits.append(_replace(node, fixed.translation, text, flow=flow, block_indent=block))
            applied.changes.append(f"translation: {accept} → {fixed.translation}")
        else:
            lines = accept.split("\n")
            first = _first_answer(accept)
            display = (
                None
                if first is None
                else str(
                    cli.result("accept", profile=_support_orth(row.support), accept=accept)[
                        "canonicalSource"
                    ]
                )
            )
            if first is None or display is None or _nfc(display) != _nfc(shown.translation or ""):
                raise Conflict(f"the source changed since: the translation now reads {display!r}")
            edited = edit_notation(lines[first], fixed.translation)
            if edited is None:
                edited = literal(fixed.translation)
                applied.checks.append(
                    f"translation: replaced {lines[first]!r}; the variants it accepted are gone"
                )
            was = lines[first]
            lines[first] = edited
            edits.append(_replace(node, "\n".join(lines), text, flow=flow, block_indent=block))
            applied.changes.append(f"translation: {was} → {edited}")
    if not edits:
        raise Conflict(
            "nothing to change: a note only" + (f" ({'; '.join(row.notes)})" if row.notes else "")
        )
    return edits, applied


def _key_column(mapping: yaml.Node | None, key: str) -> int | None:
    if not isinstance(mapping, yaml.MappingNode):
        return None
    for k, _ in mapping.value:
        if isinstance(k, yaml.ScalarNode) and k.value == key:
            return k.start_mark.column
    return None


SUPPORT_ORTHOGRAPHIES = {"en": "en-Latn/standard"}


def _support_orth(key: str) -> str:
    return SUPPORT_ORTHOGRAPHIES.get(key, f"{key}-Latn/standard")


def apply(rows: list[SentenceCorrection], courses: Path, cli: Any) -> Outcome:
    """Applies each row in order to an in-memory copy of the unit and lexicon files
    (`Outcome.files`); a later row about an item an earlier one changed meets the changed text,
    and is skipped."""
    out = Outcome()
    texts: dict[Path, str] = {}
    root = courses.parent
    for row in rows:
        if row.status in ("rejected", "applied"):
            out.skipped.append(Skipped(row, f"status {row.status}"))
            continue
        units = sorted((courses / row.course / "units").glob("*.yaml"))
        if not units and not (courses / row.course / "course.yaml").is_file():
            out.skipped.append(Skipped(row, f"no course {row.course!r} in {courses}"))
            continue
        for u in units:
            texts.setdefault(u, u.read_text(encoding="utf-8"))
        entry = locate(units, texts, row.item, row.step)
        if entry is None and row.step is None:
            entry = _locate_word(courses / row.course, row.item, texts)
        if entry is None:
            out.skipped.append(Skipped(row, f"{_label(row)} is not in the course source"))
            continue
        where = entry.where(root)
        try:
            edits, applied = _apply_one(row, entry, texts[entry.file], cli)
        except Conflict as c:
            out.skipped.append(Skipped(row, str(c), where))
            continue
        texts[entry.file] = _apply_edits(texts[entry.file], edits)
        # The edited file must still read as YAML with the corrected values.
        yaml.safe_load(texts[entry.file])
        applied.where = where
        out.applied.append(applied)
        out.files[entry.file] = texts[entry.file]
    return out


def _locate_word(course: Path, item: str, texts: dict[Path, str]) -> Entry | None:
    """A word's entry, read from the text earlier rows left (a lexicon two corrections edit)."""
    lexeme = lexeme_of(course, item)
    found = lexicon_file(course)
    if lexeme is None or found is None or not found[0].is_file():
        return None
    file, at = found
    texts.setdefault(file, file.read_text(encoding="utf-8"))
    return locate_word(file, texts[file], at, lexeme)


# ------------------------------------------------------------------------------------- summary


def summary(outcome: Outcome) -> str:
    """What was applied and what was not, for a commit or pull request (language data in <bdi>)."""

    def b(s: str) -> str:
        return f"<bdi>{html.escape(s)}</bdi>"

    lines = ["## Apply corrections to the course source", ""]
    lines += ["Corrections learners made to sentences, story lines and words (ADR 0051).", ""]
    for a in outcome.applied:
        lines.append(
            f"- **{a.row.course} `{_label(a.row)}`** (`{a.where}`, {a.row.reports} learner(s))"
        )
        lines += [f"  - {b(c)}" for c in a.changes]
        lines += [f"  - check: {b(c)}" for c in a.checks]
        lines += [f"  - learner: {b(n)}" for n in a.row.notes]
    if outcome.skipped:
        lines += ["", "### Not applied", ""]
        for s in outcome.skipped:
            at = f" (`{s.where}`)" if s.where else ""
            lines.append(f"- {s.row.course} `{_label(s.row)}`{at}: {b(s.reason)}")
            lines += [f"  - learner: {b(n)}" for n in s.row.notes]
            if s.row.correction.forms or s.row.correction.translation:
                lines.append(f"  - suggested: {b(_suggested(s.row))}")
    lines += ["", "Correction ids, to mark applied once merged:", "", "```"]
    lines += [str(a.row.id) for a in outcome.applied]
    lines += ["```", ""]
    return "\n".join(lines)


def _suggested(row: SentenceCorrection) -> str:
    parts: list[str] = []
    for orth, f in (row.correction.forms or {}).items():
        if f.text is not None:
            parts.append(f"{orth}: {f.text}")
        parts += [f"{orth} {r.surface} {r.scheme} {r.reading}" for r in f.readings or []]
    if row.correction.translation is not None:
        parts.append(f"translation: {row.correction.translation}")
    return "; ".join(parts)
