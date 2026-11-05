"""Stories (gameplan §8.2 `story`, Phase 6): compile, check and package them.

A story is read at a path node of kind `story`. Its lines compile exactly like sentence forms
(tokens, readings, ruby, text hygiene, the script audit), in every orthography of the course, so
a learner reading Arabizi or Cyrillic gets the same story. Its questions:
- `choose`: a comprehension question in the support language;
- a line with `ask: complete`: choose the missing word (the KC at `gap`) among distractor KCs,
  shown by their forms in the learner's orthography;
- a line with `ask: arrange`: build the line from its tiles, given its translation.

Words are glossed on tap from the course glossary (KC forms) by the runtime longest-match
matcher; stage 7 counts story lines when it looks for dead glossary entries.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from nabu.compiler.source import Doc

if TYPE_CHECKING:
    from nabu.compiler.build import Ctx, Unit
    from nabu.schema.models import CourseSource, StoryChoiceSource, StoryLineSource, StorySource

WORD_KINDS = ("word", "number")
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


def line_item(story: str, step: int) -> str:
    """A story line's id among a course's audio items (and corrections): "<story>#<step>"."""
    return f"{story}#{step}"


def token_kcs(token: dict[str, Any]) -> list[str]:
    refs = [f"sense:{token['sense']}"] if "sense" in token else []
    refs += [token["_form"]] if "_form" in token else []
    refs += [m["kc"] for m in token.get("morphs", [])]
    return list(dict.fromkeys(refs))


def _public(tagged: dict[str, Any]) -> dict[str, Any]:
    return {
        **tagged,
        "tokens": [{k: v for k, v in t.items() if not k.startswith("_")} for t in tagged["tokens"]],
    }


class _Compiler:
    def __init__(self, ctx: Ctx, course: CourseSource, units: list[Unit]) -> None:
        from nabu.compiler.build import compile_form, marked, support_key, support_text

        self.ctx = ctx
        self.course = course
        self.compile_form: Callable[..., dict[str, Any] | None] = compile_form
        self.support_text: Callable[..., dict[str, Any]] = support_text
        self.marked: Callable[..., dict[str, Any]] = marked
        self.support_keys = [support_key(ctx, o) for o in course.support]
        self.support_by_key = dict(zip(self.support_keys, course.support, strict=True))
        self.nodes: dict[str, tuple[int, str]] = {}
        self.introduced: dict[str, int] = {}
        self.defined: set[str] = set()
        self.kc_forms: dict[str, dict[str, list[str]]] = {}
        position = 0
        for unit in units:
            for kc in unit.source.kcs:
                self.defined.add(kc.id)
                self.kc_forms[kc.id] = dict(kc.forms or {})
            for node in unit.source.nodes:
                self.nodes[node.id] = (position, node.kind)
                for kc in node.introduces or []:
                    self.introduced.setdefault(kc, position)
                position += 1

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
        self, story: StorySource, doc: Doc, base: Path, position: int, out: Stories
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
                line = self.line(story, step.line, doc, (*at, "line"), speakers, position, out, si)
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
        position: int,
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
        for kc in kcs:
            if kc not in self.defined:
                self.report(
                    "curriculum.unknown-kc", f"{story.id} uses {kc}, which is not defined", doc, at
                )
            elif kc not in self.introduced:
                self.report(
                    "curriculum.never-introduced",
                    f"{story.id} uses {kc}, which no node introduces",
                    doc,
                    at,
                )
            elif self.introduced[kc] > position:
                self.report(
                    "story.ahead",
                    f"{story.id} (node {story.node}) uses {kc} before the node that introduces it",
                    doc,
                    at,
                )
        bundle: dict[str, Any] = {
            "forms": {o: _public(t) for o, t in forms.items()},
            "translations": self.texts(
                dict(line.translations), f"{story.id}: a line", doc, (*at, "translations")
            ),
            "kcs": kcs,
        }
        if line.speaker is not None:
            bundle["speaker"] = line.speaker
        self.question(story, line, forms, doc, at, bundle)
        return bundle

    def question(
        self,
        story: StorySource,
        line: StoryLineSource,
        forms: dict[str, dict[str, Any]],
        doc: Doc,
        at: Path,
        bundle: dict[str, Any],
    ) -> None:
        def bad(message: str, *where: str) -> None:
            self.report("story.question", f"{story.id}: {message}", doc, (*at, *where))

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
        if line.gap is None or not line.distractors:
            bad("ask: complete needs a gap and distractors", "ask")
            return
        bundle["gap"] = line.gap
        bundle["distractors"] = list(line.distractors)
        for orth, tagged in forms.items():
            hits = [t for t in tagged["tokens"] if line.gap in token_kcs(t)]
            if len(hits) != 1:
                bad(
                    f"{len(hits)} words of the {orth} line are {line.gap}; the gap needs one", "gap"
                )
                continue
            answer = self.ctx.cli.result("fold-units", profile=orth, text=hits[0]["surface"])
            for kc in line.distractors:
                shown = self.kc_forms.get(kc, {}).get(orth)
                if kc not in self.defined or not shown:
                    bad(f"distractor {kc} has no {orth} form to show", "distractors")
                elif self.ctx.cli.result("fold-units", profile=orth, text=shown[0]) == answer:
                    bad(f"distractor {kc} reads like the answer in {orth}", "distractors")

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


def compile_stories(ctx: Ctx, course: CourseSource, units: list[Unit]) -> Stories:
    """Every unit's stories, compiled and checked; and every line form for stage 7."""
    c = _Compiler(ctx, course, units)
    out = Stories()
    told: dict[str, str] = {}  # story node → story id
    for ui, unit in enumerate(units):
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
            bundle = c.story(story, unit.doc, base, node[0], out)
            if bundle is not None:
                out.by_unit.setdefault(ui, []).append(bundle)
    for unit in units:
        for ni, n in enumerate(unit.source.nodes):
            if n.kind == "story" and n.id not in told:
                c.report("story.node", f"story node {n.id} has no story", unit.doc, ("nodes", ni))
    return out
