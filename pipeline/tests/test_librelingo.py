from pathlib import Path

import yaml

from nabu.compiler import compile_course
from nabu.importers.librelingo import import_course, write

from .conftest import FIXTURES, CoreCli


def test_imports_librelingo_course(tmp_path: Path, core_cli: CoreCli) -> None:
    imported = import_course(FIXTURES / "librelingo", "uz-from-librelingo", "uz-Latn/standard")
    assert imported.course["license"] == "CC0-1.0"
    assert imported.course["target"] == "uz-Latn"
    unit = imported.units["basics"]
    assert [k["id"] for k in unit["kcs"]] == ["sense:salom", "sense:rahmat"]
    first = unit["sentences"][0]
    assert first["forms"]["uz-Latn/standard"]["reverse"] == "Salom!\nAssalomu alaykum!"
    assert first["translations"]["en"] == "Hello!\nHi!"
    assert first["forms"]["uz-Latn/standard"]["tokens"][0] == {"surface": "Salom", "sense": "salom"}
    # notation characters in LibreLingo text are escaped
    assert unit["sentences"][1]["forms"]["uz-Latn/standard"]["reverse"] == "Rahmat \\(katta\\)!"

    write(imported, tmp_path / "course")
    assert yaml.safe_load((tmp_path / "course" / "course.yaml").read_text(encoding="utf-8"))[
        "units"
    ] == ["units/basics.yaml"]
    # the imported course compiles; what the import cannot know shows up as lints, not crashes
    diags, _ = compile_course(tmp_path / "course", core_cli)
    assert all(d.lint != "parse.schema" for d in diags.items), [d.format() for d in diags.items]
