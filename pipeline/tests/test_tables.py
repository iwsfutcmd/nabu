"""The generated character tables (`pnpm tables`, nabu.tables): what the grader and the
reading cards rely on."""

import json
import re
from pathlib import Path

TABLES = Path(__file__).resolve().parents[2] / "profiles" / "tables"


def test_every_jyutping_reading_is_one_reading() -> None:
    # Unihan's kSMSZD2003Readings lists several readings of one sense with commas ("jyun4,jyun2");
    # each is a reading of its own. A joined entry was shown to learners as an option ("nai4,nei4")
    # and never matched a homophone. A few characters are read as two syllables (吋 jing1cyun3).
    readings = json.loads((TABLES / "jyutping-ime.json").read_text(encoding="utf-8"))["readings"]
    one = re.compile(r"(?:[a-z]+[1-6])+")
    bad = [(char, r) for char, rs in readings.items() for r in rs if not one.fullmatch(r)]
    assert bad == []
    assert readings["呢"] == ["nai4", "nei4", "ne1"]  # 呢
    assert "sai2" in readings["使"]  # 使: 唔使 m4 sai2, which a joined "si2,sai2" hid
