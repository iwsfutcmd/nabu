"""Generates the data tables orthography profiles refer to (profiles/tables/*.json).

Sources are pinned. Each table records its source and SPDX license
(schemas/data-table.schema.json). Run with `uv run nabu tables`; the output is checked in.
"""

from __future__ import annotations

import io
import json
import urllib.request
import zipfile
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from nabu.paths import I18N_GENERATED

UNICODE_VERSION = "16.0.0"  # matches CLDR 49 (packages/i18n/src/generated/cldr-meta.json)
UNIHAN_URL = f"https://www.unicode.org/Public/{UNICODE_VERSION}/ucd/Unihan.zip"
OPENCC_TAG = "ver.1.1.9"
OPENCC_URL = f"https://raw.githubusercontent.com/BYVoid/OpenCC/{OPENCC_TAG}/data/dictionary/"


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()


def opencc_pairs(name: str) -> list[tuple[str, list[str]]]:
    text = fetch(OPENCC_URL + name).decode("utf-8")
    out: list[tuple[str, list[str]]] = []
    for line in text.splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        key, values = line.split("\t", 1)
        out.append((key, values.split()))
    return out


def union_groups(pairs: Iterable[tuple[str, list[str]]]) -> list[list[str]]:
    """Merges key/value lists into disjoint groups of mutually equivalent forms."""
    parent: dict[str, str] = {}

    def find(x: str) -> str:
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for key, values in pairs:
        for value in values:
            if value != key:
                parent[find(value)] = find(key)
    groups: dict[str, set[str]] = {}
    for x in parent:
        groups.setdefault(find(x), set()).add(x)
    return sorted((sorted(g) for g in groups.values() if len(g) > 1), key=lambda g: g[0])


def hk_tw_variants() -> dict[str, Any]:
    pairs = opencc_pairs("HKVariants.txt") + opencc_pairs("TWVariants.txt")
    return {
        "id": "hk-tw-variants",
        "kind": "variants",
        "source": f"OpenCC {OPENCC_TAG} HKVariants.txt + TWVariants.txt "
        "(OpenCC standard, HK and TW forms)",
        "license": "Apache-2.0",
        "groups": union_groups(pairs),
    }


def hant_exemplars() -> set[str]:
    """CLDR's yue_Hant main and auxiliary exemplars (packages/i18n/src/generated/exemplars.json)."""
    data = json.loads((I18N_GENERATED / "exemplars.json").read_text(encoding="utf-8"))["yue"]
    return {c for kind in ("main", "auxiliary") for item in data.get(kind, []) for c in item}


def hans_only() -> dict[str, Any]:
    """Characters that occur only in Simplified writing: S→T keys never used as a Traditional form.

    OpenCC's Traditional is the orthodox (Kangxi) standard, so HK and TW standard forms (群 床 峰)
    and characters HK Cantonese writes as they are (晒 saai3) look Simplified to it. Anything in
    HKVariants or TWVariants, or in CLDR's yue_Hant exemplars, is therefore not Simplified-only.
    """
    pairs = opencc_pairs("STCharacters.txt")
    traditional = {t for _, ts in pairs for t in ts}
    traditional |= {
        c
        for key, values in opencc_pairs("HKVariants.txt") + opencc_pairs("TWVariants.txt")
        for c in (key, *values)
    }
    traditional |= hant_exemplars()
    chars = sorted(s for s, ts in pairs if s not in traditional and s not in ts)
    return {
        "id": "hans-only",
        "kind": "charset",
        "source": f"OpenCC {OPENCC_TAG} STCharacters.txt (keys never used as a Traditional form), "
        "less HKVariants/TWVariants forms and CLDR yue_Hant exemplars",
        "license": "Apache-2.0",
        "chars": "".join(chars),
    }


def jyutping_readings() -> dict[str, Any]:
    archive = zipfile.ZipFile(io.BytesIO(fetch(UNIHAN_URL)))
    readings: dict[str, list[str]] = {}
    with archive.open("Unihan_Readings.txt") as f:
        for raw in io.TextIOWrapper(f, encoding="utf-8"):
            if not raw.startswith("U+"):
                continue
            code, field, value = raw.rstrip("\n").split("\t")
            char = chr(int(code[2:], 16))
            if field == "kCantonese":
                found = value.split()
            elif field == "kSMSZD2003Readings":
                # "xíng粵hang4 xíng,xìng粵hang6 háng粵hong4": the Cantonese reading follows 粵
                # Each Cantonese part may hold several readings, comma-separated ("wán粵jyun4,jyun2"):
                # each is a reading of its own.
                found = [
                    r for t in value.split() if "\u7cb5" in t for r in t.split("\u7cb5", 1)[1].split(",") if r
                ]
            else:
                continue
            merged = readings.setdefault(char, [])
            merged.extend(r for r in found if r not in merged)
    return {
        "id": "jyutping-ime",
        "kind": "readings",
        "source": f"Unihan {UNICODE_VERSION} kCantonese + kSMSZD2003Readings "
        "(Jyutping; mostly literary readings, few colloquial ones)",
        "license": "Unicode-3.0",
        "readings": dict(sorted(readings.items())),
    }


def dump(table: dict[str, Any]) -> str:
    """One entry per line for the big members, so updates produce readable diffs."""
    head = {k: v for k, v in table.items() if k not in ("groups", "readings", "chars")}
    lines = [f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}" for k, v in head.items()]
    if "groups" in table:
        body = ",\n".join(f"    {json.dumps(g, ensure_ascii=False)}" for g in table["groups"])
        lines.append(f'  "groups": [\n{body}\n  ]')
    if "readings" in table:
        entries = table["readings"].items()
        body = ",\n".join(
            f"    {json.dumps(c, ensure_ascii=False)}: {json.dumps(r)}" for c, r in entries
        )
        lines.append(f'  "readings": {{\n{body}\n  }}')
    if "chars" in table:
        lines.append(f'  "chars": {json.dumps(table["chars"], ensure_ascii=False)}')
    return "{\n" + ",\n".join(lines) + "\n}\n"


def generate(out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for table in (hk_tw_variants(), hans_only(), jyutping_readings()):
        path = out_dir / f"{table['id']}.json"
        path.write_text(dump(table), encoding="utf-8")
        written.append(path)
    return written
