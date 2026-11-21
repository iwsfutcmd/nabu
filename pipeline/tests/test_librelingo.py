from pathlib import Path

import yaml

from nabu.compiler import compile_course
from nabu.importers.librelingo import import_course, write

from .conftest import FIXTURES, CoreCli


def test_imports_librelingo_course(tmp_path: Path, core_cli: CoreCli) -> None:
    imported = import_course(FIXTURES / "librelingo", "uz-from-librelingo", "uz-Latn/standard")
    assert imported.course["license"] == "CC0-1.0"
    assert imported.course["target"] == "uz-Latn"
    assert imported.course["lexicon"] == "uz"
    unit = imported.units["basics"]
    # New words are lexemes of the course's own lexicon, introduced by the skill's node.
    assert [e["id"] for e in imported.lexemes] == ["lexeme:rahmat", "lexeme:salom"]
    assert unit["nodes"][0]["introduces"] == ["lexeme:salom", "lexeme:rahmat"]
    salom = next(e for e in imported.lexemes if e["id"] == "lexeme:salom")
    assert salom["gloss"] == {"en": "hello"}
    assert salom["spelled"] == {"uz-Latn/standard": ["salom"]}
    first = unit["sentences"][0]
    assert first["forms"]["uz-Latn/standard"]["reverse"] == "Salom!\nAssalomu alaykum!"
    assert first["translations"]["en"] == "Hello!\nHi!"
    assert first["forms"]["uz-Latn/standard"]["tokens"][0] == {
        "surface": "Salom",
        "lexeme": "salom",
    }
    # notation characters in LibreLingo text are escaped
    assert unit["sentences"][1]["forms"]["uz-Latn/standard"]["reverse"] == "Rahmat \\(katta\\)!"


def test_an_imported_course_is_one_file_with_its_own_lexicon_and_compiles(
    tmp_path: Path, core_cli: CoreCli
) -> None:
    imported = import_course(FIXTURES / "librelingo", "uz-from-librelingo", "uz-Latn/standard")
    write(imported, tmp_path / "course")
    assert sorted(p.name for p in (tmp_path / "course").iterdir()) == ["course.yaml"]
    data = yaml.safe_load((tmp_path / "course" / "course.yaml").read_text(encoding="utf-8"))
    assert [u["id"] for u in data["units"]] == ["basics"]
    assert data["own"]["lexicon"]["language"] == data["own"]["language"]["id"] == "uz"
    assert [e["id"] for e in data["own"]["lexicon"]["lexemes"]] == [
        "lexeme:rahmat",
        "lexeme:salom",
    ]
    # It compiles from its own lexicon; what the import cannot know shows up as warnings.
    diags, compiled = compile_course(tmp_path / "course", core_cli)
    assert not diags.errors, [d.format() for d in diags.errors]
    assert compiled is not None
    assert {str(e.id) for e in compiled.lexicon.lexemes} == {"lexeme:rahmat", "lexeme:salom"}
