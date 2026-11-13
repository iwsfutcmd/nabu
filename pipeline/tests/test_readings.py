"""Pinned readings on KC forms (ADR 0117): the compiler pins one reading per word of every KC
form, for every scheme its orthography's words pin, and word cards, voices and minimal pairs all
read that one. Built units here have the compiler's shape (KC forms are tagged text)."""

from __future__ import annotations

from typing import Any

from nabu.audio.course import audio_dir, checked_voices, plan, read_index
from nabu.compiler import text as tx
from nabu.compiler.readings import pin_kc_readings, pinned_schemes
from nabu.schema.models import BundleKc, BundleUnit, TokenModel

from .conftest import ROOT, CoreCli
from .test_courses import build
from .units import kc, line, sentence, story, token, unit

YUE = "yue-Hant-HK/standard"
GRC = "grc-Grek/polytonic"
HBO = "hbo-Hebr/tiberian"
LZH = "lzh-Hant/standard"
HAN = tx.Script("Hant", ("Hani",))
HEBR = tx.Script("Hebr", ("Hebr",))


def word(
    surface: str,
    sense: str | None = None,
    morphs: list[dict[str, str]] | None = None,
    **readings: str,
) -> TokenModel:
    t: dict[str, Any] = {}
    if sense is not None:
        t["sense"] = sense
    if readings:
        t["readings"] = dict(readings)
        if "jyutping" in readings:
            segments = tx.ruby_segments(surface, readings["jyutping"])
            if segments is not None:
                t["ruby"] = {"jyutping": segments}
    if morphs:
        t["morphs"] = morphs
    return token(surface, **t)


def course(
    orth: str,
    sentences: list[list[TokenModel]],
    kcs: dict[str, list[str]] | list[BundleKc],
    lines: list[list[TokenModel]] | None = None,
) -> BundleUnit:
    """A unit of sentences, KCs (by their forms' words, or given) and one story's lines."""
    given = (
        kcs
        if isinstance(kcs, list)
        else [kc(k, {orth: [[token(f)] for f in forms]}) for k, forms in kcs.items()]
    )
    return unit(
        sentences=[sentence(f"s.{i}", {orth: tokens}) for i, tokens in enumerate(sentences)],
        kcs=given,
        stories=[story("story", [line({orth: t}) for t in lines or []])],
    )


def pin(u: BundleUnit, orth: str = YUE, ruby: tuple[str, ...] = ("jyutping",)) -> BundleUnit:
    [out], _ = pin_kc_readings([u], [orth], lambda _o: list(ruby), lambda _o: HAN)
    return out


def readings(u: BundleUnit, orth: str = YUE) -> dict[str, list[dict[str, str] | None]]:
    return {k.id: [t.readings for f in (k.forms or {})[orth] for t in f.tokens] for k in u.kcs}


def pinned(u: BundleUnit, orth: str = YUE, ruby: tuple[str, ...] = ("jyutping",)) -> Any:
    return readings(pin(u, orth, ruby), orth)


def first_token(u: BundleUnit, orth: str = YUE, k: int = 0) -> dict[str, Any]:
    """A KC's first form's first token, as the bundle holds it."""
    return (u.kcs[k].forms or {})[orth][0].tokens[0].model_dump(mode="json", exclude_none=True)


def test_a_sense_takes_its_most_common_reading_in_the_lessons_and_a_tie_the_first() -> None:
    u = course(
        YUE,
        [
            [word("好", "好", jyutping="hou2")],
            [word("好", "好.hou3", jyutping="hou3")],  # "to like": another sense, spelled alike
            [word("好", "好", jyutping="hou2")],
            [word("好", "好.hou3", jyutping="hou3")],
            [word("行", "行", jyutping="haang4")],
            [word("行", "行", jyutping="hang4")],
        ],
        {"sense:好": ["好"], "sense:好.hou3": ["好"], "sense:行": ["行"]},
    )
    assert pinned(u) == {
        "sense:好": [{"jyutping": "hou2"}],
        "sense:好.hou3": [{"jyutping": "hou3"}],
        "sense:行": [{"jyutping": "haang4"}],  # a tie: the first in course order
    }


def test_story_lines_count_only_for_a_word_no_lesson_has() -> None:
    """A passage's readings are often its context's (a word bound by maqaf): the lessons decide."""
    tiberian = {"tiberian": "ʿaḏ-"}
    u = course(
        "hbo-Hebr/tiberian",
        [[token("עַד", sense="ad", readings=tiberian)]],
        {"sense:ad": ["עַד"], "sense:only-in-a-story": ["אִם"]},
        lines=[
            [token("עַד", sense="ad", readings={"tiberian": "ʿaḏ"})],
            [token("עַד", sense="ad", readings={"tiberian": "ʿaḏ"})],
            [token("אִם", sense="only-in-a-story", readings={"tiberian": "ʾim"})],
        ],
    )
    assert pinned(u, "hbo-Hebr/tiberian", ruby=()) == {
        "sense:ad": [tiberian],
        "sense:only-in-a-story": [{"tiberian": "ʾim"}],
    }


def ad(reading: str) -> TokenModel:
    return token("עַד", sense="ad", readings={"tiberian": reading})


def test_a_kc_s_own_reading_comes_first() -> None:
    """עַד's lessons tie at one ʿaḏ- (bound by maqaf) and one ʿaḏ, and a tie goes to the first;
    its entry chooses the free ʿaḏ for its card (the owner's D44). It is the first form's: a
    variant (the poetic עֲדֵי) keeps the order's."""
    adei = token("עֲדֵי", sense="ad", readings={"tiberian": "ʿăḏê"})
    sentences = [[ad("ʿaḏ-")], [ad("ʿaḏ")], [adei]]
    assert pinned(course(HBO, sentences, {"sense:ad": ["עַד"]}), HBO, ruby=()) == {
        "sense:ad": [{"tiberian": "ʿaḏ-"}]
    }
    u = course(HBO, sentences, {"sense:ad": ["עַד", "עֲדֵי"]})
    own = {"sense:ad": {"tiberian": "ʿaḏ"}}
    [out], refused = pin_kc_readings([u], [HBO], lambda _o: [], lambda _o: HEBR, own)
    assert refused == []
    first, variant = (out.kcs[0].forms or {})[HBO]
    assert first.tokens[0].readings == {"tiberian": "ʿaḏ"}
    assert variant.tokens[0].readings == {"tiberian": "ʿăḏê"}


def test_a_kc_s_own_reading_chooses_among_the_tokens_readings_and_never_adds_one() -> None:
    """A reading no token gives the word, a form of two words, a scheme no orthography of the
    KC's forms pins: each is refused, and the words keep the order's readings."""
    two_words = [token("我"), token(" ", "space"), token("哋")]
    kcs = [kc("sense:我", {YUE: [[token("我")]]}), kc("sense:哋", {YUE: [two_words]})]
    u = course(YUE, [[word("我", "我", jyutping="ngo5")], [word("哋", "哋", jyutping="dei6")]], kcs)
    own = {
        "sense:我": {"jyutping": "ngo4", "pinyin": "wǒ"},
        "sense:哋": {"jyutping": "dei6"},
    }
    [out], refused = pin_kc_readings([u], [YUE], lambda _o: ["jyutping"], lambda _o: HAN, own)
    assert sorted((r.kc, r.scheme) for r in refused) == [
        ("sense:哋", "jyutping"),
        ("sense:我", "jyutping"),
        ("sense:我", "pinyin"),
    ]
    by = {(r.kc, r.scheme): r.message for r in refused}
    assert "the course's give ngo5" in by[("sense:我", "jyutping")]
    assert "2 words" in by[("sense:哋", "jyutping")]
    assert "pin pinyin" in by[("sense:我", "pinyin")]
    me = first_token(out)
    assert me["readings"] == {"jyutping": "ngo5"}
    assert me["ruby"] == {"jyutping": [{"base": "我", "text": "ngo5"}]}


def test_a_word_met_only_inside_longer_words_takes_its_share_of_them() -> None:
    """禮拜 (week) appears only in 禮拜一 (Monday): lai5 baai3, the first two of its syllables, as
    the ruby pairs them. A word without ruby (a loanword in Latin letters) is not split."""
    monday = word(
        "禮拜一",
        "禮拜一",
        morphs=[{"surface": "禮拜", "kc": "sense:禮拜"}, {"surface": "一", "kc": "sense:一"}],
        jyutping="lai5 baai3 jat1",
    )
    loan = token(
        "OK",
        sense="OK",
        readings={"jyutping": "ou1 kei1"},
        morphs=[{"surface": "O", "kc": "sense:O"}, {"surface": "K", "kc": "sense:K"}],
    )
    out = pin(course(YUE, [[monday, loan]], {"sense:禮拜": ["禮拜"], "sense:O": ["O"]}))
    assert readings(out) == {"sense:禮拜": [{"jyutping": "lai5 baai3"}], "sense:O": [None]}
    assert first_token(out)["ruby"] == {
        "jyutping": [{"base": "禮", "text": "lai5"}, {"base": "拜", "text": "baai3"}]
    }


def test_a_scheme_that_cites_words_gives_the_card_its_citation_form() -> None:
    """Attic writes καὶ before another word and καί on a card (its `cite` plug-in): the card's
    reading is cited the same way, vowel lengths kept."""
    from nabu.audio.attic import cited

    kai = token("καὶ", sense="kai", readings={"attic": "καὶ"})
    para = token("παρὰ", sense="para", readings={"attic": "πᾰρᾰ̀"})
    u = course(GRC, [[kai, para]], {"sense:kai": ["καί"], "sense:para": [cited("παρὰ")]})
    assert pinned(u, GRC, ruby=()) == {
        "sense:kai": [{"attic": "καί"}],
        "sense:para": [{"attic": cited("πᾰρᾰ̀")}],
    }
    assert cited("πᾰρᾰ̀") != "πᾰρᾰ̀"


def test_a_form_no_sense_names_takes_its_spelling_s_reading_and_a_polyphone_none() -> None:
    u = course(
        YUE,
        [
            [word("我", "我", jyutping="ngo5")],
            [word("行", "行", jyutping="haang4")],
            [word("行", "行.hong", jyutping="hong4")],
        ],
        {"sense:我的": ["我"], "sense:行街": ["行"]},
    )
    assert pinned(u) == {"sense:我的": [{"jyutping": "ngo5"}], "sense:行街": [None]}


def test_every_scheme_the_orthography_pins_and_ruby_only_on_its_ruby_layers() -> None:
    t = word("知", "知", jyutping="zi1", pinyin="zhī")
    u = course(LZH, [[t]], {"sense:知": ["知"]})
    assert pinned_schemes([u], LZH) == ["jyutping", "pinyin"]
    [out], _ = pin_kc_readings([u], [LZH], lambda _o: ["pinyin"], lambda _o: HAN)
    form = first_token(out, LZH)
    assert form["readings"] == {"jyutping": "zi1", "pinyin": "zhī"}
    assert form["ruby"] == {"pinyin": [{"base": "知", "text": "zhī"}]}


def test_classical_chinese_cards_read_a_character_by_its_sense(core_cli: CoreCli) -> None:
    """知 "know" is zhī, 知.zhi "wisdom" (智) zhì: the card of each shows its own reading, which a
    lookup by spelling (the old audio planner's and app's) got wrong for the second."""
    _, compiled = build(core_cli, "lzh")
    forms = {
        k.id: (k.forms or {})[LZH][0].tokens[0].readings or {}
        for u in compiled.units
        for k in u.kcs
        if LZH in (k.forms or {})
    }
    assert forms["sense:知"] == {"baxter": "trje", "jyutping": "zi1", "pinyin": "zhī"}
    assert forms["sense:知.zhi"] == {"baxter": "trjeH", "jyutping": "zi3", "pinyin": "zhì"}
    assert forms["sense:有.you"]["pinyin"] == "yòu"
    assert forms["sense:強.qiang"]["pinyin"] == "qiǎng"


def test_biblical_hebrew_ad_s_card_reads_the_free_form(core_cli: CoreCli) -> None:
    """The owner's D44: עַד's card (and its clip) says the free ʿaḏ, which its entry chooses, not
    the maqaf-bound ʿaḏ- its lessons tie with. כִּי and עַל keep the bound forms most lessons
    give them (kî-, ʿal-)."""
    _, compiled = build(core_cli, "hbo")
    forms = {
        k.id: (k.forms or {})[HBO][0].tokens[0].readings
        for u in compiled.units
        for k in u.kcs
        if HBO in (k.forms or {})
    }
    assert forms["sense:ad"] == {"tiberian": "ʿaḏ"}
    assert forms["sense:ki"] == {"tiberian": "kî-"}
    assert forms["sense:al"] == {"tiberian": "ʿal-"}


def test_no_clip_of_any_course_is_stale(core_cli: CoreCli) -> None:
    """Every synthesized clip says what its voice reads now, in every course: the compiler checks
    it (`audio.stale`), except where a voice too broken to ship skips the audio (grc, ADR 0091),
    which this checks too. Word cards are read from the readings their forms pin (ADR 0117)."""
    for name in ("grc", "hbo", "tok"):
        _, compiled = build(core_cli, name)
        audio = compiled.course.audio
        assert audio is not None and audio.voices
        index = read_index(audio_dir(ROOT / "courses" / name))
        voices = list(audio.voices)
        checked = checked_voices(index, voices)
        reads = {
            (v.provider, v.voice, i.item): i.input
            for v in voices
            for i in plan(compiled.units, v, compiled.written, voices, checked)[0]
        }
        clips = [c for c in index.clips if c.synthesis is not None]
        assert clips, name
        kcs = {k.id for u in compiled.units for k in u.kcs}
        assert any(c.item in kcs for c in clips), name  # word cards have clips
        for c in clips:
            assert c.synthesis is not None
            key = (c.synthesis.provider, c.synthesis.voice, c.item)
            assert reads.get(key) == c.synthesis.input, (name, c.item)
