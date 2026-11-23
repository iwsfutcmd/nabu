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
    Lint(
        "parse.schema",
        "error",
        1,
        "A course, a unit or its language's lexicon does not match its schema, or the lexicon "
        "is not there.",
    ),
    Lint(
        "parse.duplicate-id",
        "error",
        1,
        "Two units, nodes, sentences or letters of a course, or two lexemes of a lexicon, share "
        "an id.",
    ),
    Lint(
        "parse.token-lexemes",
        "error",
        1,
        "A token names its one lexeme and lists several, or has feature values and no lexeme to "
        "have them: it names one, or lists them.",
    ),
    Lint(
        "parse.token-relation",
        "error",
        1,
        "A token's relation does not hold together: a head with no relation or the other way "
        "round, a number out of order, or a head the form does not number.",
    ),
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
        "parse.missing-asset",
        "error",
        1,
        "An asset (a lexeme's picture) names a file that does not exist.",
    ),
    Lint(
        "lexicon.kind",
        "error",
        1,
        "A lexicon entry is not one kind of lexeme: it has a part of speech, or is a value head "
        "(`realises`), or a function head (`head`), one of the three (ADR 0145).",
    ),
    Lint(
        "lexicon.form",
        "error",
        1,
        "A form of an entry says nothing of how it is written, or is listed with no statement "
        "that the language has no rule for it (ADR 0145).",
    ),
    Lint(
        "lexicon.undeclared",
        "error",
        1,
        "A feature value, a class, a variety or a register is named that the language does not "
        "declare (lexicons/<lang>/language.yaml).",
    ),
    Lint(
        "lexicon.order",
        "error",
        1,
        "A lexicon is not sorted by id: an entry's place never moves, so a diff shows only what "
        "changed.",
    ),
    Lint(
        "course.names",
        "warning",
        1,
        "The course has no name in a support language, or names an orthography it does not teach"
        " (ADR 0109).",
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
        "reading.inconsistent",
        "error",
        3,
        "Words annotated alike (spelling, lexemes, the values chosen on each) read two ways, in a "
        "course that has switched the check on (`consistentReadings`, ADR 0135).",
    ),
    Lint(
        "reading.inconsistent-pending",
        "warning",
        3,
        "Words annotated alike read two ways, in a course that has not switched the check on yet "
        "(ADR 0135): annotate what tells them apart, or mark a free variant `readingVariant`.",
    ),
    Lint(
        "reading.bound",
        "error",
        3,
        "A reading marks its word bound to the next (the scheme's `bound`: the Tiberian reading's "
        "final hyphen) where the text does not bind it, or does not where it does (ADR 0135).",
    ),
    Lint(
        "reading.spelling",
        "error",
        3,
        "A reading does not spell its word, in a scheme whose readings do (Attic: the reading "
        "without its vowel lengths, ADR 0135).",
    ),
    Lint(
        "projection.unaccounted",
        "warning",
        3,
        "A token's pinned reading, in a scheme stated `of` its orthography (ADR 0148), is one its "
        "statement cannot relate to the token's spelling (`reading-spells`): a reading or a "
        "correspondence for a reviewer to look at. The review list; it never fails a build.",
    ),
    Lint(
        "form.projection",
        "warning",
        3,
        "A lexeme's stored lexical form (or an allomorph's) does not spell, by an orthography's "
        "`spell` statement, as the lexicon's first spelling there nor as one of the statement's "
        "free alternatives; or its vocalization layer's spelling is not the course's vocalization "
        "of that spelling (docs/rules-design.md, stage 1). A form, a spelling or a rule for a "
        "reviewer to look at: never mended by changing one to fit. A verb's radicals are checked "
        "in its citation cell (its own `citation`, else its category's), as the rules realise it.",
    ),
    Lint(
        "form.unaccounted",
        "error",
        3,
        "A token of the course, in a language with realisation rules, is written otherwise than "
        "the rules give: its lexemes realised in the values chosen on each (an uninflected word in "
        "its citation cell; forms that pin spellings only passed over), then spelled by its "
        "orthography's `spell` statement, is neither what the course writes there nor a free "
        "alternative of it, nor the course's vowel marks for it; and no pinned or listed form of "
        "its lexeme gives it (docs/rules-design.md, stage 3). Settle it: the rule, a listed form "
        "with its statement, the course's minority spelling, or a pinned form (rule debt); never a "
        "rule bent to fit one token.",
    ),
    Lint(
        "form.pinned-differs",
        "error",
        3,
        "A pinned form of a lexeme pins a spelling that no token of the course writes of that "
        "lexeme in a cell with the form's values (letters compared without the vowel marks the "
        "orthography may leave out): a copy of the course that no longer is one "
        "(docs/rules-design.md, section 5).",
    ),
    Lint(
        "form.redundant",
        "warning",
        3,
        "A pinned form whose cell the rules give, with every pinned form passed over, in each "
        "spelling it pins: it can go (`nabu forms prune <lexicon>`; docs/rules-design.md, "
        "section 5).",
    ),
    Lint(
        "form.spelling-script",
        "warning",
        3,
        "A paradigm's form (docs/rules-design.md, stage 4) whose spelling has characters outside "
        "its orthography's script, as the script audit has it: not shipped (null in the paradigm, "
        "left out of `regularised`). A `spell` rule or a realisation rule is missing.",
    ),
    Lint(
        "form.rule-debt",
        "info",
        3,
        "The pinned forms a language with realisation rules keeps: forms its rules do not give yet "
        "(ADR 0145: stored and checked, never counted, never a learner's part), counted per "
        "language with the lexemes that keep them.",
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
        "curriculum.unknown",
        "error",
        5,
        "A node, a sentence or a story names a lexeme its language's lexicon does not have, a "
        "feature value it does not declare, a rule it does not name, or a letter no unit lists.",
    ),
    Lint(
        "curriculum.unknown-node",
        "error",
        5,
        "A sentence or script track names a node that does not exist.",
    ),
    Lint(
        "curriculum.never-introduced",
        "error",
        5,
        "A sentence writes a lexeme or names a rule that no node introduces.",
    ),
    Lint(
        "curriculum.introduced-late",
        "error",
        5,
        "A sentence writes a lexeme or names a rule that only a later node introduces.",
    ),
    Lint(
        "curriculum.i-plus-one",
        "error",
        5,
        "A sentence brings in more new lexemes, feature values and rules than the course allows "
        "(default 1).",
    ),
    Lint(
        "curriculum.unused",
        "warning",
        5,
        "A node introduces a lexeme, a feature value or a rule that no sentence uses.",
    ),
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
        "A story writes a lexeme or names a rule that a later node introduces (it is glossed, but "
        "not yet taught).",
    ),
    Lint(
        "story.question",
        "error",
        6,
        "A question cannot be answered as written: an answer out of range, options that read "
        "the same, a gap that is not exactly one word, a distractor without a form or that "
        "reads like the answer, or a line with one tile to arrange.",
    ),
    Lint(
        "story.distractor-form",
        "error",
        6,
        "A story question's wrong option is not a word the course writes in its unit or an "
        "earlier one (ADR 0132): no word of the distractor's sense in the gap's form (asks word), "
        "or not two other forms of the gap's word (asks form).",
    ),
    Lint(
        "story.distractor-pos",
        "error",
        6,
        "A story word question offers a word of another part of speech or other UD features "
        "than the gap's (ADR 0132): grammar alone rules it out, so it asks less than it seems.",
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
        "lexeme.inflected-form",
        "error",
        7,
        "An entry is spelled as a token the sentences write with several lexemes: an entry is "
        "spelled as its lemma (ADR 0061).",
    ),
    Lint(
        "lexeme.reading",
        "error",
        7,
        "An entry's own reading (`readings`, ADR 0117) is one no token gives its word, is for a "
        "first spelling of several words, or is in a scheme no orthography it is spelled in pins.",
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
        "script.no-letter",
        "error",
        7,
        "A letter (`grapheme:`) whose first form has no letter, nor one letter carrying marks of "
        "the profile's mark set (a spacing breathing, a mark on nothing): it would be in every "
        "word (ADR 0124).",
    ),
    Lint(
        "script.no-reading-scheme",
        "error",
        7,
        "An alphabet node's orthography names no reading scheme with a Latin orthography for its "
        "track (its profile's `scriptTrack`, the scheme's `latin`), or that orthography has no "
        "profile (ADR 0133).",
    ),
    Lint(
        "script.missing-reading",
        "error",
        7,
        "An alphabet node's word whose lexeme has no reading pinned in the track's scheme: no "
        "sentence spells it, and its lexicon entry gives none (`readings`, ADR 0133).",
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
    Lint(
        "audio.unknown-item",
        "warning",
        9,
        "A clip for a sentence, a story line or a lexeme the course lacks.",
    ),
    Lint(
        "audio.stale",
        "warning",
        9,
        "A synthesized clip read something other than the voice reads now (a changed reading).",
    ),
    Lint(
        "audio.timings",
        "error",
        9,
        "Clip timings that do not fit the sentence's lexical tokens.",
    ),
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
