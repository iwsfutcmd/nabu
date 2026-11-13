"""The compiler's lints (gameplan §7.5). Every lint has an id, a severity and a fixture in
pipeline/tests/fixtures/lints/<id>.yaml that makes it fire (tests/test_lints.py)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, NamedTuple

Severity = Literal["error", "warning", "info"]


class Loc(NamedTuple):
    file: str
    line: int


@dataclass(frozen=True)
class Lint:
    id: str
    severity: Severity
    stage: int
    description: str


_LINTS = [
    # 1 · parse
    Lint("parse.schema", "error", 1, "Source does not match schemas/course-source.schema.json."),
    Lint("parse.duplicate-id", "error", 1, "Two units, KCs, nodes or sentences share an id."),
    Lint(
        "parse.unknown-orthography",
        "error",
        1,
        "A form or drill names an orthography the course does not teach.",
    ),
    Lint(
        "parse.token-mismatch",
        "error",
        1,
        "Tokens do not spell out the form's text in order, or a word is left untokenized.",
    ),
    Lint(
        "parse.missing-asset", "error", 1, "An asset (a KC image) names a file that does not exist."
    ),
    # 2 · text hygiene
    Lint("text.not-nfc", "error", 2, "A string is not in NFC."),
    Lint(
        "text.invisible",
        "error",
        2,
        "Stray bidi control, BOM or zero-width character the profile does not allow.",
    ),
    Lint("text.splits-grapheme", "error", 2, "A token boundary falls inside a grapheme cluster."),
    Lint("text.script-audit", "error", 2, "A character outside the orthography's CLDR exemplars."),
    Lint(
        "text.punctuation-audit",
        "warning",
        2,
        "Punctuation from another writing system (e.g. ? instead of ؟).",
    ),
    Lint(
        "text.mixed-script",
        "error",
        2,
        "A word mixes scripts (UTS #39 confusables, e.g. Latin a in Cyrillic).",
    ),
    Lint(
        "text.non-canonical",
        "warning",
        2,
        "Content uses a character its own profile folds away (Arabic ي in Persian, ' for ʻ), "
        "or a presentation form (a ligature, an Arabic positional form) for what it stands for.",
    ),
    # 3 · enrichment
    Lint(
        "enrich.missing-reading",
        "error",
        3,
        "A word has no pinned reading for a ruby layer and the analyzer cannot supply one.",
    ),
    Lint(
        "enrich.reading-mismatch",
        "warning",
        3,
        "The analyzer disagrees with a pinned reading (pinned wins).",
    ),
    Lint(
        "enrich.ruby-unaligned",
        "error",
        3,
        "A reading's syllables do not line up with the word's characters.",
    ),
    Lint(
        "enrich.transliteration-mismatch",
        "info",
        3,
        "A pinned form differs from the CLDR transform (tok: the sitelen pona spelling) of the "
        "default orthography.",
    ),
    # 4 · drills
    Lint(
        "drills.rbnf-unavailable",
        "warning",
        4,
        "ICU has no RBNF spellout for this language; the drill is skipped.",
    ),
    # 5 · curriculum
    Lint(
        "curriculum.unknown-kc",
        "error",
        5,
        "A knowledge component is referenced but never defined.",
    ),
    Lint(
        "curriculum.unknown-node",
        "error",
        5,
        "A sentence or script track names a node that does not exist.",
    ),
    Lint(
        "curriculum.never-introduced", "error", 5, "A sentence uses a KC that no node introduces."
    ),
    Lint(
        "curriculum.introduced-late",
        "error",
        5,
        "A sentence uses a KC that is introduced only in a later node.",
    ),
    Lint(
        "curriculum.i-plus-one",
        "error",
        5,
        "A sentence brings in more new KCs than the course allows (default 1).",
    ),
    Lint("curriculum.cycle", "error", 5, "The prerequisite graph has a cycle."),
    Lint("curriculum.order", "error", 5, "A node introduces a KC before its prerequisites."),
    Lint("curriculum.unused-kc", "warning", 5, "A KC is defined but no sentence uses it."),
    Lint(
        "curriculum.one-gender",
        "warning",
        5,
        "Sentences tag a man speaking (or a man spoken to) and never a woman, or the other way"
        " round (ADR 0075).",
    ),
    # 6 · grading
    Lint("grading.accept-syntax", "error", 6, "An accept set does not parse (§7.4)."),
    Lint("grading.blowup", "warning", 6, "An accept set expands to too many answers."),
    Lint("grading.duplicate", "warning", 6, "Two alternatives are identical after normalization."),
    Lint(
        "grading.canonical-missing",
        "error",
        6,
        "The sentence itself is not accepted by its reverse set.",
    ),
    Lint(
        "grading.missing-reverse",
        "error",
        6,
        "A production sentence has no reverse accept set in some orthography.",
    ),
    # stories (Phase 6)
    Lint(
        "story.node",
        "error",
        5,
        "A story's node is missing or not of kind story, a story node has no story, or two "
        "stories share a node.",
    ),
    Lint(
        "story.missing-form",
        "error",
        1,
        "A story line, name, title or question lacks an orthography or support language.",
    ),
    Lint("story.speaker", "error", 1, "A line's speaker is not one of the story's characters."),
    Lint(
        "story.ahead",
        "warning",
        5,
        "A story uses a KC that a later node introduces (it is glossed, but not yet taught).",
    ),
    Lint(
        "story.question",
        "error",
        6,
        "A question cannot be answered as written: an answer out of range, options that read "
        "the same, a gap that is not exactly one word, a distractor without a form or that "
        "reads like the answer, or a line with one tile to arrange.",
    ),
    # roleplay scenario cards (Phase 8)
    Lint(
        "scenario.node",
        "error",
        5,
        "A roleplay scenario opens after a node that does not exist or is not a lesson or story.",
    ),
    Lint(
        "scenario.missing-text",
        "error",
        1,
        "A scenario's title, setting, character or goal lacks a support language.",
    ),
    # 2 · vowel marks (the course's vocalization, ADR 0053)
    Lint(
        "vocalization.mismatch",
        "error",
        2,
        "A vocalized form whose letters, without vowel marks, are not the word's.",
    ),
    Lint(
        "vocalization.ambiguous",
        "warning",
        2,
        "A word with several vocalizations and no `vocalized` of its own stays unmarked.",
    ),
    # 7 · glossary and segmentation simulation
    Lint(
        "kc.inflected-form",
        "error",
        7,
        "A KC form is a word the sentences analyse into several KCs: forms are lemmas (ADR 0061).",
    ),
    Lint(
        "glossary.dead-entry",
        "warning",
        7,
        "A glossary form is never reached by runtime longest-match segmentation.",
    ),
    Lint(
        "glossary.shadowed",
        "warning",
        7,
        "A word's own glossary entry loses to a longer overlapping entry.",
    ),
    Lint(
        "glossary.tile-split", "error", 7, "A word-bank tile boundary falls inside a runtime unit."
    ),
    Lint(
        "script.untaught-letter",
        "error",
        7,
        "An alphabet node's word uses a letter its track has not taught by then (ADR 0088).",
    ),
    Lint(
        "script.no-romanization",
        "error",
        7,
        "An alphabet node's orthography names no romanization (its profile's `romanize`), or has "
        "no profile for its Latin spellings (ADR 0088).",
    ),
    Lint(
        "script.missing-form",
        "error",
        7,
        "A script track uses an item lacking its orthography: a convert track's sentence, or an "
        "alphabet node's word.",
    ),
    # 9 · packaging
    Lint(
        "package.license",
        "error",
        9,
        "A content item has no SPDX license (and the course gives none).",
    ),
    Lint("package.provenance", "error", 9, "A content item has no provenance."),
    # 9 · audio (committed clips, audio/index.yaml)
    Lint("audio.schema", "error", 9, "audio/index.yaml does not match schemas/audio-index."),
    Lint(
        "audio.missing-file", "error", 9, "A clip's file is missing or does not match its sha256."
    ),
    Lint(
        "audio.human-required",
        "error",
        9,
        "Synthesized audio in a course whose audio must be recorded by people.",
    ),
    Lint("audio.unknown-item", "warning", 9, "A clip for a sentence or KC the course lacks."),
    Lint(
        "audio.stale",
        "warning",
        9,
        "A synthesized clip read something other than the voice reads now (a changed reading).",
    ),
    Lint("audio.timings", "error", 9, "Clip timings that do not fit the sentence's word tokens."),
    Lint(
        "audio.held-back",
        "info",
        9,
        "Clips that failed the round-trip check stay out of the bundle until reviewed.",
    ),
    Lint(
        "package.unreviewed-published",
        "error",
        9,
        "Published content without reviewedBy and reviewedAt.",
    ),
]
LINTS: dict[str, Lint] = {lint.id: lint for lint in _LINTS}


@dataclass(frozen=True)
class Diagnostic:
    lint: str
    message: str
    loc: Loc

    @property
    def severity(self) -> Severity:
        return LINTS[self.lint].severity

    def format(self) -> str:
        return f"{self.loc.file}:{self.loc.line}: {self.severity} {self.lint}: {self.message}"


@dataclass
class Diagnostics:
    items: list[Diagnostic] = field(default_factory=lambda: [])

    def report(self, lint: str, message: str, loc: Loc) -> None:
        if lint not in LINTS:
            raise KeyError(f"unregistered lint {lint}")
        self.items.append(Diagnostic(lint, message, loc))

    @property
    def errors(self) -> list[Diagnostic]:
        return [d for d in self.items if d.severity == "error"]

    def sorted(self) -> list[Diagnostic]:
        return sorted(self.items, key=lambda d: (d.loc.file, d.loc.line, d.lint, d.message))
