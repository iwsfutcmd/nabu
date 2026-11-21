"""Stories (gameplan §8.2 `story`, Phase 6): compile, check and package them.

A story is read at a path node of kind `story`. Its lines compile exactly like sentence forms
(tokens, readings, ruby, text hygiene, the script audit), in every orthography of the course, so
a learner reading Arabizi or Cyrillic gets the same story. Its questions:
- `choose`: a comprehension question in the support language;
- a line with `ask: complete`: choose what is missing at `gap`, asking one thing (ADR 0132): which
  lexeme (`asks: lexeme`, the default: each distractor lexeme shown as the course writes it in the
  gap's form) or which form (`asks: form`: the gap's lexeme in other forms the course writes).
  Options are tokens of sentences and story lines of the story's unit or earlier ones, resolved
  here;
- a line with `ask: arrange`: build the line from its tiles, given its translation.

Words are glossed on tap from the course glossary (its lexemes' spellings) by the runtime
longest-match matcher; stage 7 counts story lines when it looks for dead glossary entries.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any, cast

from nabu.compiler import tokens as tk
from nabu.compiler.source import Doc
from nabu.formkey import lexeme_form_key
from nabu.items import line_item
from nabu.lexicon import Language, kind_of

if TYPE_CHECKING:
    from nabu.compiler.build import Ctx, Taught, Unit
    from nabu.schema.models import Lexeme, StoryChoiceSource
    from nabu.schema.models import NextCourseSource as CourseSource
    from nabu.schema.models import NextStoryLineSource as StoryLineSource
    from nabu.schema.models import NextStorySource as StorySource

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


def signature(token: Mapping[str, Any], lang: Language) -> tuple[str, ...]:
    """A token's form signature (ADR 0132): everything it writes but which lexeme its base is.
    The feature values its base has there (those chosen on the token, and those its lexeme has
    of itself: a feminine noun stands with feminine nouns, whichever way each is feminine), and
    the other lexemes it writes with it (an ending, a clitic, an article), each with its own
    values. Two tokens with one signature differ only in their lexeme; two of one lexeme with
    different signatures only in their form."""
    base = tk.base_of(token)
    entry = None if base is None else lang.get(str(base["lexeme"]))
    chosen = tk.feats_of(base or {})
    has = chosen if entry is None else lang.effective(entry, chosen)
    said = [f"{name}={value}" for name, value in sorted(has.items())]
    others = [
        lexeme_form_key(str(part["lexeme"]), tk.feats_of(part))
        for part in tk.lexemes_of(token)
        if part is not base
    ]
    return (*sorted(others), *said)


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
        taught: Taught,
    ) -> None:
        from nabu.compiler.build import (
            compile_form,
            marked,
            parts_of,
            support_key,
            support_text,
        )

        self.ctx = ctx
        self.course = course
        self.parts_of: Callable[..., list[str]] = parts_of
        self.compile_form: Callable[..., dict[str, Any] | None] = compile_form
        self.support_text: Callable[..., dict[str, Any]] = support_text
        self.marked: Callable[..., dict[str, Any]] = marked
        self.support_keys = [support_key(ctx, o) for o in course.support]
        self.support_by_key = dict(zip(self.support_keys, course.support, strict=True))
        self.taught = taught
        self.nodes: dict[str, tuple[int, str]] = {}
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
        for unit in units:
            for node in unit.source.nodes:
                self.nodes[node.id] = (taught.node_pos[node.id], node.kind)

    def attest(self, orth: str, unit: int, item: str, tagged: dict[str, Any]) -> None:
        words = self.attested.setdefault(orth, [])
        tokens = [t for t in tagged["tokens"] if t.get("kind", "word") in ("word", "number")]
        senses = [tk.base_id(t) for t in tokens]
        for i, t in enumerate(tokens):
            # A token of a lexeme written as several (مع of مع السلامة, por of por favor) is only
            # part of it: alone, it is no option. Its tokens stand next to each other.
            phrase = senses[i] is not None and (
                (i > 0 and senses[i - 1] == senses[i])
                or (i + 1 < len(senses) and senses[i + 1] == senses[i])
            )
            if senses[i] is not None and not phrase:
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
        parts: list[str] = []
        for si, step in enumerate(story.steps):
            at: Path = (*base, "steps", si)
            if step.line is not None:
                line = self.line(story, step.line, doc, (*at, "line"), speakers, position, out, si)
                if line is None:
                    return None
                parts += [k for k in line["parts"] if k not in parts]
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
            "parts": parts,
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
        parts: list[str] = []
        for tagged in forms.values():
            self.parts_of(self.ctx, self.taught, position, tagged["tokens"], parts)
        introduced = self.taught.introduced
        for part in parts:
            if "|" in part:
                continue  # a lexeme's own part is taught with its lexeme
            if kind_of(part) == "lexeme" and part not in self.ctx.lang.index:
                self.report(
                    "curriculum.unknown",
                    f"{story.id} uses {part}, which the language's lexicon does not have",
                    doc,
                    at,
                )
            elif part not in introduced:
                self.report(
                    "curriculum.never-introduced",
                    f"{story.id} uses {part}, which no node introduces",
                    doc,
                    at,
                )
            elif introduced[part] > position:
                self.report(
                    "story.ahead",
                    f"{story.id} (node {story.node}) uses {part} before the node that introduces "
                    "it",
                    doc,
                    at,
                )
        bundle: dict[str, Any] = {
            "forms": {o: _public(t) for o, t in forms.items()},
            "translations": self.texts(
                dict(line.translations), f"{story.id}: a line", doc, (*at, "translations")
            ),
            "parts": parts,
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
        asks = line.asks or "lexeme"
        if asks == "use":
            # ADR 0147's third question: a contrast only a passage decides. It needs its language
            # to mark the contrast as context-only, which none declares yet.
            bad("asks: use is for a contrast its language marks as context-only; none does", "asks")
            return
        if line.gap is None or (asks == "lexeme" and not line.distractors):
            bad("ask: complete needs a gap and distractors", "ask")
            return
        gap = str(line.gap)
        bundle["gap"] = gap
        lang = self.ctx.lang
        whole = True
        for orth, tagged in forms.items():
            hits = [t for t in tagged["tokens"] if gap in tk.ids_of(t)]
            if len(hits) != 1:
                bad(f"{len(hits)} tokens of the {orth} line write {gap}; the gap needs one", "gap")
                whole = False
                continue
            if tk.base_id(hits[0]) != gap:
                bad(
                    f"{gap} is not the base of {hits[0]['surface']!r}: a question asks a token by "
                    "the lexeme its others are merged onto",
                    "gap",
                )
                whole = False
                continue
            if asks == "form":
                continue
            # A distractor is shown as the course writes it; it must have a spelling to be
            # one, and read otherwise than the answer.
            answer = self.ctx.cli.result("fold-units", profile=orth, text=hits[0]["surface"])
            for d in line.distractors or []:
                if not isinstance(d, str):
                    continue  # a built word is found among the course's tokens (resolve)
                entry = lang.get(d)
                shown = [] if entry is None else lang.spelled(entry, orth)
                if not shown:
                    bad(f"distractor {d} has no {orth} spelling to show", "distractors")
                elif self.ctx.cli.result("fold-units", profile=orth, text=shown[0]) == answer:
                    bad(f"distractor {d} reads like the answer in {orth}", "distractors")
        if whole:
            self.pending.append(_Pending(story.id, line, forms, doc, at, bundle, self.unit, item))

    # ---------------------------------------------------------------- options (ADR 0132)

    def resolve(self, p: _Pending) -> None:
        """A `complete` line's wrong options, as tokens the course writes in the story's unit or
        an earlier one: each distractor lexeme in the gap's form (asks lexeme), or the gap's
        lexeme in other forms (asks form). Each is chosen in the course's first orthography and
        taken from the same sentence or line in the others. Resolved, the bundle gets `asks` and
        `options`."""
        line = p.line
        asks = line.asks or "lexeme"
        gap_id = str(line.gap)
        orths = [o for o in self.course.orthographies if o in p.forms]
        gaps = {o: next(t for t in p.forms[o]["tokens"] if tk.base_id(t) == gap_id) for o in orths}
        first = orths[0]
        gap = gaps[first]
        lang = self.ctx.lang
        gap_sig = signature(gap, lang)
        shown_sig = " ".join(gap_sig) or "no form of its own"

        def form_issue(message: str) -> None:
            self.report(
                "story.distractor-form", f"{p.story}: {message}", p.doc, (*p.at, "distractors")
            )

        def pool(orth: str) -> list[Attested]:
            return [a for a in self.attested.get(orth, []) if a.unit <= p.unit and a.item != p.item]

        def unlike(orth: str) -> Callable[[Attested], bool]:
            """Whether a token's capital differs from the gap's: case must not mark the answer."""
            cap = _capitalized(str(gaps[orth]["surface"]))
            return lambda a: _capitalized(str(a.token["surface"])) != cap

        def pick(orth: str, what: Wanted, item: str | None) -> Attested | None:
            """The token in `orth`: in another orthography, the same sentence's or line's token
            of that lexeme (Arabizi writes apart the article Arabic joins, so its form may
            differ); else one of that lexeme and form, the gap's case first."""
            mine = [a for a in pool(orth) if what.is_of(a.token)]
            same = [a for a in mine if a.item == item]
            if same:
                return min(
                    same, key=lambda a: (signature(a.token, lang) != what.sig, unlike(orth)(a))
                )
            found = sorted((a for a in mine if what.fits(a.token, lang)), key=unlike(orth))
            return found[0] if found else None

        chosen: list[tuple[Wanted, str]] = []
        resolved = True
        if asks == "lexeme":
            own = lang.get(gap_id)
            for d in line.distractors or []:
                if isinstance(d, dict):
                    form_issue(
                        "asks which lexeme, and a distractor is feature values: those are "
                        "another form of the gap's own"
                    )
                    resolved = False
                    continue
                ids = [str(x) for x in d] if isinstance(d, list) else [str(d)]
                name = "+".join(ids)
                theirs = lang.get(ids[0]) if len(ids) == 1 else None
                if own is not None and theirs is not None and _other_kind(lang, own, theirs):
                    self.report(
                        "story.distractor-pos",
                        f"{p.story}: {name} is {_kind(lang, theirs)}, "
                        f"the gap {gap_id} {_kind(lang, own)}",
                        p.doc,
                        (*p.at, "distractors"),
                    )
                # A built word is offered whole, as a token writes its lexemes in that order;
                # another lexeme, in the gap's form.
                wanted = Wanted(ids, None if len(ids) > 1 else gap_sig)
                a = pick(first, wanted, None)
                if a is None:
                    form_issue(
                        f"no token of {name} in the gap's form ({shown_sig}) in its unit or earlier"
                    )
                    resolved = False
                    continue
                chosen.append((Wanted(ids, signature(a.token, lang)), a.item))
        else:
            if not gap_sig:
                form_issue(f"asks form, but the gap {gap['surface']} has no form to ask about")
                return
            mine = set(gap_sig)
            others = [
                a
                for a in pool(first)
                if tk.base_id(a.token) == gap_id and signature(a.token, lang) != gap_sig
            ]

            def nearness(a: Attested) -> tuple[int, int]:
                sig = signature(a.token, lang)
                return (-len(mine.intersection(sig)), abs(len(sig) - len(gap_sig)))

            others.sort(key=lambda a: (*nearness(a), unlike(first)(a)))

            def reads(surface: object) -> str:
                return str(self.ctx.cli.result("fold-units", profile=first, text=str(surface)))

            # Two options must not read alike (פָּנַי beside פְּנֵי, apart only by their points): a
            # form that reads like the answer or like an option already chosen is passed over.
            read = {reads(gap["surface"])}
            if line.distractors:
                for d in line.distractors:
                    with_it = [a for a in others if _has(a.token, d, lang)]
                    if not with_it:
                        form_issue(f"no form of {gap_id} with {_show(d)} in its unit or earlier")
                        resolved = False
                        continue
                    apart = next(
                        (a for a in with_it if reads(a.token["surface"]) not in read), None
                    )
                    a = apart or with_it[0]
                    read.add(reads(a.token["surface"]))
                    chosen.append((Wanted([gap_id], signature(a.token, lang)), a.item))
            else:
                taken: set[tuple[str, ...]] = set()
                for a in others:
                    sig = signature(a.token, lang)
                    if (
                        sig not in taken
                        and len(chosen) < 2
                        and reads(a.token["surface"]) not in read
                    ):
                        taken.add(sig)
                        read.add(reads(a.token["surface"]))
                        chosen.append((Wanted([gap_id], sig), a.item))
                if len(chosen) < 2:
                    form_issue(
                        f"{len(chosen)} other forms of {gap_id} in its unit or earlier; "
                        "asks form needs two"
                    )
                    resolved = False
        if not resolved or not chosen:
            return
        options: list[dict[str, Any]] = []
        for wanted, item in chosen:
            per: dict[str, Any] = {}
            for orth in orths:
                a = pick(orth, wanted, item)
                if a is None:
                    form_issue(
                        f"no {orth} token of {'+'.join(wanted.ids)} in the form "
                        f"{' '.join(wanted.sig or ()) or 'bare'}"
                    )
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


@dataclass(frozen=True)
class Wanted:
    """An option to find among the course's tokens: a lexeme in a form (its signature), or a
    token built of several lexemes, written in that order."""

    ids: list[str]
    sig: tuple[str, ...] | None

    def is_of(self, token: Mapping[str, Any]) -> bool:
        if len(self.ids) > 1:
            return tk.ids_of(token) == self.ids
        return tk.base_id(token) == self.ids[0]

    def fits(self, token: Mapping[str, Any], lang: Language) -> bool:
        return self.is_of(token) and (self.sig is None or signature(token, lang) == self.sig)


def _has(token: Mapping[str, Any], distractor: object, lang: Language) -> bool:
    """Whether a form of the gap's lexeme is the one a distractor names: a lexeme written with
    it (an ending), or feature values it has there (chosen, or its lexeme's own)."""
    base = tk.base_of(token)
    if isinstance(distractor, str):
        return any(p["lexeme"] == distractor for p in tk.lexemes_of(token) if p is not base)
    if isinstance(distractor, dict):
        entry = None if base is None else lang.get(str(base["lexeme"]))
        chosen = tk.feats_of(base or {})
        said = chosen if entry is None else lang.effective(entry, chosen)
        named = cast(dict[str, Any], distractor)
        return all(said.get(str(k)) == str(v) for k, v in named.items())
    return False


def _show(distractor: object) -> str:
    if isinstance(distractor, dict):
        named = cast(dict[str, Any], distractor)
        return "|".join(f"{k}={v}" for k, v in sorted(named.items()))
    return str(distractor)


def _features(lang: Language, entry: Lexeme) -> dict[str, str]:
    """What kind of lexeme an entry is beyond its part of speech: its lexical features, but
    those its category has of itself or chooses (a noun's gender), which are part of the form a
    token stands in (`signature`)."""
    own = set(lang.own_features(entry))
    return {k: v for k, v in lang.lexical(entry).items() if k not in own}


def _other_kind(lang: Language, gap: Lexeme, other: Lexeme) -> bool:
    """Where both have a part of speech, whether it or their features differ (ADR 0132): a
    classifier stands only against classifiers."""
    if gap.pos is None or other.pos is None:
        return False
    return gap.pos != other.pos or _features(lang, gap) != _features(lang, other)


def _kind(lang: Language, entry: Lexeme) -> str:
    features = ",".join(f"{k}={v}" for k, v in sorted(_features(lang, entry).items()))
    return f"{entry.pos}{'[' + features + ']' if features else ''}"


def compile_stories(
    ctx: Ctx,
    course: CourseSource,
    units: list[Unit],
    compiled_forms: dict[tuple[int, int], dict[str, dict[str, Any]]],
    taught: Taught,
) -> Stories:
    """Every unit's stories, compiled and checked; and every line form for stage 7. A `complete`
    line's options are resolved once every line is compiled (they may come from any story of the
    unit or an earlier one)."""
    c = _Compiler(ctx, course, units, compiled_forms, taught)
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
            bundle = c.story(story, unit.doc, base, node[0], out)
            if bundle is not None:
                out.by_unit.setdefault(ui, []).append(bundle)
    for pending in c.pending:
        c.resolve(pending)
    for unit in units:
        for ni, n in enumerate(unit.source.nodes):
            if n.kind == "story" and n.id not in told:
                c.report("story.node", f"story node {n.id} has no story", unit.doc, ("nodes", ni))
    return out
