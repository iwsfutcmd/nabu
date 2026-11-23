"""Phase 2 acceptance: bundle builds are byte-for-byte deterministic and content-addressed."""

from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
from typing import Any, cast

import pytest

from nabu import yamlio
from nabu.analyzers import analyzers_by_tool
from nabu.compiler import compile_course, load_profiles, write_bundle
from nabu.compiler.build import lexicons_dir
from nabu.compiler.package import canonical, credit_id
from nabu.items import lexicon_json
from nabu.schema.models import BundleLexicon, BundleManifest, BundleUnit

from .conftest import FIXTURES, ROOT, CoreCli
from .fixtures.make_lint_fixtures import CLEAN, ES, add_lexeme, with_copula

COURSES = sorted(p.parent for p in (ROOT / "courses").glob("*/course.yaml"))


def build(cli: CoreCli, course: Path, out: Path) -> dict[str, object]:
    profiles = load_profiles()
    analyzers = analyzers_by_tool()
    diags, compiled = compile_course(course, cli, profiles, analyzers)
    assert compiled is not None, [d.format() for d in diags.items]
    return write_bundle(compiled, profiles, analyzers, out)


def tree(root: Path) -> dict[str, bytes]:
    return {
        p.relative_to(root).as_posix(): p.read_bytes()
        for p in sorted(root.rglob("*"))
        if p.is_file()
    }


@pytest.mark.parametrize(
    "course", [FIXTURES / "clean.yaml", *COURSES], ids=lambda p: p.stem if p.suffix else p.name
)
def test_builds_are_byte_for_byte_deterministic(
    core_cli: CoreCli, course: Path, tmp_path: Path
) -> None:
    a = build(core_cli, course, tmp_path / "a")
    b = build(core_cli, course, tmp_path / "b")
    assert a["id"] == b["id"]
    assert tree(tmp_path / "a") == tree(tmp_path / "b")


def test_bundle_is_content_addressed_and_valid(core_cli: CoreCli, tmp_path: Path) -> None:
    manifest = build(core_cli, FIXTURES / "clean.yaml", tmp_path)
    BundleManifest.model_validate(manifest)
    body = {k: v for k, v in manifest.items() if k != "id"}
    assert manifest["id"] == hashlib.sha256(canonical(body)).hexdigest()
    for f in BundleManifest.model_validate(manifest).files:
        data = (tmp_path / f.path).read_bytes()
        assert hashlib.sha256(data).hexdigest() == f.sha256
        assert f.sha256[:16] in f.path
    unit = json.loads((tmp_path / manifest["units"][0]["file"]).read_text(encoding="utf-8"))  # type: ignore[index]
    BundleUnit.model_validate(unit)
    BundleLexicon.model_validate(_lexicon(tmp_path, manifest))
    for f in BundleManifest.model_validate(manifest).files:
        assert f.bytes == (tmp_path / f.path).stat().st_size


def _lexicon(out: Path, manifest: dict[str, object]) -> dict[str, Any]:
    """A bundle's one lexicon file, as JSON."""
    files = cast(list[dict[str, Any]], manifest["files"])
    [file] = [f for f in files if f["role"] == "lexicon"]
    return cast(dict[str, Any], json.loads((out / file["path"]).read_text(encoding="utf-8")))


def _strings(data: object) -> set[str]:
    if isinstance(data, str):
        return {data}
    if isinstance(data, dict):
        return {s for v in cast(dict[str, object], data).values() for s in _strings(v)}
    if isinstance(data, list):
        return {s for v in cast(list[object], data) for s in _strings(v)}
    return set()


@pytest.mark.parametrize("course", COURSES, ids=lambda p: p.name)
def test_every_medium_downloads_with_a_unit(
    core_cli: CoreCli, course: Path, tmp_path: Path
) -> None:
    """Phase 10: a unit's download carries the media its items use, and every medium in the
    bundle belongs to some unit, so downloading every unit makes the whole course offline."""
    raw = build(core_cli, course, tmp_path)
    manifest = BundleManifest.model_validate(raw)
    lexemes = _lexicon(tmp_path, raw)["lexemes"]
    roles = {f.path: f.role for f in manifest.files}
    media = {p for p, role in roles.items() if role in ("audio", "image")}
    listed = {p for u in manifest.units for p in u.assets}
    assert listed == media
    for u in manifest.units:
        assert u.assets == sorted(u.assets)
        unit = json.loads((tmp_path / u.file).read_text(encoding="utf-8"))
        images = {p for p in u.assets if roles[p] == "image"}
        # A unit carries the pictures of the lexemes it names.
        named = _strings(unit)
        assert images <= {e["image"] for e in lexemes if "image" in e and e["id"] in named}


@pytest.mark.parametrize("course", ["tok", "apc"])
def test_credits_are_defined_once(core_cli: CoreCli, course: str, tmp_path: Path) -> None:
    """ADR 0110: the manifest holds each credit's text once, by id; files and clips name the id.
    Every clip of a voice used to repeat its credit, in the manifest and the audio index both."""
    profiles = load_profiles()
    analyzers = analyzers_by_tool()
    diags, compiled = compile_course(ROOT / "courses" / course, core_cli, profiles, analyzers)
    assert compiled is not None, [d.format() for d in diags.items]
    raw = write_bundle(compiled, profiles, analyzers, tmp_path)
    manifest = BundleManifest.model_validate(raw)
    assert manifest.formatVersion == 5
    assert all(credit_id(text) == ident for ident, text in manifest.credits.items())
    named = {f.credit for f in manifest.files if f.credit is not None}
    # Each text once in the manifest (and nowhere in the audio index, below).
    text = (tmp_path / "manifest.json").read_text(encoding="utf-8")
    for credit in manifest.credits.values():
        assert text.count(json.dumps(credit, ensure_ascii=False)) == 1, credit
    # Each file and clip credits what it did before: its source, its speaker or voice.
    by_path = {f.path: f for f in manifest.files}
    for path, (_blob, _license, made_by) in compiled.audio_files.items():
        credit = by_path[path].credit
        assert credit is not None and manifest.credits[credit] == made_by
    index = next(f for f in manifest.files if f.role == "audio-index")
    audio = json.loads((tmp_path / index.path).read_text(encoding="utf-8"))["items"]
    clips = 0
    for item, speeds in compiled.audio_items.items():
        for speed, clip in speeds.items():
            bundled = audio[item][speed]
            assert manifest.credits[bundled["credit"]] == clip.credit
            named.add(bundled["credit"])
            clips += 1
    # The credits files and clips name, and nothing else.
    assert clips > len(manifest.credits) > 1
    assert named == set(manifest.credits)
    clip_index = (tmp_path / index.path).read_text(encoding="utf-8")
    assert not any(credit in clip_index for credit in manifest.credits.values())


def _compile(core_cli: CoreCli, tmp_path: Path, course: dict[str, Any]) -> Any:
    tmp_path.mkdir(parents=True, exist_ok=True)
    path = tmp_path / "course.yaml"
    path.write_text(yamlio.dump(course), encoding="utf-8")
    diags, compiled = compile_course(path, core_cli)
    assert compiled is not None, [d.format() for d in diags.items]
    assert [d.format() for d in diags.items] == []
    return compiled


def test_a_lexeme_s_feats_include_its_defaults_and_its_parts_only_what_it_stores(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    """The bundle's lexicon resolves every lexical feature: casa is feminine by the default for
    -a, libro masculine by the one for -o, mano feminine as its entry stores. Only mano's is a
    part to learn, since no default gives it; hermano chooses its gender on each token."""
    compiled = _compile(core_cli, tmp_path, copy.deepcopy(ES))
    entries = {e["id"]: e for e in lexicon_json(compiled.lexicon)["lexemes"]}
    assert {i: e.get("feats") for i, e in entries.items()} == {
        "lexeme:casa": {"Gender": "Fem"},
        "lexeme:el": None,
        "lexeme:hermano": None,
        "lexeme:libro": {"Gender": "Masc"},
        "lexeme:mano": {"Gender": "Fem"},
    }
    assert {i: e["parts"] for i, e in entries.items() if "parts" in e} == {
        "lexeme:mano": ["lexeme:mano|Gender"]
    }
    assert entries["lexeme:hermano"]["chooses"] == ["Gender"]
    assert lexicon_json(compiled.lexicon)["language"] == "es"


def test_a_lexeme_with_only_allomorphs_has_no_forms(core_cli: CoreCli, tmp_path: Path) -> None:
    """The copula -man is written only inside a token (talabaman), so it has allomorphs and no
    spelling of its own: nothing shows it alone, and the bundle gives it no forms."""
    course = copy.deepcopy(CLEAN)
    with_copula(course)
    copula = next(e for e in course["own"]["lexicon"]["lexemes"] if e["id"] == "lexeme:cop-1sg")
    copula["allomorphs"] = [{"spelled": {"uz-Latn/standard": ["man"]}}]
    talaba = next(e for e in course["own"]["lexicon"]["lexemes"] if e["id"] == "lexeme:talaba")
    talaba["spelled"] = {"uz-Latn/standard": ["talaba"]}
    s4 = next(s for s in course["units"][0]["sentences"] if s["id"] == "s.4")
    s4["forms"]["uz-Latn/standard"]["tokens"][1] = {
        "surface": "talabaman",
        "lexemes": [
            {"lexeme": "talaba", "surface": "talaba", "base": True},
            {"lexeme": "cop-1sg", "surface": "man"},
        ],
    }
    compiled = _compile(core_cli, tmp_path, course)
    entries = {e["id"]: e for e in lexicon_json(compiled.lexicon)["lexemes"]}
    assert "forms" not in entries["lexeme:cop-1sg"]
    assert entries["lexeme:cop-1sg"]["realises"] == {"Number": "Sing", "Person": "1"}
    assert [
        f["tokens"][0]["surface"] for f in entries["lexeme:talaba"]["forms"]["uz-Latn/standard"]
    ] == ["talaba"]


def test_the_bundle_ships_only_the_lexemes_the_course_uses(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    """A language's lexicon may hold lexemes another course of it teaches: those this course
    neither introduces nor writes are not in its bundle."""
    course = copy.deepcopy(CLEAN)
    add_lexeme(course, {"id": "lexeme:uy", "pos": "NOUN", "gloss": {"en": "house"}})
    compiled = _compile(core_cli, tmp_path, course)
    shipped = lexicon_json(compiled.lexicon)
    assert [e["id"] for e in shipped["lexemes"]] == ["lexeme:men", "lexeme:salom", "lexeme:talaba"]
    assert [r["id"] for r in shipped["rules"]] == ["rule:copula-man"]


def test_a_course_reads_the_lexicon_beside_it_and_a_one_file_course_its_own(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    """A course of the repo shares its language's lexicon, in lexicons/ beside courses/; a course
    kept in one file carries its own (`own`), whatever folder it is in."""
    assert lexicons_dir(ROOT / "courses" / "uz" / "course.yaml") == ROOT / "lexicons"
    home = tmp_path / "courses" / "mine"
    home.mkdir(parents=True)
    assert lexicons_dir(home / "course.yaml") == tmp_path / "lexicons"

    # The clean course with its lexicon moved out of the file, into lexicons/uz beside it.
    course = copy.deepcopy(CLEAN)
    own = course.pop("own")
    (tmp_path / "lexicons" / "uz").mkdir(parents=True)
    (tmp_path / "lexicons" / "uz" / "lexemes.yaml").write_text(
        yamlio.dump(own["lexicon"]), encoding="utf-8"
    )
    (tmp_path / "lexicons" / "uz" / "language.yaml").write_text(
        yamlio.dump(own["language"]), encoding="utf-8"
    )
    (home / "course.yaml").write_text(yamlio.dump(course), encoding="utf-8")
    diags, beside = compile_course(home, core_cli)
    assert beside is not None, [d.format() for d in diags.items]
    assert [d.format() for d in diags.items] == []
    # The one-file course, kept where a lexicons/ folder is in reach: its own lexicon wins.
    one_file = _compile(core_cli, tmp_path / "elsewhere", copy.deepcopy(CLEAN))
    assert lexicon_json(beside.lexicon) == lexicon_json(one_file.lexicon)

    # With no lexicon beside it and none of its own, a course does not compile, and says where
    # it looked.
    (tmp_path / "lexicons" / "uz" / "lexemes.yaml").unlink()
    diags, none = compile_course(home, core_cli)
    assert none is None
    assert [d.message for d in diags.items] == ["no lexemes.yaml for uz"]


def _parts(compiled: Any) -> dict[str, list[str]]:
    return {s.id: [str(p) for p in s.parts] for u in compiled.units for s in u.sentences}


def test_a_sentence_s_parts_are_its_lexemes_its_taught_values_and_a_stored_gender_shown(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    """A sentence's parts: the lexemes its tokens write; the feature values they carry that a
    node has introduced by the sentence's own (the feminine from the second lesson: la casa,
    in the first, carries it and does not list it); and mano's stored gender, which the article
    that agrees with it shows (ADR 0146)."""
    compiled = _compile(core_cli, tmp_path, copy.deepcopy(ES))
    assert _parts(compiled) == {
        "s.1": ["lexeme:el", "lexeme:casa"],
        "s.2": ["lexeme:el", "lexeme:mano", "lexeme:mano|Gender"],
        "s.3": ["lexeme:el", "lexeme:libro"],
        "s.4": ["lexeme:el", "feature:Gender=Fem", "lexeme:hermano"],
    }
    # Moved to the second lesson, la casa lists the feminine its article carries.
    course = copy.deepcopy(ES)
    course["units"][0]["sentences"][0]["node"] = "basics.2"
    moved = _compile(core_cli, tmp_path / "moved", course)
    assert _parts(moved)["s.1"] == ["lexeme:el", "feature:Gender=Fem", "lexeme:casa"]


def test_a_stored_gender_is_a_part_only_where_a_token_agrees_with_it(
    core_cli: CoreCli, tmp_path: Path
) -> None:
    """mano's gender is shown by a token whose head it is and which has its value: an article
    with no relation to it, or one of the other gender, shows nothing of it."""
    course = copy.deepcopy(ES)
    tokens = course["units"][0]["sentences"][1]["forms"]["es-Latn/standard"]["tokens"]
    for t in tokens:
        for key in ("n", "head", "rel"):
            t.pop(key, None)
    apart = _compile(core_cli, tmp_path / "apart", course)
    assert _parts(apart)["s.2"] == ["lexeme:el", "lexeme:mano"]

    course = copy.deepcopy(ES)
    article = course["units"][0]["sentences"][1]["forms"]["es-Latn/standard"]["tokens"][0]
    article["feats"]["Gender"] = "Masc"
    masculine = _compile(core_cli, tmp_path / "masculine", course)
    assert _parts(masculine)["s.2"] == ["lexeme:el", "lexeme:mano"]


def test_a_sentence_lists_the_rules_it_uses(core_cli: CoreCli, tmp_path: Path) -> None:
    """A rule the language names is a part of the sentences that say they use it, after the
    lexemes their tokens write."""
    compiled = _compile(core_cli, tmp_path, copy.deepcopy(CLEAN))
    assert _parts(compiled)["s.4"] == ["lexeme:men", "lexeme:talaba", "rule:copula-man"]
    assert _parts(compiled)["s.3"] == ["lexeme:salom", "lexeme:talaba"]


def _diagnostics(core_cli: CoreCli, tmp_path: Path, course: dict[str, Any]) -> list[str]:
    tmp_path.mkdir(parents=True, exist_ok=True)
    path = tmp_path / "course.yaml"
    path.write_text(yamlio.dump(course), encoding="utf-8")
    diags, _ = compile_course(path, core_cli)
    return [f"{d.lint}: {d.message}" for d in diags.items]


def test_a_token_s_relations_and_values_are_checked(core_cli: CoreCli, tmp_path: Path) -> None:
    """A head the form does not number, and a feature value the language does not declare, are
    each said in a line that names the sentence and the lexeme."""
    course = copy.deepcopy(ES)
    article = course["units"][0]["sentences"][0]["forms"]["es-Latn/standard"]["tokens"][0]
    article["head"] = 5
    assert _diagnostics(core_cli, tmp_path / "head", course) == [
        "parse.token-relation: s.1: lexeme:el points at lexeme 5, which the form does not number"
    ]
    course = copy.deepcopy(ES)
    article = course["units"][0]["sentences"][0]["forms"]["es-Latn/standard"]["tokens"][0]
    article["feats"]["Gender"] = "Neut"
    assert _diagnostics(core_cli, tmp_path / "value", course) == [
        "lexicon.undeclared: s.1: lexeme:el has Gender=Neut, which the language does not declare"
    ]
