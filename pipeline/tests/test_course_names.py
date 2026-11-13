"""Course and orthography names are course data (ADR 0109). The English UI catalog still carries
them, only so the draft catalogs' translations keep working: its English must be the course's own,
or a translation would be of words the app never shows."""

from __future__ import annotations

import json

import pytest
import yaml

from .conftest import ROOT

EN = ROOT / "packages/i18n/messages/en.json"
CATALOG = json.loads(EN.read_text(encoding="utf-8"))["messages"]
COURSES = sorted(p.parent.name for p in (ROOT / "courses").glob("*/course.yaml"))


@pytest.mark.parametrize("course", COURSES)
def test_every_course_names_itself_in_english(course: str) -> None:
    source = yaml.safe_load((ROOT / "courses" / course / "course.yaml").read_text(encoding="utf-8"))
    english = source["names"]["en"]
    assert english["course"]
    assert sorted(english.get("orthographies", {})) == sorted(source["orthographies"])


@pytest.mark.parametrize("course", COURSES)
def test_the_catalogs_copies_match_the_course(course: str) -> None:
    source = yaml.safe_load((ROOT / "courses" / course / "course.yaml").read_text(encoding="utf-8"))
    english = source["names"]["en"]
    key = f"course.name.{course}"
    if key in CATALOG:
        assert CATALOG[key]["message"] == english["course"]
    for orthography, name in english.get("orthographies", {}).items():
        key = f"orthography.{orthography.replace('/', '.')}"
        if key in CATALOG:
            assert CATALOG[key]["message"] == name, orthography
