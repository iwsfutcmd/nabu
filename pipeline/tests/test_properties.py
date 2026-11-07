"""Hypothesis properties through core-cli: the same guarantees as the fast-check suite
(packages/core-cli/test/properties.test.ts), checked across the Python-Node boundary."""

from __future__ import annotations

import unicodedata

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from .conftest import CoreCli

PROFILES = {
    "fa-Arab/standard": "".join(
        map(chr, (0x6A9, 0x62A, 0x627, 0x628, 0x647, 0x631, 0x648, 0x6CC, 0x643, 0x64A, 0x649))
    ),
    "yue-Hant-HK/standard": "".join(
        map(chr, (0x6211, 0x54CB, 0x53BB, 0x98F2, 0x8336, 0x5566, 0x4FC2, 0x7CFB, 0x88CF, 0x88E1))
    ),
    "uz-Latn/standard": "MenozbktilaryapgOGshch" + chr(0x2BB) + chr(0x2BC),
    "tr-Latn/standard": "Istanbuldayorum" + "".join(map(chr, (0x130, 0x131, 0x15F, 0xE2, 0x11F))),
    "ar-Arab/standard": "".join(
        map(chr, (0x623, 0x625, 0x627, 0x643, 0x644, 0x62A, 0x629, 0x647, 0x649, 0x64A))
    ),
    "es-Latn/standard": "Miabuelst"
    + "".join(map(chr, (0xE1, 0xE9, 0xED, 0xF3, 0xFA, 0xFC, 0xF1, 0xD1, 0xBF, 0xA1))),
}
NOISE = " ,.!?'`-" + "".join(
    map(
        chr,
        (
            0xA0,
            0x3000,
            0x2018,
            0x2019,
            0x61F,
            0x60C,
            0xFF01,
            0x200C,
            0x200D,
            0x200F,
            0x2067,
            0x640,
            0x6F4,
            0x664,
            0x301,
            0x64E,
            0xFEFB,
        ),
    )
)
ACCEPT = {
    "fa-Arab/standard": "".join(map(chr, (0x6A9, 0x62A, 0x627, 0x628, 0x200C, 0x647, 0x627)))
    + " "
    + "".join(map(chr, (0x631, 0x648, 0x6CC))),
    "yue-Hant-HK/standard": "".join(map(chr, (0x6211, 0x54CB, 0x53BB, 0x98F2, 0x8336)))
    + "["
    + chr(0x5566)
    + "]",
    "uz-Latn/standard": "[Men] o'zbek tilini o'rganyapman",
    "tr-Latn/standard": chr(0x130) + "stanbul'da ya" + chr(0x15F) + chr(0x131) + "yorum",
    "ar-Arab/standard": "".join(map(chr, (0x623, 0x643, 0x644, 0x62A))),
    "es-Latn/standard": chr(0xBF) + "Mi abuela [ya] est" + chr(0xE1) + " en La Habana?",
}
SETTINGS = settings(
    max_examples=60, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture]
)


def texts(profile: str) -> st.SearchStrategy[str]:
    return st.text(alphabet=PROFILES[profile] + NOISE, max_size=20)


@SETTINGS
@given(st.sampled_from(sorted(PROFILES)).flatmap(lambda p: st.tuples(st.just(p), texts(p))))
def test_normalize_is_idempotent(core_cli: CoreCli, case: tuple[str, str]) -> None:
    profile, text = case
    once = core_cli.result("normalize", profile=profile, text=text)
    assert core_cli.result("normalize", profile=profile, text=once) == once


@SETTINGS
@given(st.sampled_from(sorted(ACCEPT)).flatmap(lambda p: st.tuples(st.just(p), texts(p))))
def test_grade_is_invariant_under_nfc_vs_nfd(core_cli: CoreCli, case: tuple[str, str]) -> None:
    profile, answer = case
    nfc = core_cli.result(
        "grade",
        profile=profile,
        accept=ACCEPT[profile],
        answer=unicodedata.normalize("NFC", answer),
    )
    nfd = core_cli.result(
        "grade",
        profile=profile,
        accept=ACCEPT[profile],
        answer=unicodedata.normalize("NFD", answer),
    )
    assert (nfd["verdict"], nfd["notes"], nfd["matched"]) == (
        nfc["verdict"],
        nfc["notes"],
        nfc["matched"],
    )


@SETTINGS
@given(st.sampled_from(sorted(ACCEPT)).flatmap(lambda p: st.tuples(st.just(p), texts(p))))
def test_alignment_conserves_answer_units(core_cli: CoreCli, case: tuple[str, str]) -> None:
    profile, answer = case
    graded = core_cli.result("grade", profile=profile, accept=ACCEPT[profile], answer=answer)
    typed = [op["actual"] for op in graded["alignment"] if op["op"] != "delete"]
    assert typed == core_cli.result("units", profile=profile, text=answer)
