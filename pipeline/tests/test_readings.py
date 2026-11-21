"""Pinned readings on a lexeme's spellings (ADR 0117): the compiler pins one reading per word of
every spelling of an entry, for every scheme its orthography's words pin, and word cards, voices
and minimal pairs all read that one. Built content here has the compiler's shape (an entry's
spellings are tagged text)."""

from __future__ import annotations

from typing import Any

from nabu.audio.course import audio_dir, kept_voices, plan, read_index
from nabu.compiler import text as tx
from nabu.compiler.build import Compiled
from nabu.compiler.readings import pin_lexeme_readings, pinned_schemes
from nabu.schema.models import BundleLexeme, BundleLexicon, BundleUnit, TokenModel

from .conftest import ROOT, CoreCli
from .test_courses import build
from .units import lexeme, lexicon, line, sentence, story, token, unit

YUE = "yue-Hant-HK/standard"
GRC = "grc-Grek/polytonic"
HBO = "hbo-Hebr/tiberian"
LZH = "lzh-Hant/standard"
HAN = tx.Script("Hant", ("Hani",))
HEBR = tx.Script("Hebr", ("Hebr",))


def word(
    surface: str,
    name: str | None = None,
    lexemes: list[dict[str, Any]] | None = None,
    **readings: str,
) -> TokenModel:
    """A lexical token of one lexeme (`name`) or several (`lexemes`, as a bundle lists them), with
    its readings, and its Jyutping as ruby."""
    t: dict[str, Any] = {}
    if readings:
        t["readings"] = dict(readings)
        if "jyutping" in readings:
            segments = tx.ruby_segments(surface, readings["jyutping"])
            if segments is not None:
                t["ruby"] = {"jyutping": segments}
    if lexemes:
        t["lexemes"] = lexemes
    return token(surface, lexeme=name, **t)


def course(
    orth: str,
    sentences: list[list[TokenModel]],
    entries: dict[str, list[str]] | list[BundleLexeme],
    lines: list[list[TokenModel]] | None = None,
) -> tuple[BundleUnit, BundleLexicon]:
    """A unit of sentences and one story's lines, and the lexicon of its entries (by their
    spellings' words, or given)."""
    given = (
        entries
        if isinstance(entries, list)
        else [lexeme(k, {orth: [[token(f)] for f in forms]}) for k, forms in entries.items()]
    )
    u = unit(
        sentences=[sentence(f"s.{i}", {orth: tokens}) for i, tokens in enumerate(sentences)],
        stories=[story("story", [line({orth: t}) for t in lines or []])],
    )
    return u, lexicon(given)


def pin(
    built: tuple[BundleUnit, BundleLexicon],
    orth: str = YUE,
    ruby: tuple[str, ...] = ("jyutping",),
    own: dict[str, dict[str, str]] | None = None,
) -> BundleLexicon:
    u, lex = built
    script = HEBR if orth == HBO else HAN
    out, refused = pin_lexeme_readings(
        lex, [u], [orth], lambda _o: list(ruby), lambda _o: script, own
    )
    assert refused == [] or own is not None
    return out


def readings(lex: BundleLexicon, orth: str = YUE) -> dict[str, list[dict[str, str] | None]]:
    return {
        str(e.id): [t.readings for f in (e.forms or {})[orth] for t in f.tokens]
        for e in lex.lexemes
    }


def pinned(
    built: tuple[BundleUnit, BundleLexicon], orth: str = YUE, ruby: tuple[str, ...] = ("jyutping",)
) -> Any:
    return readings(pin(built, orth, ruby), orth)


def first_token(lex: BundleLexicon, orth: str = YUE, k: int = 0) -> dict[str, Any]:
    """An entry's first spelling's first token, as the bundle holds it."""
    return (
        (lex.lexemes[k].forms or {})[orth][0].tokens[0].model_dump(mode="json", exclude_none=True)
    )


def test_a_lexeme_takes_its_most_common_reading_in_the_lessons_and_a_tie_the_first() -> None:
    built = course(
        YUE,
        [
            [word("好", "好", jyutping="hou2")],
            [word("好", "好.hou3", jyutping="hou3")],  # "to like": another lexeme, spelled alike
            [word("好", "好", jyutping="hou2")],
            [word("好", "好.hou3", jyutping="hou3")],
            [word("行", "行", jyutping="haang4")],
            [word("行", "行", jyutping="hang4")],
        ],
        {"好": ["好"], "好.hou3": ["好"], "行": ["行"]},
    )
    assert pinned(built) == {
        "lexeme:好": [{"jyutping": "hou2"}],
        "lexeme:好.hou3": [{"jyutping": "hou3"}],
        "lexeme:行": [{"jyutping": "haang4"}],  # a tie: the first in course order
    }


def ad(reading: str) -> TokenModel:
    return token("עַד", lexeme="ad", readings={"tiberian": reading})


def test_story_lines_count_only_for_a_word_no_lesson_has() -> None:
    """A passage's readings are often its context's (a word bound by maqaf): the lessons decide."""
    tiberian = {"tiberian": "ʿaḏ-"}
    built = course(
        HBO,
        [[ad("ʿaḏ-")]],
        {"ad": ["עַד"], "only-in-a-story": ["אִם"]},
        lines=[
            [ad("ʿaḏ")],
            [ad("ʿaḏ")],
            [token("אִם", lexeme="only-in-a-story", readings={"tiberian": "ʾim"})],
        ],
    )
    assert pinned(built, HBO, ruby=()) == {
        "lexeme:ad": [tiberian],
        "lexeme:only-in-a-story": [{"tiberian": "ʾim"}],
    }


def test_a_lexeme_s_own_reading_comes_first() -> None:
    """עַד's lessons tie at one ʿaḏ- (bound by maqaf) and one ʿaḏ, and a tie goes to the first;
    its entry chooses the free ʿaḏ for its card (the owner's D44). It is the first spelling's: a
    variant (the poetic עֲדֵי) keeps the order's."""
    adei = token("עֲדֵי", lexeme="ad", readings={"tiberian": "ʿăḏê"})
    sentences = [[ad("ʿaḏ-")], [ad("ʿaḏ")], [adei]]
    assert pinned(course(HBO, sentences, {"ad": ["עַד"]}), HBO, ruby=()) == {
        "lexeme:ad": [{"tiberian": "ʿaḏ-"}]
    }
    built = course(HBO, sentences, {"ad": ["עַד", "עֲדֵי"]})
    out = pin(built, HBO, ruby=(), own={"lexeme:ad": {"tiberian": "ʿaḏ"}})
    first, variant = (out.lexemes[0].forms or {})[HBO]
    assert first.tokens[0].readings == {"tiberian": "ʿaḏ"}
    assert variant.tokens[0].readings == {"tiberian": "ʿăḏê"}


def test_a_lexeme_s_own_reading_chooses_among_the_tokens_readings_and_never_adds_one() -> None:
    """A reading no token gives the word, a spelling of two words, a scheme no orthography of the
    entry's spellings pins: each is refused, and the words keep the order's readings."""
    two_words = [token("我"), token(" ", "space"), token("哋")]
    entries = [lexeme("我", {YUE: [[token("我")]]}), lexeme("哋", {YUE: [two_words]})]
    u, lex = course(
        YUE, [[word("我", "我", jyutping="ngo5")], [word("哋", "哋", jyutping="dei6")]], entries
    )
    own = {
        "lexeme:我": {"jyutping": "ngo4", "pinyin": "wǒ"},
        "lexeme:哋": {"jyutping": "dei6"},
    }
    out, refused = pin_lexeme_readings(
        lex, [u], [YUE], lambda _o: ["jyutping"], lambda _o: HAN, own
    )
    assert sorted((r.lexeme, r.scheme) for r in refused) == [
        ("lexeme:哋", "jyutping"),
        ("lexeme:我", "jyutping"),
        ("lexeme:我", "pinyin"),
    ]
    by = {(r.lexeme, r.scheme): r.message for r in refused}
    assert "the course's give ngo5" in by[("lexeme:我", "jyutping")]
    assert "2 words" in by[("lexeme:哋", "jyutping")]
    assert "pin pinyin" in by[("lexeme:我", "pinyin")]
    me = first_token(out, k=1)  # sorted by id: 哋 before 我
    assert me["readings"] == {"jyutping": "ngo5"}
    assert me["ruby"] == {"jyutping": [{"base": "我", "text": "ngo5"}]}


def test_a_lexeme_met_only_inside_a_longer_token_takes_its_share_of_it() -> None:
    """禮拜 (week) appears only in 禮拜一 (Monday): lai5 baai3, the first two of its syllables, as
    the ruby pairs them. A word without ruby (a loanword in Latin letters) is not split."""
    monday = word(
        "禮拜一",
        lexemes=[
            {"lexeme": "lexeme:禮拜", "surface": "禮拜", "base": True},
            {"lexeme": "lexeme:一", "surface": "一"},
        ],
        jyutping="lai5 baai3 jat1",
    )
    loan = token(
        "OK",
        readings={"jyutping": "ou1 kei1"},
        lexemes=[
            {"lexeme": "lexeme:O", "surface": "O", "base": True},
            {"lexeme": "lexeme:K", "surface": "K"},
        ],
    )
    out = pin(course(YUE, [[monday, loan]], {"禮拜": ["禮拜"], "O": ["O"]}))
    assert readings(out) == {"lexeme:禮拜": [{"jyutping": "lai5 baai3"}], "lexeme:O": [None]}
    assert first_token(out, k=1)["ruby"] == {
        "jyutping": [{"base": "禮", "text": "lai5"}, {"base": "拜", "text": "baai3"}]
    }


def test_a_scheme_that_cites_words_gives_the_card_its_citation_form() -> None:
    """Attic writes καὶ before another word and καί on a card (its `cite` plug-in): the card's
    reading is cited the same way, vowel lengths kept."""
    from nabu.audio.attic import cited

    kai = token("καὶ", lexeme="kai", readings={"attic": "καὶ"})
    para = token("παρὰ", lexeme="para", readings={"attic": "πᾰρᾰ̀"})
    built = course(GRC, [[kai, para]], {"kai": ["καί"], "para": [cited("παρὰ")]})
    assert pinned(built, GRC, ruby=()) == {
        "lexeme:kai": [{"attic": "καί"}],
        "lexeme:para": [{"attic": cited("πᾰρᾰ̀")}],
    }
    assert cited("πᾰρᾰ̀") != "πᾰρᾰ̀"


def test_a_spelling_no_token_of_its_own_takes_the_spelling_s_reading_and_a_polyphone_none() -> None:
    built = course(
        YUE,
        [
            [word("我", "我", jyutping="ngo5")],
            [word("行", "行", jyutping="haang4")],
            [word("行", "行.hong", jyutping="hong4")],
        ],
        {"我的": ["我"], "行街": ["行"]},
    )
    assert pinned(built) == {"lexeme:我的": [{"jyutping": "ngo5"}], "lexeme:行街": [None]}


def test_every_scheme_the_orthography_pins_and_ruby_only_on_its_ruby_layers() -> None:
    t = word("知", "知", jyutping="zi1", pinyin="zhī")
    built = course(LZH, [[t]], {"知": ["知"]})
    assert pinned_schemes([built[0]], LZH) == ["jyutping", "pinyin"]
    out = pin(built, LZH, ruby=("pinyin",))
    form = first_token(out, LZH)
    assert form["readings"] == {"jyutping": "zi1", "pinyin": "zhī"}
    assert form["ruby"] == {"pinyin": [{"base": "知", "text": "zhī"}]}


def _first_readings(compiled: Compiled, orth: str) -> dict[str, dict[str, str]]:
    """Each lexeme's first spelling's first word's readings, as its card has them."""
    return {
        str(e.id): (e.forms or {})[orth][0].tokens[0].readings or {}
        for e in compiled.lexicon.lexemes
        if orth in (e.forms or {})
    }


def test_classical_chinese_cards_read_a_character_by_its_lexeme(core_cli: CoreCli) -> None:
    """知 "know" is zhī, 知.zhi "wisdom" (智) zhì: the card of each shows its own reading, which a
    lookup by spelling (the old audio planner's and app's) got wrong for the second."""
    _, compiled = build(core_cli, "lzh")
    forms = _first_readings(compiled, LZH)
    assert forms["lexeme:知"] == {"baxter": "trje", "jyutping": "zi1", "pinyin": "zhī"}
    assert forms["lexeme:知.zhi"] == {"baxter": "trjeH", "jyutping": "zi3", "pinyin": "zhì"}
    assert forms["lexeme:有.you"]["pinyin"] == "yòu"
    assert forms["lexeme:強.qiang"]["pinyin"] == "qiǎng"


def test_biblical_hebrew_ad_s_card_reads_the_free_form(core_cli: CoreCli) -> None:
    """The owner's D44: עַד's card (and its clip) says the free ʿaḏ, which its entry chooses, not
    the maqaf-bound ʿaḏ- its lessons tie with. כִּי and עַל keep the bound forms most lessons
    give them (kî-, ʿal-)."""
    _, compiled = build(core_cli, "hbo")
    forms = _first_readings(compiled, HBO)
    assert forms["lexeme:ad"] == {"tiberian": "ʿaḏ"}
    assert forms["lexeme:ki"] == {"tiberian": "kî-"}
    assert forms["lexeme:al"] == {"tiberian": "ʿal-"}


def test_no_clip_of_any_course_is_stale(core_cli: CoreCli) -> None:
    """Every synthesized clip says what its voice reads now, in every course: the compiler checks
    it (`audio.stale`), except where a voice too broken to ship skips the audio (grc, ADR 0091),
    which this checks too. Word cards are read from the readings their spellings pin (ADR
    0117)."""
    for name in ("grc", "hbo", "tok"):
        _, compiled = build(core_cli, name)
        audio = compiled.course.audio
        assert audio is not None and audio.voices
        adir = audio_dir(ROOT / "courses" / name)
        index = read_index(adir)
        voices = list(audio.voices)
        # The voices people checked and those the course pins keep their items.
        checked = kept_voices(adir, index, voices)
        reads = {
            (v.provider, v.voice, i.item): i.input
            for v in voices
            for i in plan(compiled.content, v, compiled.written, voices, checked)[0]
        }
        clips = [c for c in index.clips if c.synthesis is not None]
        assert clips, name
        lexemes = {str(e.id) for e in compiled.lexicon.lexemes}
        assert any(c.item in lexemes for c in clips), name  # word cards have clips
        for c in clips:
            assert c.synthesis is not None
            key = (c.synthesis.provider, c.synthesis.voice, c.item)
            assert reads.get(key) == c.synthesis.input, (name, c.item)
