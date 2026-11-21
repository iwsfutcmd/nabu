"""A course source in the new shape, from today's (docs/migration-design.md).

Everything a learner reads is copied as it stands: text, translations, accept sets, readings.
What changes is what the tokens, the nodes and the story questions name.
"""

from __future__ import annotations

import collections
from typing import Any

from nabu import yamlio
from nabu.migrate.convert import Converter, Finding, Tok, emit
from nabu.migrate.plan import PlanError
from nabu.migrate.source import obj, seq

Json = dict[str, Any]


class CourseWriter:
    def __init__(self, conv: Converter) -> None:
        self.conv = conv
        self.plan = conv.plan
        self.findings: list[Finding] = []
        self.introduced: dict[str, str] = {}
        """Each teachable and the node that introduces it."""
        self.waiting: list[str] = []
        """Feature values a node was to introduce and none of its own sentences chooses: each
        waits for the first node after it whose sentences do (a noun's gender is its lexeme's,
        so *feminine* brought in with bare nouns has nothing a lesson could present)."""
        self.shows: dict[str, set[str]] = collections.defaultdict(set)
        """Each node's feature values: those its own sentences' tokens choose."""
        for _, unit in conv.course.units:
            for sentence in seq(unit.get("sentences")):
                if sentence.get("node") is None:
                    continue
                for toks in conv.items.get(str(sentence["id"]), {}).values():
                    for tok in toks:
                        for part in tok.parts:
                            for name, said in part.feats.items():
                                self.shows[str(sentence["node"])] |= {
                                    f"feature:{name}={value}" for value in str(said).split(",")
                                }

    # What a KC id is called now

    def lexeme_id(self, kc: str, where: str) -> str:
        """The lexeme a sense KC is, or is a form of, or is built on."""
        name = kc.partition(":")[2]
        sp = self.plan.sense(name)
        if sp.parts:
            return f"lexeme:{sp.parts[0]}"
        if sp.form_of:
            return f"lexeme:{sp.form_of}"
        if kc not in self.conv.lexeme_of:
            raise PlanError(f"{where}: {kc} is no lexeme")
        return f"lexeme:{self.conv.lexeme_of[kc]}"

    def teaches(self, kc: str, where: str) -> list[str]:
        """What a node introduces where it introduced this KC."""
        kind = kc.partition(":")[0]
        if kind == "grapheme":
            return [kc]
        if kind == "sense":
            sp = self.plan.sense(kc.partition(":")[2])
            if sp.parts:
                return [f"lexeme:{p}" for p in sp.parts]
            return [self.lexeme_id(kc, where)]
        fp = self.plan.form(kc)
        if fp.lexeme is not None:
            return [f"lexeme:{fp.lexeme}"]
        if fp.rule is not None:
            return [f"rule:{fp.rule}"]
        return [f"feature:{value}" for value in fp.introduces]

    # Tokens

    def form(self, toks: list[Tok], form: Json) -> Json:
        out: Json = {"text": form["text"]}
        if toks:
            out["tokens"] = yamlio.FlowList([_flow(emit(t)) for t in toks])
        if "reverse" in form:
            out["reverse"] = form["reverse"]
        return out

    def forms(self, item_id: str, forms: Json) -> Json:
        return {
            orth: self.form(self.conv.items[item_id][orth], form) for orth, form in forms.items()
        }

    # Units

    def node(self, node: Json) -> Json:
        out: Json = {"id": node["id"], "kind": node["kind"]}
        for key in ("introduces", "reinforces"):
            if key not in node and key != "introduces":
                continue
            new: list[str] = []
            shown = self.shows[str(node["id"])]
            for kc in seq(node.get(key)):
                for teachable in self.teaches(str(kc), str(node["id"])):
                    if key == "introduces":
                        if teachable in self.introduced:
                            continue
                        if teachable.startswith("feature:") and teachable not in shown:
                            # Nothing here shows it: it waits for the first node that does.
                            if teachable not in self.waiting:
                                self.waiting.append(teachable)
                            continue
                        self.introduced[teachable] = str(node["id"])
                    if teachable not in new:
                        new.append(teachable)
            if key == "introduces":
                for value in [v for v in self.waiting if v in shown]:
                    self.waiting.remove(value)
                    if value not in self.introduced:
                        self.introduced[value] = str(node["id"])
                        new.append(value)
            if new:
                out[key] = yamlio.FlowList(new)
            elif node.get(key):
                self.findings.append(
                    Finding(
                        "node-empty",
                        str(node["id"]),
                        f"{key} {', '.join(str(k) for k in node[key])}: "
                        "all of it is introduced earlier now, "
                        "or is a form no value introduces",
                    )
                )
        if "alphabet" in node:
            alphabet = node["alphabet"]
            out["alphabet"] = {
                "orthography": alphabet["orthography"],
                "lexemes": yamlio.FlowList(
                    [self.lexeme_id(str(w), str(node["id"])) for w in alphabet["words"]]
                ),
            }
        if "convert" in node:
            out["convert"] = node["convert"]
        return out

    def sentence(self, s: Json) -> Json:
        out: Json = {"id": s["id"], "node": s["node"]}
        tags: list[Json] = []
        if "persons" in s:
            tags.append(yamlio.Flow({"persons": yamlio.Flow(s["persons"])}))
        course_register = obj(self.plan.data.get("course")).get("register")
        if "register" in s and s["register"] != course_register:
            tags.append(yamlio.Flow({"register": s["register"]}))
        if tags:
            out["tags"] = tags
        if s.get("constructions"):
            uses: list[str] = []
            for kc in s["constructions"]:
                uses += [u for u in self.teaches(str(kc), str(s["id"])) if u not in uses]
            out["uses"] = yamlio.FlowList(uses)
        out["forms"] = self.forms(str(s["id"]), s["forms"])
        out["translations"] = s["translations"]
        for key in ("production", "provenance", "license"):
            if key in s:
                out[key] = s[key]
        extra = set(s) - {
            "id",
            "node",
            "persons",
            "register",
            "constructions",
            "forms",
            "translations",
            "production",
            "provenance",
            "license",
        }
        if extra:
            raise PlanError(
                f"{s['id']}: the converter does not know the sentence's {sorted(extra)}"
            )
        return out

    def line(self, item_id: str, line: Json) -> Json:
        out: Json = {}
        if "speaker" in line:
            out["speaker"] = line["speaker"]
        if "ask" in line:
            out["ask"] = line["ask"]
        if "gap" in line:
            # A gap on a built word names its base: the token that has it is still the one left out.
            out["gap"] = self.lexeme_id(str(line["gap"]), item_id)
        if "asks" in line:
            out["asks"] = {"word": "lexeme", "form": "form"}[str(line["asks"])]
        if "distractors" in line:
            gap_pos = self.conv.pos.get(str(line.get("gap", "")).partition(":")[2])
            ds: list[Any] = []
            for d in line["distractors"]:
                kc = str(d)
                if kc.startswith("sense:"):
                    sp = self.plan.sense(kc.partition(":")[2])
                    if sp.parts:
                        # A built word as an option: its lexemes, as a token writes them.
                        ds.append(yamlio.FlowList([f"lexeme:{p}" for p in sp.parts]))
                        continue
                    ds.append(self.lexeme_id(kc, item_id))
                    if sp.form_of:
                        self.findings.append(
                            Finding(
                                "distractor-built",
                                item_id,
                                f"its wrong option {kc} is a form of {ds[-1]} now: "
                                "the option names the lexeme, "
                                "and which form it shows is the gap's",
                            )
                        )
                    continue
                fp = self.plan.form(kc)
                if fp.lexeme is not None:
                    ds.append(f"lexeme:{fp.lexeme}")
                else:
                    ds.append(yamlio.Flow(dict(sorted(fp.pinned(gap_pos).items()))))
            out["distractors"] = ds
        out["forms"] = self.forms(item_id, line["forms"])
        out["translations"] = line["translations"]
        extra = set(line) - {
            "speaker",
            "ask",
            "gap",
            "asks",
            "distractors",
            "forms",
            "translations",
        }
        if extra:
            raise PlanError(f"{item_id}: the converter does not know the line's {sorted(extra)}")
        return out

    def story(self, story: Json) -> Json:
        out: Json = {k: v for k, v in story.items() if k != "steps"}
        steps: list[Json] = []
        for i, step in enumerate(seq(story.get("steps"))):
            if "line" in step:
                steps.append({"line": self.line(f"{story['id']}#{i}", step["line"])})
            else:
                steps.append(step)
        out["steps"] = steps
        return out

    def unit(self, unit: Json) -> Json:
        out: Json = {"id": unit["id"]}
        for key in ("title", "cefr"):
            if key in unit:
                out[key] = unit[key]
        graphemes = [
            _flow({k: v for k, v in kc.items() if k in ("id", "gloss", "forms", "notes")})
            for kc in seq(unit.get("kcs"))
            if str(kc["id"]).startswith("grapheme:")
        ]
        if graphemes:
            out["graphemes"] = graphemes
        out["nodes"] = [_flow(self.node(n)) for n in seq(unit.get("nodes"))]
        out["sentences"] = [self.sentence(s) for s in seq(unit.get("sentences"))]
        if unit.get("stories"):
            out["stories"] = [self.story(s) for s in unit["stories"]]
        if unit.get("scenarios"):
            out["scenarios"] = unit["scenarios"]
        extra = set(unit) - {
            "id",
            "title",
            "cefr",
            "kcs",
            "nodes",
            "sentences",
            "stories",
            "scenarios",
        }
        if extra:
            raise PlanError(f"unit {unit['id']}: the converter does not know its {sorted(extra)}")
        return out

    def course(self) -> Json:
        # Written after the units: a value that waited for a node to show it and found none.
        for value in self.waiting:
            self.findings.append(
                Finding(
                    "value-unshown",
                    value,
                    "a node was to introduce it and no lesson's sentence chooses it from there "
                    "on: no node introduces it",
                )
            )
        self.waiting = []
        data = self.conv.course.data
        out: Json = {}
        plan_course: Json = obj(self.plan.data.get("course"))
        for key, value in data.items():
            out[key] = value
            if key == "support":
                out["lexicon"] = self.plan.language
                if plan_course.get("variety"):
                    out["variety"] = plan_course["variety"]
                registers: list[str] = seq(plan_course.get("registers"))
                if plan_course.get("register"):
                    registers = [plan_course["register"]]
                if registers:
                    out["registers"] = registers
        return out


def _flow(value: Any) -> Any:
    """Written on one line, as the course sources write a token, a KC and a node."""
    if isinstance(value, dict):
        return yamlio.Flow({k: _flow(v) for k, v in value.items()})  # pyright: ignore[reportUnknownVariableType]
    if isinstance(value, list):
        return yamlio.FlowList([_flow(v) for v in value])  # pyright: ignore[reportUnknownVariableType]
    return value
