"""Stories (gameplan §8.2 `story`, Phase 6): compile, check and package them.

A story is read at a path node of kind `story`. Its lines compile exactly like sentence forms
(tokens, readings, ruby, text hygiene, the script audit), in every orthography of the course, so
a learner reading Arabizi or Cyrillic gets the same story. Its questions:
- `choose`: a comprehension question in the support language;
- a line with `ask: complete`: choose what is missing at `gap`, asking one thing (ADR 0132): which
  word (`asks: word`, the default: each distractor KC shown as the course writes it in the gap's
  form) or which form (`asks: form`: the gap's word in other forms the course writes). Options are
  words of sentences and story lines of the story's unit or earlier ones, resolved here;
- a line with `ask: arrange`: build the line from its tiles, given its translation.

Words are glossed on tap from the course glossary (KC forms) by the runtime longest-match
matcher; stage 7 counts story lines when it looks for dead glossary entries.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from nabu.compiler.source import Doc
from nabu.items import line_item

if TYPE_CHECKING:
    from nabu.compiler.build import Ctx, Unit
    from nabu.schema.models import (
        CourseSource,
        KnowledgeComponentSource,
        StoryChoiceSource,
        StoryLineSource,
        StorySource,
    )

Path = tuple[str | int, ...]


@dataclass
class LineForm:
    """A compiled line form, for the glossary simulation."""

    orthography: str
    tokens: list[dict[str, Any]]
    doc: Doc
    at: Path


@dataclass
class Stories:
    by_unit: dict[int, list[dict[str, Any]]] = field(default_factory=lambda: {})
    lines: list[LineForm] = field(default_factory=lambda: [])


def token_kcs(token: dict[str, Any]) -> list[str]:
    refs = [f"sense:{token['sense']}"] if "sense" in token else []
    refs += [token["form"]] if "form" in token else []
    refs += [m["kc"] for m in token.get("morphs", [])]
    return list(dict.fromkeys(refs))


def sense_kc(token: dict[str, Any]) -> str | None:
    return f"sense:{token['sense']}" if "sense" in token else None


def signature(token: dict[str, Any]) -> tuple[str, ...]:
    """A word's form signature (ADR 0132): its morph KCs but its sense, and its pinned form."""
    sense = sense_kc(token)
    kcs = {m["kc"] for m in token.get("morphs", []) if m["kc"] != sense}
    if "form" in token:
        kcs.add(token["form"])
    return tuple(sorted(kcs))


def _capitalized(surface: str) -> bool:
    return surface[:1] != surface[:1].lower()


@dataclass
class Attested:
    """A word the course writes: a token of a sentence or story line, in one orthography."""

    unit: int
    item: str
    token: dict[str, Any]
    lang: str


@dataclass
class _Pending:
    """A `complete` line whose options are resolved once every story line is compiled."""

    story: str
    line: StoryLineSource
    forms: dict[str, dict[str, Any]]
    doc: Doc
    at: Path
    bundle: dict[str, Any]
    unit: int
    item: str


def _option_token(token: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in token.items() if not k.startswith("_") and k != "tileGroup"}


def _public(tagged: dict[str, Any]) -> dict[str, Any]:
    return {
        **tagged,
        "tokens": [{k: v for k, v in t.items() if not k.startswith("_")} for t in tagged["tokens"]],
    }


class _Compiler:
    def __init__(
        self,
        ctx: Ctx,
        course: CourseSource,
        units: list[Unit],
        compiled_forms: dict[tuple[int, int], dict[str, dict[str, Any]]],
        undrilled: set[str],
    ) -> None:
        from nabu.compiler.build import compile_form, marked, support_key, support_text

        self.ctx = ctx
        self.undrilled = undrilled
        self.course = course
        self.compile_form: Callable[..., dict[str, Any] | None] = compile_form
        self.support_text: Callable[..., dict[str, Any]] = support_text
        self.marked: Callable[..., dict[str, Any]] = marked
        self.support_keys = [support_key(ctx, o) for o in course.support]
        self.support_by_key = dict(zip(self.support_keys, course.support, strict=True))
        self.nodes: dict[str, tuple[int, str]] = {}
        self.defined: set[str] = set()
        self.kc_forms: dict[str, dict[str, list[str]]] = {}
        self.kcs: dict[str, KnowledgeComponentSource] = {}
        # The words the course writes, by orthography, in course order (sentences, then story lines
        # as they compile): what a `complete` question's options are taken from (ADR 0132).
        self.attested: dict[str, list[Attested]] = {}
        self.pending: list[_Pending] = []
        self.unit = 0
        for ui, unit in enumerate(units):
            for si, sentence in enumerate(unit.source.sentences):
                if sentence.id.startswith("drill."):
                    continue
                for orth, tagged in compiled_forms.get((ui, si), {}).items():
                    self.attest(orth, ui, sentence.id, tagged)
        position = 0
        for unit in units:
            for kc in unit.source.kcs:
                self.defined.add(kc.id)
                self.kc_forms[kc.id] = dict(kc.forms or {})
                self.kcs[kc.id] = kc
            for node in unit.source.nodes:
                self.nodes[node.id] = (position, node.kind)
                position += 1

    def attest(self, orth: str, unit: int, item: str, tagged: dict[str, Any]) -> None:
        words = self.attested.setdefault(orth, [])
        tokens = [t for t in tagged["tokens"] if t.get("kind", "word") in ("word", "number")]
        senses = [t.get("sense") for t in tokens]
        for i, t in enumerate(tokens):
            # A word of a phrase KC (مع of مع السلامة, por of por favor) is only part of its sense:
            # alone, it is no option. A phrase's words stand next to each other with its sense.
            phrase = (i > 0 and senses[i - 1] == t.get("sense")) or (
                i + 1 < len(senses) and senses[i + 1] == t.get("sense")
            )
            if "sense" in t and not phrase:
                words.append(Attested(unit, item, t, str(tagged["lang"])))

    def report(self, lint: str, message: str, doc: Doc, at: Path) -> None:
        self.ctx.diags.report(lint, message, doc.loc(*at))

    def support_tt(self, key: str, text: str) -> dict[str, Any]:
        orth = self.support_by_key.get(key, self.course.support[0])
        return self.support_text(self.ctx, orth, text, self.course.target)

    def texts(self, texts: dict[str, str], what: str, doc: Doc, at: Path) -> dict[str, Any]:
        absent = [k for k in self.support_keys if k not in texts]
        if absent:
            self.report("story.missing-form", f"{what} has no {', '.join(absent)} text", doc, at)
        return {k: self.support_tt(k, t) for k, t in texts.items()}

    # ---------------------------------------------------------------- one story

    def story(
        self, story: StorySource, doc: Doc, base: Path, out: Stories
    ) -> dict[str, Any] | None:
        orths = list(self.course.orthographies)
        characters: list[dict[str, Any]] = []
        speakers: set[str] = set()
        for ci, character in enumerate(story.characters or []):
            if character.id in speakers:
                self.report(
                    "parse.duplicate-id",
                    f"{story.id}: character {character.id!r} twice",
                    doc,
                    (*base, "characters", ci),
                )
            speakers.add(character.id)
            names = dict(character.name)
            absent = [o for o in orths if o not in names]
            if absent:
                self.report(
                    "story.missing-form",
                    f"{story.id}: {character.id} has no name in {', '.join(absent)}",
                    doc,
                    (*base, "characters", ci, "name"),
                )
            characters.append(
                {
                    "id": character.id,
                    **({} if character.speaker is None else {"speaker": character.speaker}),
                    # A name takes its vowel marks as any word does (ADR 0053).
                    "name": {
                        o: self.marked(
                            self.ctx, o, self.support_text(self.ctx, o, n, self.course.target), None
                        )
                        for o, n in names.items()
                        if o in orths
                    },
                }
            )
        steps: list[dict[str, Any]] = []
        kcs: list[str] = []
        for si, step in enumerate(story.steps):
            at: Path = (*base, "steps", si)
            if step.line is not None:
                line = self.line(story, step.line, doc, (*at, "line"), speakers, out, si)
                if line is None:
                    return None
                kcs += [k for k in line["kcs"] if k not in kcs]
                steps.append({"line": line})
            elif step.choose is not None:
                steps.append({"choose": self.choose(story, step.choose, doc, (*at, "choose"))})
        provenance = story.provenance or self.course.provenance
        bundle: dict[str, Any] = {
            "id": story.id,
            "node": story.node,
            "title": self.texts(dict(story.title), f"{story.id}: the title", doc, (*base, "title")),
            "characters": characters,
            "steps": steps,
            "kcs": kcs,
            "license": story.license or self.course.license,
        }
        if provenance is not None:
            bundle["provenance"] = provenance.model_dump(exclude_none=True)
        return bundle

    def line(
        self,
        story: StorySource,
        line: StoryLineSource,
        doc: Doc,
        at: Path,
        speakers: set[str],
        out: Stories,
        step: int,
    ) -> dict[str, Any] | None:
        if line.speaker is not None and line.speaker not in speakers:
            self.report(
                "story.speaker",
                f"{story.id}: no character {line.speaker!r}",
                doc,
                (*at, "speaker"),
            )
        forms: dict[str, dict[str, Any]] = {}
        for orth, form in line.forms.items():
            if orth not in self.course.orthographies:
                self.report(
                    "parse.unknown-orthography",
                    f"{orth} is not one of the course's orthographies",
                    doc,
                    (*at, "forms", orth),
                )
                continue
            tagged = self.compile_form(self.ctx, self.course, doc, (*at, "forms", orth), form, orth)
            if tagged is None:
                return None
            forms[orth] = tagged
            out.lines.append(LineForm(orth, tagged["tokens"], doc, (*at, "forms", orth)))
            self.attest(orth, self.unit, line_item(story.id, step), tagged)
            # Voices read a line as written (ADR 0053): its audio item is "<story>#<step>".
            if any("_written" in t for t in tagged["tokens"]):
                self.ctx.written[(line_item(story.id, step), orth)] = [
                    str(t.get("_written", t["surface"])) for t in tagged["tokens"]
                ]
        absent = [o for o in self.course.orthographies if o not in line.forms]
        if absent:
            self.report(
                "story.missing-form",
                f"{story.id}: a line has no {', '.join(absent)} form",
                doc,
                (*at, "forms"),
            )
        kcs: list[str] = []
        for tagged in forms.values():
            for t in tagged["tokens"]:
                kcs += [k for k in token_kcs(t) if k not in kcs]
        # A KC no earlier node introduces is the passage's to introduce (ADR 0144): the curriculum
        # stage works those out. Only an undefined one is a mistake here.
        for kc in kcs:
            if kc not in self.defined:
                self.report(
                    "curriculum.unknown-kc", f"{story.id} uses {kc}, which is not defined", doc, at
                )
        bundle: dict[str, Any] = {
            "forms": {o: _public(t) for o, t in forms.items()},
            "translations": self.texts(
                dict(line.translations), f"{story.id}: a line", doc, (*at, "translations")
            ),
            # What the line practises: words not drilled (names) are glossed only (ADR 0144).
            "kcs": [kc for kc in kcs if kc not in self.undrilled],
        }
        if line.speaker is not None:
            bundle["speaker"] = line.speaker
        self.question(story, line, forms, doc, at, bundle, line_item(story.id, step))
        return bundle

    def question(
        self,
        story: StorySource,
        line: StoryLineSource,
        forms: dict[str, dict[str, Any]],
        doc: Doc,
        at: Path,
        bundle: dict[str, Any],
        item: str,
    ) -> None:
        def bad(message: str, *where: str) -> None:
            self.report("story.question", f"{story.id}: {message}", doc, (*at, *where))

        if line.ask != "complete" and line.asks is not None:
            bad("asks belongs to a line with ask: complete", "asks")
        if line.ask is None:
            if line.gap is not None or line.distractors:
                bad("gap and distractors belong to a line with ask: complete", "gap")
            return
        bundle["ask"] = line.ask
        if line.ask == "arrange":
            for orth, tagged in forms.items():
                groups = {t["tileGroup"] for t in tagged["tokens"] if "tileGroup" in t}
                if len(groups) < 2:
                    bad(f"nothing to arrange: the {orth} line is one tile", "ask")
            return
        # complete
        asks = line.asks or "word"
        if line.gap is None or (asks == "word" and not line.distractors):
            bad("ask: complete needs a gap and distractors", "ask")
            return
        bundle["gap"] = line.gap
        if line.distractors:
            bundle["distractors"] = list(line.distractors)
        whole = True
        for orth, tagged in forms.items():
            hits = [t for t in tagged["tokens"] if line.gap in token_kcs(t)]
            if len(hits) != 1:
                bad(
                    f"{len(hits)} words of the {orth} line are {line.gap}; the gap needs one", "gap"
                )
                whole = False
                continue
            if asks == "form":
                continue
            # Until a question resolves (story.distractor-form), the app shows a distractor by its
            # first form: it must have one, and read otherwise than the answer.
            answer = self.ctx.cli.result("fold-units", profile=orth, text=hits[0]["surface"])
            for kc in line.distractors or []:
                shown = self.kc_forms.get(kc, {}).get(orth)
                if kc not in self.defined or not shown:
                    bad(f"distractor {kc} has no {orth} form to show", "distractors")
                elif self.ctx.cli.result("fold-units", profile=orth, text=shown[0]) == answer:
                    bad(f"distractor {kc} reads like the answer in {orth}", "distractors")
        if whole and line.gap.startswith("sense:"):
            self.pending.append(_Pending(story.id, line, forms, doc, at, bundle, self.unit, item))
        elif whole:
            bad(f"the gap {line.gap} is not a word's sense: a question credits a sense", "gap")

    # ---------------------------------------------------------------- options (ADR 0132)

    def resolve(self, p: _Pending) -> None:
        """A `complete` line's wrong options, as words the course writes in the story's unit or an
        earlier one: each distractor's sense in the gap's form (asks word), or the gap's word in
        other forms (asks form). Each is chosen in the course's first orthography and taken from
        the same sentence or line in the others. Resolved, the bundle gets `asks` and `options`."""
        line = p.line
        asks = line.asks or "word"
        gap_kc = str(line.gap)
        orths = [o for o in self.course.orthographies if o in p.forms]
        gaps = {o: next(t for t in p.forms[o]["tokens"] if line.gap in token_kcs(t)) for o in orths}
        first = orths[0]
        gap = gaps[first]
        gap_sense = sense_kc(gap)
        gap_sig = signature(gap)
        shown_sig = " ".join(gap_sig) or "no form KC"

        def form_issue(message: str) -> None:
            self.report(
                "story.distractor-form", f"{p.story}: {message}", p.doc, (*p.at, "distractors")
            )

        def pool(orth: str) -> list[Attested]:
            return [a for a in self.attested.get(orth, []) if a.unit <= p.unit and a.item != p.item]

        def unlike(orth: str) -> Callable[[Attested], bool]:
            """Whether a word's capital differs from the gap's: case must not mark the answer."""
            cap = _capitalized(str(gaps[orth]["surface"]))
            return lambda a: _capitalized(str(a.token["surface"])) != cap

        def pick(orth: str, sense: str, sig: tuple[str, ...], item: str | None) -> Attested | None:
            """The word in `orth`: in another orthography, the same sentence's or line's word of
            that sense (Arabizi writes apart the article Arabic joins, so its form may differ);
            else one of that sense and form, the gap's case first."""
            mine = [a for a in pool(orth) if sense_kc(a.token) == sense]
            same = [a for a in mine if a.item == item]
            if same:
                return min(same, key=lambda a: (signature(a.token) != sig, unlike(orth)(a)))
            found = sorted((a for a in mine if signature(a.token) == sig), key=unlike(orth))
            return found[0] if found else None

        chosen: list[tuple[str, tuple[str, ...], str]] = []
        resolved = True
        if asks == "word":
            own = self.kcs.get(gap_sense or "")
            for kc in line.distractors or []:
                theirs = self.kcs.get(kc)
                if own is not None and theirs is not None and _other_kind(own, theirs):
                    self.report(
                        "story.distractor-pos",
                        f"{p.story}: {kc} is {_kind(theirs)}, the gap {line.gap} {_kind(own)}",
                        p.doc,
                        (*p.at, "distractors"),
                    )
                a = pick(first, kc, gap_sig, None)
                if a is None:
                    form_issue(
                        f"no word of {kc} in the gap's form ({shown_sig}) in its unit or earlier"
                    )
                    resolved = False
                    continue
                chosen.append((kc, gap_sig, a.item))
        else:
            if not gap_sig:
                form_issue(f"asks form, but the gap {gap['surface']} has no form KC to ask about")
                return
            mine = set(gap_sig)
            others = [
                a
                for a in pool(first)
                if sense_kc(a.token) == gap_sense and signature(a.token) != gap_sig
            ]

            def nearness(a: Attested) -> tuple[int, int]:
                sig = signature(a.token)
                return (-len(mine.intersection(sig)), abs(len(sig) - len(gap_sig)))

            others.sort(key=lambda a: (*nearness(a), unlike(first)(a)))
            if line.distractors:
                for kc in line.distractors:
                    with_it = [a for a in others if kc in signature(a.token)]
                    if not with_it:
                        form_issue(f"no form of {line.gap} with {kc} in its unit or earlier")
                        resolved = False
                        continue
                    chosen.append((gap_kc, signature(with_it[0].token), with_it[0].item))
            else:
                taken: set[tuple[str, ...]] = set()
                for a in others:
                    sig = signature(a.token)
                    if sig not in taken and len(chosen) < 2:
                        taken.add(sig)
                        chosen.append((gap_kc, sig, a.item))
                if len(chosen) < 2:
                    form_issue(
                        f"{len(chosen)} other forms of {line.gap} in its unit or earlier; "
                        "asks form needs two"
                    )
                    resolved = False
        if not resolved or not chosen:
            return
        options: list[dict[str, Any]] = []
        for sense, sig, item in chosen:
            per: dict[str, Any] = {}
            for orth in orths:
                a = pick(orth, sense, sig, item)
                if a is None:
                    form_issue(f"no {orth} word of {sense} in the form {' '.join(sig) or 'bare'}")
                    return
                per[orth] = {
                    "lang": a.lang,
                    "orthography": orth,
                    "tokens": [_option_token(a.token)],
                }
            options.append(per)
        for orth in orths:
            surfaces = [str(gaps[orth]["surface"])]
            surfaces += [str(option[orth]["tokens"][0]["surface"]) for option in options]
            folded = [self.ctx.cli.result("fold-units", profile=orth, text=t) for t in surfaces]
            if len(set(map(str, folded))) < len(folded):
                self.report(
                    "story.question",
                    f"{p.story}: two options read alike in {orth}: {', '.join(surfaces)}",
                    p.doc,
                    (*p.at, "distractors"),
                )
                return
        p.bundle["asks"] = asks
        p.bundle["options"] = options

    def choose(
        self, story: StorySource, choose: StoryChoiceSource, doc: Doc, at: Path
    ) -> dict[str, Any]:
        if choose.answer >= len(choose.options):
            self.report(
                "story.question",
                f"{story.id}: answer {choose.answer} but {len(choose.options)} options",
                doc,
                (*at, "answer"),
            )
        for key in self.support_keys:
            texts = [o.get(key, "").casefold().strip() for o in choose.options]
            if len(set(texts)) < len(texts):
                self.report(
                    "story.question",
                    f"{story.id}: two {key} options read the same",
                    doc,
                    (*at, "options"),
                )
        return {
            "prompt": self.texts(
                dict(choose.prompt), f"{story.id}: a question", doc, (*at, "prompt")
            ),
            "options": [
                self.texts(dict(o), f"{story.id}: an option", doc, (*at, "options", oi))
                for oi, o in enumerate(choose.options)
            ],
            "answer": choose.answer,
        }


def _other_kind(gap: KnowledgeComponentSource, other: KnowledgeComponentSource) -> bool:
    """Where both have a part of speech, whether it or their features differ (ADR 0132)."""
    if gap.pos is None or other.pos is None:
        return False
    return gap.pos != other.pos or dict(gap.features or {}) != dict(other.features or {})


def _kind(kc: KnowledgeComponentSource) -> str:
    features = ",".join(f"{k}={v}" for k, v in sorted((kc.features or {}).items()))
    return f"{kc.pos}{'[' + features + ']' if features else ''}"


def compile_stories(
    ctx: Ctx,
    course: CourseSource,
    units: list[Unit],
    compiled_forms: dict[tuple[int, int], dict[str, dict[str, Any]]] | None = None,
    undrilled: set[str] | None = None,
) -> Stories:
    """Every unit's stories, compiled and checked; and every line form for stage 7. A `complete`
    line's options are resolved once every line is compiled (they may come from any story of the
    unit or an earlier one)."""
    c = _Compiler(ctx, course, units, compiled_forms or {}, undrilled or set())
    out = Stories()
    told: dict[str, str] = {}  # story node → story id
    for ui, unit in enumerate(units):
        c.unit = ui
        for sti, story in enumerate(unit.source.stories or []):
            base: Path = ("stories", sti)
            node = c.nodes.get(story.node)
            if node is None or node[1] != "story":
                kind = "no such node" if node is None else f"a {node[1]} node"
                c.report(
                    "story.node", f"{story.id}: {story.node!r} is {kind}", unit.doc, (*base, "node")
                )
                continue
            if story.node in told:
                c.report(
                    "story.node",
                    f"{story.id}: node {story.node} already has story {told[story.node]}",
                    unit.doc,
                    (*base, "node"),
                )
                continue
            told[story.node] = story.id
            bundle = c.story(story, unit.doc, base, out)
            if bundle is not None:
                out.by_unit.setdefault(ui, []).append(bundle)
    for pending in c.pending:
        c.resolve(pending)
    for unit in units:
        for ni, n in enumerate(unit.source.nodes):
            if n.kind == "story" and n.id not in told:
                c.report("story.node", f"story node {n.id} has no story", unit.doc, ("nodes", ni))
    return out
