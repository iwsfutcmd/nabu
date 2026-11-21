"""Writes lints/<lint-id>.yaml: one course per lint that makes exactly that lint fire (and maybe
others), each a small mutation of clean.yaml.

Every fixture is a course kept in one file, so it carries its own lexicon (`own`: its language's
lexicon and declaration), as clean.yaml does. A mutation may change the course, its units or
that lexicon.

Run: uv run python tests/fixtures/make_lint_fixtures.py"""

from __future__ import annotations

import copy
import hashlib
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

import yaml

from nabu import yamlio

HERE = Path(__file__).parent
CLEAN: dict[str, Any] = yaml.safe_load((HERE / "clean.yaml").read_text(encoding="utf-8"))
DRAFT = {"author": "human:fixture", "status": "draft"}


def own(language: str, lexemes: list[dict[str, Any]], **declared: Any) -> dict[str, Any]:
    """A one-file course's own lexicon: its lexemes (sorted by id, as a lexicon is) and what its
    language declares (`declared`: features, rules and the like; no category inflects unless
    `dimensions` says so)."""
    return {
        "lexicon": {
            "language": language,
            "license": "CC0-1.0",
            "provenance": dict(DRAFT),
            "lexemes": sorted(lexemes, key=lambda entry: str(entry["id"])),
        },
        "language": {
            "id": language,
            "license": "CC0-1.0",
            "provenance": dict(DRAFT),
            "dimensions": {},
            **declared,
        },
    }


YUE: dict[str, Any] = {
    "id": "clean-yue",
    "target": "yue-Hant-HK",
    "orthographies": ["yue-Hant-HK/standard"],
    "support": ["en-Latn/standard"],
    "lexicon": "yue",
    "names": {"en": {"course": "Cantonese"}},
    "license": "CC0-1.0",
    "provenance": {"author": "human:fixture", "status": "draft"},
    "own": own("yue", [{"id": "lexeme:我哋", "pos": "PRON", "gloss": {"en": "we"}}]),
    "units": [
        {
            "id": "basics",
            "nodes": [{"id": "basics.1", "kind": "lesson", "introduces": ["lexeme:我哋"]}],
            "sentences": [
                {
                    "id": "s.1",
                    "node": "basics.1",
                    "forms": {
                        "yue-Hant-HK/standard": {
                            "text": "我哋",
                            "tokens": [
                                {
                                    "surface": "我哋",
                                    "lexeme": "我哋",
                                    "readings": {"jyutping": "ngo5 dei6"},
                                }
                            ],
                            "reverse": "我哋",
                        }
                    },
                    "translations": {"en": "we"},
                }
            ],
        }
    ],
}

FA_WORD = "\u06a9\u062a\u0627\u0628"  # کتاب
FA_VOCALIZED = "\u06a9\u0650\u062a\u0627\u0628"  # کِتاب
FA: dict[str, Any] = {
    "id": "clean-fa",
    "target": "fa-Arab-IR",
    "orthographies": ["fa-Arab/standard"],
    "support": ["en-Latn/standard"],
    "lexicon": "fa",
    "names": {"en": {"course": "Persian"}},
    "license": "CC0-1.0",
    "provenance": {"author": "human:fixture", "status": "draft"},
    "own": own("fa", [{"id": f"lexeme:{FA_WORD}", "pos": "NOUN", "gloss": {"en": "book"}}]),
    "vocalization": [
        {
            "orthography": "fa-Arab/standard",
            "license": "CC0-1.0",
            "provenance": {"author": "human:fixture", "status": "draft"},
            "words": {FA_WORD: FA_VOCALIZED},
        }
    ],
    "units": [
        {
            "id": "basics",
            "nodes": [{"id": "basics.1", "kind": "lesson", "introduces": [f"lexeme:{FA_WORD}"]}],
            "sentences": [
                {
                    "id": "s.1",
                    "node": "basics.1",
                    "forms": {
                        "fa-Arab/standard": {
                            "text": FA_WORD,
                            "tokens": [{"surface": FA_WORD, "lexeme": FA_WORD}],
                            "reverse": FA_WORD,
                        }
                    },
                    "translations": {"en": "book"},
                }
            ],
        }
    ],
}
"""A Persian course whose one word takes its vowel marks from the course's vocalization."""

GRC_ORTH = "grc-Grek/polytonic"
GRC: dict[str, Any] = {
    "id": "clean-grc",
    "target": "grc-Grek",
    "orthographies": [GRC_ORTH],
    "support": ["en-Latn/standard"],
    "lexicon": "grc",
    "names": {"en": {"course": "Ancient Greek"}},
    "license": "CC0-1.0",
    "provenance": {"author": "human:fixture", "status": "draft"},
    "own": own(
        "grc",
        [
            {
                "id": "lexeme:ναί",
                "pos": "INTJ",
                "gloss": {"en": "yes"},
                "spelled": {GRC_ORTH: ["ναί"]},
            }
        ],
    ),
    "units": [
        {
            "id": "abc",
            "graphemes": [
                {"id": "grapheme:α", "gloss": {"en": "alpha: a"}, "forms": {GRC_ORTH: ["α", "Α"]}},
                {"id": "grapheme:ι", "gloss": {"en": "iota: i"}, "forms": {GRC_ORTH: ["ι", "Ι"]}},
                {"id": "grapheme:ν", "gloss": {"en": "nu: n"}, "forms": {GRC_ORTH: ["ν", "Ν"]}},
            ],
            "nodes": [
                {
                    "id": "abc.1",
                    "kind": "script",
                    "introduces": ["grapheme:α", "grapheme:ι", "grapheme:ν"],
                    "alphabet": {"orthography": GRC_ORTH, "lexemes": ["lexeme:ναί"]},
                },
                {"id": "abc.2", "kind": "lesson", "introduces": ["lexeme:ναί"]},
            ],
            "sentences": [
                {
                    "id": "s.1",
                    "node": "abc.2",
                    "forms": {
                        GRC_ORTH: {
                            "text": "ναί.",
                            "tokens": [
                                {"surface": "ναί", "lexeme": "ναί", "readings": {"attic": "ναί"}}
                            ],
                            "reverse": "ναί",
                        }
                    },
                    "translations": {"en": "Yes."},
                }
            ],
        }
    ],
}
"""A Greek alphabet track (ADR 0088): one node teaching α, ι and ν, and ναί spelled with them,
which a lesson's sentence gives its Attic reading (ADR 0133)."""

HBO_ORTH = "hbo-Hebr/tiberian"
HA_ARETS = "\u05d4\u05b8\u05d0\u05b8\u05e8\u05b6\u05e5"  # הָאָרֶץ
AL = "\u05e2\u05b7\u05dc"  # עַל
HBO: dict[str, Any] = {
    "id": "clean-hbo",
    "target": "hbo-Hebr",
    "orthographies": [HBO_ORTH],
    "support": ["en-Latn/standard"],
    "lexicon": "hbo",
    "names": {"en": {"course": "Biblical Hebrew"}},
    "license": "CC0-1.0",
    "provenance": {"author": "human:fixture", "status": "draft"},
    "own": own(
        "hbo",
        [
            {"id": "lexeme:erets", "pos": "NOUN", "gloss": {"en": "earth"}},
            {"id": "lexeme:al", "pos": "ADP", "gloss": {"en": "on"}},
        ],
    ),
    "units": [
        {
            "id": "basics",
            "nodes": [
                {"id": "basics.1", "kind": "lesson", "introduces": ["lexeme:erets"]},
                {"id": "basics.2", "kind": "lesson", "introduces": ["lexeme:al"]},
            ],
            "sentences": [
                {
                    "id": "s.1",
                    "node": "basics.1",
                    "forms": {
                        HBO_ORTH: {
                            "text": HA_ARETS,
                            "tokens": [
                                {
                                    "surface": HA_ARETS,
                                    "lexeme": "erets",
                                    "readings": {"tiberian": "hāʾā́reṣ"},
                                }
                            ],
                            "reverse": "הארץ",
                        }
                    },
                    "translations": {"en": "the earth"},
                },
                {
                    "id": "s.2",
                    "node": "basics.2",
                    "forms": {
                        HBO_ORTH: {
                            "text": AL + "\u05be" + HA_ARETS,
                            "tokens": [
                                {"surface": AL, "lexeme": "al", "readings": {"tiberian": "ʿal-"}},
                                {
                                    "surface": HA_ARETS,
                                    "lexeme": "erets",
                                    "readings": {"tiberian": "hāʾā́reṣ"},
                                },
                            ],
                            "reverse": "על הארץ",
                        }
                    },
                    "translations": {"en": "on the earth"},
                },
            ],
        }
    ],
}
"""A Biblical Hebrew course: עַל bound to הָאָרֶץ by a maqaf, its reading's final hyphen saying so."""

ES_ORTH = "es-Latn/standard"


def es_sentence(
    ident: str, node: str, text: str, tokens: list[dict[str, Any]], english: str
) -> dict[str, Any]:
    """A Spanish sentence of the ES course: its text, its tokens, itself as its reverse set."""
    return {
        "id": ident,
        "node": node,
        "forms": {ES_ORTH: {"text": text, "tokens": tokens, "reverse": text.rstrip(".")}},
        "translations": {"en": english},
    }


def es_noun(
    article: str, gender: str, surface: str, lexeme: str, **feats: str
) -> list[dict[str, Any]]:
    """An article and the noun it agrees with: the article is lexeme 1, the noun lexeme 2, its
    head."""
    return [
        {
            "surface": article,
            "lexeme": "el",
            "feats": {"Gender": gender, "Number": "Sing"},
            "n": 1,
            "head": 2,
            "rel": "det",
        },
        {"surface": surface, "lexeme": lexeme, "feats": {"Number": "Sing", **feats}, "n": 2},
    ]


ES: dict[str, Any] = {
    "id": "clean-es",
    "target": "es-Latn-CU",
    "orthographies": [ES_ORTH],
    "support": ["en-Latn/standard"],
    "lexicon": "es",
    "iPlusOne": 2,
    "names": {"en": {"course": "Spanish"}},
    "license": "CC0-1.0",
    "provenance": {"author": "human:fixture", "status": "draft"},
    "own": own(
        "es",
        [
            {"id": "lexeme:el", "pos": "DET", "gloss": {"en": "the"}, "spelled": {ES_ORTH: ["el"]}},
            {
                "id": "lexeme:casa",
                "pos": "NOUN",
                "gloss": {"en": "house"},
                "spelled": {ES_ORTH: ["casa"]},
            },
            {
                "id": "lexeme:mano",
                "pos": "NOUN",
                "feats": {"Gender": "Fem"},
                "gloss": {"en": "hand"},
                "spelled": {ES_ORTH: ["mano"]},
            },
            {
                "id": "lexeme:libro",
                "pos": "NOUN",
                "gloss": {"en": "book"},
                "spelled": {ES_ORTH: ["libro"]},
            },
            {
                "id": "lexeme:hermano",
                "pos": "NOUN",
                "chooses": ["Gender"],
                "gloss": {"en": "brother"},
                "spelled": {ES_ORTH: ["hermano"]},
            },
        ],
        dimensions={"NOUN": ["Number"], "DET": ["Gender", "Number"]},
        lexical={"NOUN": ["Gender"]},
        features={"Gender": ["Fem", "Masc"], "Number": ["Plur", "Sing"]},
        defaults=[
            {"id": "gender-a", "when": {"pos": "NOUN", "ends": "a"}, "gives": {"Gender": "Fem"}},
            {"id": "gender-o", "when": {"pos": "NOUN", "ends": "o"}, "gives": {"Gender": "Masc"}},
        ],
    ),
    "units": [
        {
            "id": "basics",
            "nodes": [
                {
                    "id": "basics.1",
                    "kind": "lesson",
                    "introduces": ["lexeme:el", "lexeme:casa", "lexeme:mano", "lexeme:libro"],
                },
                {
                    "id": "basics.2",
                    "kind": "lesson",
                    "introduces": ["lexeme:hermano", "feature:Gender=Fem"],
                },
            ],
            "sentences": [
                es_sentence(
                    "s.1",
                    "basics.1",
                    "La casa.",
                    es_noun("La", "Fem", "casa", "casa"),
                    "The house.",
                ),
                es_sentence(
                    "s.2", "basics.1", "La mano.", es_noun("La", "Fem", "mano", "mano"), "The hand."
                ),
                es_sentence(
                    "s.3",
                    "basics.1",
                    "El libro.",
                    es_noun("El", "Masc", "libro", "libro"),
                    "The book.",
                ),
                es_sentence(
                    "s.4",
                    "basics.2",
                    "La hermana.",
                    es_noun("La", "Fem", "hermana", "hermano", Gender="Fem"),
                    "The sister.",
                ),
            ],
        }
    ],
}
"""A Spanish course with a noun's gender of itself (ADR 0145): casa feminine by the default for
-a, libro masculine by the one for -o, mano feminine as its entry stores (no default gives it, so
it is a part to learn), hermano choosing its gender on each token (hermana). The feminine is
taught from the second lesson, which the sister brings in."""

Course = dict[str, Any]


def unit(c: Course) -> dict[str, Any]:
    return c["units"][0]


def sentence(c: Course, i: int = 0) -> dict[str, Any]:
    return unit(c)["sentences"][i]


def uz_form(c: Course, i: int = 0) -> dict[str, Any]:
    return sentence(c, i)["forms"]["uz-Latn/standard"]


def lexemes(c: Course) -> list[dict[str, Any]]:
    """The entries of the course's own lexicon."""
    return c["own"]["lexicon"]["lexemes"]


def entry(c: Course, ident: str) -> dict[str, Any]:
    return next(e for e in lexemes(c) if e["id"] == ident)


def add_lexeme(c: Course, new: dict[str, Any]) -> None:
    """An entry more, in its place: a lexicon is sorted by id."""
    lexemes(c).append(new)
    lexemes(c).sort(key=lambda e: str(e["id"]))


def language(c: Course) -> dict[str, Any]:
    """What the course's own language declares."""
    return c["own"]["language"]


def with_cyrl(c: Course) -> None:
    c["orthographies"] = ["uz-Latn/standard", "uz-Cyrl/standard"]
    for s in unit(c)["sentences"]:
        s["forms"]["uz-Cyrl/standard"] = (
            {"text": "Салом!", "reverse": "Салом"}
            if s["id"] == "s.1"
            else {"text": "—", "reverse": "—"}
        )
    unit(c)["sentences"] = unit(c)["sentences"][:1]
    unit(c)["nodes"][0]["introduces"] = ["lexeme:salom"]


def with_copula(c: Course) -> None:
    """The copula -man as a lexeme of its own (a value head: first person singular), which a
    token writes after its base, in place of the rule the clean course names for it."""
    add_lexeme(
        c,
        {
            "id": "lexeme:cop-1sg",
            "realises": {"Number": "Sing", "Person": "1"},
            "gloss": {"en": "I am (suffix -man)"},
        },
    )
    language(c)["features"] = {"Number": ["Sing"], "Person": ["1"]}
    introduces = unit(c)["nodes"][0]["introduces"]
    introduces[introduces.index("rule:copula-man")] = "lexeme:cop-1sg"
    del next(s for s in unit(c)["sentences"] if s["id"] == "s.4")["uses"]


TALABAMAN = [
    {"lexeme": "talaba", "surface": "talaba", "base": True},
    {"lexeme": "cop-1sg", "surface": "man"},
]
"""talabaman as the two lexemes it writes: the noun, and the copula on it."""


def m(fn: Callable[[Course], None], base: Course = CLEAN) -> Callable[[], Course]:
    def make() -> Course:
        c = copy.deepcopy(base)
        fn(c)
        return c

    return make


def set_(path: list[Any], value: Any) -> Callable[[Course], None]:
    def go(c: Course) -> None:
        node: Any = c
        for p in path[:-1]:
            node = node[p]
        node[path[-1]] = value

    return go


def _late(c: Course) -> None:
    u = unit(c)
    u["nodes"] = [
        {
            "id": "basics.1",
            "kind": "lesson",
            "introduces": ["lexeme:salom", "lexeme:men", "rule:copula-man"],
        },
        {"id": "basics.2", "kind": "lesson", "introduces": ["lexeme:talaba"]},
    ]


def _shadowed(c: Course) -> None:
    """A greeting listed whole, salom men, which the sentence that writes it is an example of."""
    add_lexeme(
        c,
        {
            "id": "lexeme:salom-men",
            "pos": "INTJ",
            "gloss": {"en": "hello from me"},
            "spelled": {"uz-Latn/standard": ["salom men"]},
        },
    )
    unit(c)["nodes"][0]["introduces"].append("lexeme:salom-men")
    sentence(c, 1)["uses"] = ["lexeme:salom-men"]


def _never(c: Course) -> None:
    unit(c)["nodes"][0]["introduces"].remove("lexeme:talaba")


def _unused(c: Course) -> None:
    add_lexeme(c, {"id": "lexeme:kitob", "pos": "NOUN", "gloss": {"en": "book"}})
    unit(c)["nodes"][0]["introduces"].append("lexeme:kitob")


def _unknown_feature(c: Course) -> None:
    """talaba in the plural, a value the fixture's language does not declare."""
    uz_form(c, 2)["tokens"][1]["feats"] = {"Number": "Plur"}


def _no_kind(c: Course) -> None:
    """An entry with neither a part of speech, a value it realises nor a head."""
    del entry(c, "lexeme:men")["pos"]


def _form_unwritten(c: Course) -> None:
    """talaba's plural pinned with no spelling: a form that says nothing of how it is written."""
    language(c)["features"] = {"Number": ["Plur", "Sing"]}
    entry(c, "lexeme:talaba")["forms"] = [{"feats": {"Number": "Plur"}, "status": "pinned"}]


def _token_names_and_lists(c: Course) -> None:
    """Salom, in a sentence that brings in nothing but men, names its lexeme and lists two as
    well."""
    uz_form(c, 1)["tokens"][0]["lexemes"] = [
        {"lexeme": "salom", "surface": "Sal"},
        {"lexeme": "men", "surface": "om"},
    ]


def _head_without_relation(c: Course) -> None:
    """men points at Salom and does not say how it relates to it."""
    first, second = uz_form(c, 1)["tokens"]
    first["n"] = 1
    second.update(n=2, head=1)


def _inflected(c: Course) -> None:
    """talabaman, one of talaba's spellings, written in the sentence as talaba and the copula."""
    with_copula(c)
    s4 = next(s for s in unit(c)["sentences"] if s["id"] == "s.4")
    s4["forms"]["uz-Latn/standard"]["tokens"][1] = {
        "surface": "talabaman",
        "lexemes": copy.deepcopy(TALABAMAN),
    }


def _iplus(c: Course) -> None:
    del unit(c)["sentences"][2]


def _yue_read_otherwise(c: Course) -> None:
    """A second sentence reads 我哋 otherwise than the first."""
    first = unit(c)["sentences"][0]
    second = copy.deepcopy(first)
    second["id"] = "s.2"
    second["forms"]["yue-Hant-HK/standard"]["tokens"][0]["readings"] = {"jyutping": "ngo4 dei6"}
    unit(c)["sentences"].append(second)


def _yue_read_otherwise_strict(c: Course) -> None:
    """As _yue_read_otherwise, in a course that has switched the check on (ADR 0135)."""
    c["consistentReadings"] = True
    _yue_read_otherwise(c)


def _grc_misspelled_reading(c: Course) -> None:
    """ναί read νεί, which spells another word."""
    tok = unit(c)["sentences"][0]["forms"][GRC_ORTH]["tokens"][0]
    tok["readings"] = {"attic": "νεί"}


def _hbo_unbound(c: Course) -> None:
    """עַל before a maqaf read without the bound mark."""
    unit(c)["sentences"][1]["forms"][HBO_ORTH]["tokens"][0]["readings"] = {"tiberian": "ʿal"}


def _script_untaught(c: Course) -> None:
    """The alphabet node teaches α and ι only, and its word ναί needs ν."""
    unit(c)["nodes"][0]["introduces"].remove("grapheme:ν")


def _script_no_letter(c: Course) -> None:
    """The rough breathing taught as its spacing sign (U+1FFE), on no letter (ADR 0124)."""
    unit(c)["graphemes"].append(
        {
            "id": "grapheme:rough",
            "gloss": {"en": "rough breathing: h"},
            "forms": {GRC_ORTH: ["῾"]},
        }
    )
    unit(c)["nodes"][0]["introduces"].append("grapheme:rough")


def _script_no_reading_scheme(c: Course) -> None:
    """An alphabet node (ADR 0088) in an orthography whose profile names no reading for its track
    (ADR 0133)."""
    unit(c)["graphemes"] = [{"id": "grapheme:s", "forms": {"uz-Latn/standard": ["s"]}}]
    unit(c)["nodes"].append(
        {
            "id": "basics.abc",
            "kind": "script",
            "introduces": ["grapheme:s"],
            "alphabet": {"orthography": "uz-Latn/standard", "lexemes": ["lexeme:salom"]},
        }
    )


def _script_no_reading(c: Course) -> None:
    """No sentence spells ναί, and its entry gives no Attic reading (ADR 0133)."""
    unit(c)["sentences"].clear()
    unit(c)["nodes"].pop()


def _script_missing(c: Course) -> None:
    with_cyrl(c)
    unit(c)["sentences"].append(
        {
            "id": "s.9",
            "node": "basics.1",
            "forms": {
                "uz-Latn/standard": {
                    "text": "Salom!",
                    "tokens": [{"surface": "Salom", "lexeme": "salom"}],
                    "reverse": "Salom",
                }
            },
            "translations": {"en": "Hello!"},
            "production": False,
        }
    )
    unit(c)["nodes"].append(
        {
            "id": "basics.script",
            "kind": "script",
            "convert": {
                "from": "uz-Latn/standard",
                "to": "uz-Cyrl/standard",
                "sentences": ["s.1", "s.9"],
            },
        }
    )


def _translit(c: Course) -> None:
    with_cyrl(c)
    s = sentence(c)
    s["forms"]["uz-Latn/standard"] = {
        "text": "Oʻzbek!",
        "tokens": [{"surface": "Oʻzbek", "lexeme": "salom"}],
        "reverse": "Oʻzbek",
    }
    s["forms"]["uz-Cyrl/standard"] = {"text": "Ўзбек!", "reverse": "Ўзбек"}
    entry(c, "lexeme:salom")["spelled"] = {"uz-Latn/standard": ["oʻzbek"]}


def _no_license(c: Course) -> None:
    del c["license"]


def _no_provenance(c: Course) -> None:
    del c["provenance"]


# ---- stories: a clean story on a story node, then one mutation per lint

STORY: dict[str, Any] = {
    "id": "basics.story",
    "node": "basics.story",
    "title": {"en": "Hello"},
    "characters": [{"id": "aziz", "name": {"uz-Latn/standard": "Aziz"}}],
    "steps": [
        {
            "line": {
                "speaker": "aziz",
                "forms": {
                    "uz-Latn/standard": {
                        "text": "Salom!",
                        "tokens": [{"surface": "Salom", "lexeme": "salom"}],
                    }
                },
                "translations": {"en": "Hello!"},
            }
        },
        {
            "line": {
                "speaker": "aziz",
                "ask": "complete",
                "gap": "lexeme:talaba",
                "distractors": ["lexeme:kitob"],
                "forms": {
                    "uz-Latn/standard": {
                        "text": "Men talabaman.",
                        "tokens": [
                            {"surface": "Men", "lexeme": "men"},
                            {"surface": "talabaman", "lexeme": "talaba"},
                        ],
                    }
                },
                "translations": {"en": "I'm a student."},
            }
        },
        {
            "choose": {
                "prompt": {"en": "Who is Aziz?"},
                "options": [{"en": "a student"}, {"en": "a teacher"}],
                "answer": 0,
            }
        },
    ],
}


KITOB_SENTENCE: dict[str, Any] = {
    "id": "s.5",
    "node": "basics.1",
    "forms": {
        "uz-Latn/standard": {
            "text": "Salom, kitob!",
            "tokens": [
                {"surface": "Salom", "lexeme": "salom"},
                {"surface": "kitob", "lexeme": "kitob"},
            ],
            "reverse": "Salom, kitob",
        }
    },
    "translations": {"en": "Hello, book!"},
}
"""A sentence that writes kitob, so that the story's question has another noun to offer."""


def with_story(c: Course) -> None:
    """The clean story, and what its question needs: a gap is offered a word of its own part of
    speech that the course writes (ADR 0132), so the course gets a second noun, kitob, and a
    sentence that writes it."""
    add_lexeme(
        c,
        {
            "id": "lexeme:kitob",
            "pos": "NOUN",
            "gloss": {"en": "book"},
            "spelled": {"uz-Latn/standard": ["kitob"]},
        },
    )
    unit(c)["nodes"][0]["introduces"].append("lexeme:kitob")
    unit(c)["sentences"].append(copy.deepcopy(KITOB_SENTENCE))
    unit(c)["nodes"].append({"id": "basics.story", "kind": "story"})
    unit(c)["stories"] = [copy.deepcopy(STORY)]


def story(c: Course) -> dict[str, Any]:
    return unit(c)["stories"][0]


def _story_on_lesson(c: Course) -> None:
    with_story(c)
    story(c)["node"] = "basics.1"


def _story_untranslated(c: Course) -> None:
    with_story(c)
    story(c)["steps"][0]["line"]["translations"] = {"fr": "Bonjour !"}


def _story_stranger(c: Course) -> None:
    with_story(c)
    story(c)["steps"][0]["line"]["speaker"] = "maryam"


def _story_ahead(c: Course) -> None:
    with_story(c)
    unit(c)["nodes"][0]["introduces"].remove("lexeme:talaba")
    unit(c)["nodes"].append({"id": "basics.2", "kind": "lesson", "introduces": ["lexeme:talaba"]})


def _story_bad_answer(c: Course) -> None:
    with_story(c)
    story(c)["steps"][2]["choose"]["answer"] = 5


def _story_unattested_form(c: Course) -> None:
    # The gap is talaba with the copula -man on it: no sentence writes kitob so (ADR 0132).
    with_story(c)
    with_copula(c)
    tokens = story(c)["steps"][1]["line"]["forms"]["uz-Latn/standard"]["tokens"]
    tokens[1] = {"surface": "talabaman", "lexemes": copy.deepcopy(TALABAMAN)}


def _story_other_pos(c: Course) -> None:
    # A noun's gap offered an interjection: grammar alone rules it out (ADR 0132).
    with_story(c)
    story(c)["steps"][1]["line"]["distractors"] = ["lexeme:salom"]


# ---- roleplay scenario cards: a clean card after the first lesson, then one mutation per lint
SCENARIO: dict[str, Any] = {
    "id": "basics.cafe",
    "after": "basics.1",
    "title": {"en": "At the café"},
    "setting": {"en": "A small café in Tashkent, in the morning."},
    "character": {"en": "The waiter, friendly and patient."},
    "goal": {"en": "Greet the waiter and say who you are."},
}


def with_scenario(c: Course) -> dict[str, Any]:
    card = copy.deepcopy(SCENARIO)
    unit(c).setdefault("scenarios", []).append(card)
    return card


def _scenario_nowhere(c: Course) -> None:
    with_scenario(c)["after"] = "basics.99"


def _scenario_untranslated(c: Course) -> None:
    with_scenario(c)["goal"] = {"fr": "Saluer le serveur."}


FIXTURES: dict[str, tuple[str, Callable[[], Course]]] = {
    "parse.schema": (
        "A sentence has a field the schema does not know.",
        m(set_(["units", 0, "sentences", 0, "colour"], "red")),
    ),
    "parse.duplicate-id": (
        "Two sentences are both s.1.",
        m(set_(["units", 0, "sentences", 1, "id"], "s.1")),
    ),
    "parse.unknown-orthography": (
        "A Cyrillic form in a Latin-only course.",
        m(
            set_(
                ["units", 0, "sentences", 0, "forms", "uz-Cyrl/standard"],
                {"text": "Салом!", "reverse": "Салом"},
            )
        ),
    ),
    "parse.missing-asset": (
        "A lexeme's picture whose file does not exist.",
        m(
            set_(
                ["own", "lexicon", "lexemes", 0, "image"],
                {
                    "file": "images/no-such-picture.svg",
                    "license": "CC0-1.0",
                    "provenance": {"author": "human:fixture", "status": "draft"},
                },
            )
        ),
    ),
    "course.names": (
        "The course names an orthography it does not teach.",
        m(set_(["names", "en", "orthographies"], {"uz-Cyrl/standard": "Cyrillic"})),
    ),
    "parse.token-mismatch": (
        "A token that is not in the text.",
        m(
            set_(
                ["units", 0, "sentences", 0, "forms", "uz-Latn/standard", "tokens"],
                [{"surface": "Xayr", "lexeme": "salom"}],
            )
        ),
    ),
    "text.not-nfc": (
        "A decomposed é in a translation.",
        m(set_(["units", 0, "sentences", 0, "translations", "en"], "Café!")),
    ),
    "text.invisible": (
        "A right-to-left mark in Latin text.",
        m(lambda c: uz_form(c).update(text="Salom!\u200f")),
    ),
    "text.splits-grapheme": (
        "A token boundary between a letter and its combining mark.",
        m(
            lambda c: uz_form(c).update(
                text="Salom z̃",
                tokens=[{"surface": "Salom", "lexeme": "salom"}, {"surface": "z"}, {"surface": "̃"}],
            )
        ),
    ),
    "text.script-audit": (
        "Ş is not in the Uzbek exemplars.",
        m(
            lambda c: uz_form(c).update(
                text="Şalom!", tokens=[{"surface": "Şalom", "lexeme": "salom"}], reverse="Şalom"
            )
        ),
    ),
    "text.punctuation-audit": (
        "An Arabic question mark in Uzbek.",
        m(lambda c: uz_form(c).update(text="Salom؟")),
    ),
    "text.mixed-script": (
        "A Cyrillic а inside a Latin word.",
        m(
            lambda c: uz_form(c).update(
                text="Sаlom!", tokens=[{"surface": "Sаlom", "lexeme": "salom"}], reverse="Sаlom"
            )
        ),
    ),
    "text.non-canonical": (
        "ASCII apostrophe where Uzbek content needs U+02BB.",
        m(
            lambda c: uz_form(c).update(
                text="O'zbek!", tokens=[{"surface": "O'zbek", "lexeme": "salom"}], reverse="O'zbek"
            )
        ),
    ),
    "enrich.missing-reading": (
        "A character no analyzer can read and no pinned Jyutping.",
        m(
            lambda c: sentence(c)["forms"]["yue-Hant-HK/standard"].update(
                text="\U0002a6a5",
                tokens=[{"surface": "\U0002a6a5", "lexeme": "我哋"}],
                reverse="\U0002a6a5",
            ),
            YUE,
        ),
    ),
    "enrich.reading-mismatch": (
        "Pinned ngo4 where PyCantonese says ngo5 (pinned wins).",
        m(
            set_(
                [
                    "units",
                    0,
                    "sentences",
                    0,
                    "forms",
                    "yue-Hant-HK/standard",
                    "tokens",
                    0,
                    "readings",
                    "jyutping",
                ],
                "ngo4 dei6",
            ),
            YUE,
        ),
    ),
    "enrich.ruby-unaligned": (
        "One syllable for two characters.",
        m(
            set_(
                [
                    "units",
                    0,
                    "sentences",
                    0,
                    "forms",
                    "yue-Hant-HK/standard",
                    "tokens",
                    0,
                    "readings",
                    "jyutping",
                ],
                "ngo5",
            ),
            YUE,
        ),
    ),
    "enrich.transliteration-mismatch": (
        "ICU's uz_Latn-uz_Cyrl gives Ўзбэк; the pinned form is Ўзбек.",
        m(_translit),
    ),
    "vocalization.mismatch": (
        "The vocalization gives کِتابی (another word) for کتاب.",
        m(
            set_(
                ["vocalization", 0, "words"],
                {FA_WORD: FA_VOCALIZED + "\u06cc"},
            ),
            FA,
        ),
    ),
    "vocalization.ambiguous": (
        "کتاب has two vocalizations, and the token gives neither.",
        m(
            lambda c: c["vocalization"][0].update(
                words={}, ambiguous={FA_WORD: [FA_VOCALIZED, "\u06a9\u064f\u062a\u0627\u0628"]}
            ),
            FA,
        ),
    ),
    "drills.rbnf-unavailable": (
        "ICU has no Uzbek spellout.",
        m(
            set_(
                ["drills"],
                [{"kind": "numbers", "orthography": "uz-Latn/standard", "values": [1, 2]}],
            )
        ),
    ),
    "parse.token-lexemes": (
        "A token names its lexeme and lists two as well.",
        m(_token_names_and_lists),
    ),
    "parse.token-relation": (
        "A token points at its head and gives no relation to it.",
        m(_head_without_relation),
    ),
    "lexicon.kind": (
        "An entry with neither a part of speech, a value nor a head.",
        m(_no_kind),
    ),
    "lexicon.form": (
        "A pinned form with no spelling.",
        m(_form_unwritten),
    ),
    "lexicon.undeclared": (
        "A token in the plural, which the language does not declare.",
        m(_unknown_feature),
    ),
    "lexicon.order": (
        "A lexicon whose entries are not sorted by id.",
        m(lambda c: lexemes(c).reverse()),
    ),
    "curriculum.unknown": (
        "A token's lexeme is not in the lexicon.",
        m(lambda c: uz_form(c)["tokens"][0].update(lexeme="xayr")),
    ),
    "curriculum.unknown-node": (
        "A sentence in a node that does not exist.",
        m(set_(["units", 0, "sentences", 0, "node"], "basics.9")),
    ),
    "curriculum.never-introduced": ("lexeme:talaba is used but no node introduces it.", m(_never)),
    "curriculum.introduced-late": ("A node-1 sentence uses a lexeme node 2 introduces.", m(_late)),
    "curriculum.i-plus-one": (
        "Men talabaman brings in lexeme:talaba and the copula's rule at once.",
        m(_iplus),
    ),
    "curriculum.one-gender": (
        "The only sentence that names its speaker has a man speaking (ADR 0075).",
        m(set_(["units", 0, "sentences", 0, "tags"], [{"persons": {"speaker": "m"}}])),
    ),
    "curriculum.unused": ("lexeme:kitob is introduced but never used.", m(_unused)),
    "grading.accept-syntax": (
        "An unclosed parenthesis.",
        m(lambda c: uz_form(c).update(reverse="Salom (dunyo")),
    ),
    "grading.blowup": (
        "Eleven optionals: 2048 answers.",
        m(
            lambda c: uz_form(c).update(
                reverse="Salom " + " ".join(f"[{x}]" for x in "abcdefghijk")
            )
        ),
    ),
    "grading.duplicate": (
        "Salom and Salom! normalize alike.",
        m(lambda c: uz_form(c).update(reverse="Salom\nSalom!")),
    ),
    "grading.canonical-missing": (
        "The reverse set does not accept the sentence.",
        m(lambda c: uz_form(c).update(reverse="Xayr")),
    ),
    "grading.missing-reverse": (
        "A production sentence with no reverse set.",
        m(lambda c: uz_form(c).pop("reverse")),
    ),
    "glossary.dead-entry": (
        "A spelling of an entry that no sentence contains.",
        m(
            lambda c: entry(c, "lexeme:salom")["spelled"]["uz-Latn/standard"].append(
                "assalomu alaykum"
            )
        ),
    ),
    "glossary.shadowed": ("salom loses to the longer entry salom men.", m(_shadowed)),
    "lexeme.inflected-form": (
        "talabaman, a spelling of lexeme:talaba, is written as talaba+man in the sentence.",
        m(_inflected),
    ),
    "lexeme.reading": (
        "我哋's card is given ngo4 dei6, which no token gives it: the sentence pins ngo5 dei6.",
        m(
            lambda c: entry(c, "lexeme:我哋").update(
                spelled={"yue-Hant-HK/standard": ["我哋"]}, readings={"jyutping": "ngo4 dei6"}
            ),
            YUE,
        ),
    ),
    "glossary.tile-split": (
        "Tiles split salom inside one runtime unit.",
        m(
            lambda c: uz_form(c).update(
                tokens=[
                    {"surface": "Sa", "lexeme": "salom", "tile": 0},
                    {"surface": "lom", "lexeme": "salom", "tile": 1},
                ]
            )
        ),
    ),
    "reading.inconsistent": (
        "我哋 read ngo5 dei6 and ngo4 dei6, in a course that has switched the check on.",
        m(_yue_read_otherwise_strict, YUE),
    ),
    "reading.inconsistent-pending": (
        "我哋 read ngo5 dei6 and ngo4 dei6, in a course still being cleaned up.",
        m(_yue_read_otherwise, YUE),
    ),
    "reading.spelling": (
        "ναί read νεί, which spells another word.",
        m(_grc_misspelled_reading, GRC),
    ),
    "reading.bound": ("עַל before a maqaf read without its bound mark.", m(_hbo_unbound, HBO)),
    "script.untaught-letter": (
        "A Greek alphabet node's word uses ν before the track teaches it.",
        m(_script_untaught, GRC),
    ),
    "script.no-letter": (
        "A grapheme for the rough breathing written as its spacing sign, on no letter.",
        m(_script_no_letter, GRC),
    ),
    "script.no-reading-scheme": (
        "An alphabet node in an orthography whose profile names no reading scheme for its track.",
        m(_script_no_reading_scheme),
    ),
    "script.missing-reading": (
        "The alphabet node's word ναί, which no sentence spells and whose entry gives no reading.",
        m(_script_no_reading, GRC),
    ),
    "script.missing-form": (
        "A script-convert track uses a sentence with no Cyrillic form.",
        m(_script_missing),
    ),
    "package.license": ("No license on the course or the sentence.", m(_no_license)),
    "package.provenance": ("No provenance on the course or the sentence.", m(_no_provenance)),
    "story.node": ("The story is placed on a lesson node.", m(_story_on_lesson)),
    "story.missing-form": ("A story line has no English translation.", m(_story_untranslated)),
    "story.speaker": ("A line spoken by a character the story does not have.", m(_story_stranger)),
    "story.ahead": ("The story uses talaba, which a later node introduces.", m(_story_ahead)),
    "story.question": ("A question whose answer is option 5 of 2.", m(_story_bad_answer)),
    "story.distractor-form": (
        "A gap with the copula -man; no sentence writes the distractor kitob so.",
        m(_story_unattested_form),
    ),
    "story.distractor-pos": (
        "A noun's gap (talaba) offered an interjection (salom).",
        m(_story_other_pos),
    ),
    "scenario.node": ("A scenario opens after a node that does not exist.", m(_scenario_nowhere)),
    "scenario.missing-text": ("A scenario's goal has no English text.", m(_scenario_untranslated)),
    "package.unreviewed-published": (
        "Published without a reviewer.",
        m(
            set_(
                ["units", 0, "sentences", 0, "provenance"],
                {"author": "human:fixture", "status": "published"},
            )
        ),
    ),
}


# ---- audio: a voice for the clean course, and clips in <fixture>.audio/ (index.yaml, clips/)

VOICE = {
    "id": "narrator",
    "provider": "espeak-ng",
    "voice": "uz",
    "orthography": "uz-Latn/standard",
    "reading": "text",
    "license": "CC0-1.0",
}


def _with_voice(c: Course) -> None:
    c["audio"] = {"voices": [VOICE]}


def _human_required(c: Course) -> None:
    c["audio"] = {"humanRequired": True}


def clip(item: str, data: bytes, **extra: Any) -> tuple[bytes, dict[str, Any]]:
    """A fixture clip: arbitrary bytes (the compiler only hashes them) and its index entry."""
    digest = hashlib.sha256(data).hexdigest()
    entry: dict[str, Any] = {
        "item": item,
        "speed": "normal",
        "file": f"clips/{digest[:16]}.mp3",
        "sha256": digest,
        "durationMs": 900,
        "license": "CC0-1.0",
        "provenance": {"author": "generated:espeak-ng@1.51", "status": "draft"},
        "synthetic": True,
        "synthesis": {
            "provider": "espeak-ng",
            "version": "1.51",
            "voice": "uz",
            "input": "Salom!",
            "rate": 1.0,
            "inputHash": "0" * 64,
        },
    }
    return data, entry | extra


def _unlicensed() -> tuple[bytes, dict[str, Any]]:
    data, entry = clip("s.1", b"schema")
    del entry["license"]
    return data, entry


def _read(text: str) -> dict[str, Any]:
    return {**clip("s.1", b"")[1]["synthesis"], "input": text}


AUDIO: dict[str, tuple[str, Callable[[Course], None], list[tuple[bytes, dict[str, Any]]]]] = {
    "audio.schema": (
        "A clip without its license.",
        _with_voice,
        [_unlicensed()],
    ),
    "audio.missing-file": (
        "A clip whose file is not there.",
        _with_voice,
        [clip("s.1", b"never written", file="clips/0000000000000000.mp3")],
    ),
    "audio.human-required": (
        "A synthesized clip in a course whose audio must be recorded.",
        _human_required,
        [clip("s.1", b"human-required")],
    ),
    "audio.unknown-item": (
        "A clip for a sentence the course does not have.",
        _with_voice,
        [clip("s.99", b"unknown item")],
    ),
    "audio.stale": (
        "The voice now reads 'Salom!', the clip read 'Salam!'.",
        _with_voice,
        [clip("s.1", b"stale", synthesis=_read("Salam!"))],
    ),
    "audio.timings": (
        "Timings that point past the sentence's tokens.",
        _with_voice,
        [clip("s.1", b"timings", timings=[{"token": 9, "startMs": 0, "endMs": 400}])],
    ),
    "audio.held-back": (
        "A clip the round-trip check failed, not yet reviewed.",
        _with_voice,
        [clip("s.1", b"held back", qa={"asrText": "Salam", "cer": 0.8, "status": "fail"})],
    ),
}
for _lint, (_why, _mutate, _clips) in AUDIO.items():
    FIXTURES[_lint] = (_why, m(_mutate))


def main() -> None:
    out = HERE / "lints"
    out.mkdir(exist_ok=True)
    for old in out.glob("*.yaml"):
        old.unlink()
    for old_dir in out.glob("*.audio"):
        shutil.rmtree(old_dir)
    for lint, (why, make) in FIXTURES.items():
        body = yamlio.dump(make())
        (out / f"{lint}.yaml").write_text(
            f"# Fixture for {lint}: {why}\n"
            f"# Generated by make_lint_fixtures.py from clean.yaml.\n{body}",
            encoding="utf-8",
        )
    for lint, (why, _mutate, clips) in AUDIO.items():
        adir = out / f"{lint}.audio"
        (adir / "clips").mkdir(parents=True)
        for data, entry in clips:
            if lint != "audio.missing-file":
                (adir / entry["file"]).write_bytes(data)
        body = yamlio.dump({"version": 1, "clips": [entry for _, entry in clips]})
        (adir / "index.yaml").write_text(
            f"# Audio for the {lint} fixture: {why}\n{body}", encoding="utf-8"
        )


if __name__ == "__main__":
    main()
