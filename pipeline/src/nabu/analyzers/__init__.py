"""Language analyzers for compiler stage 3 (§7.5). Each is optional: when its package is not
installed the compiler relies on pinned data and records the analyzer as absent in the manifest.
Readings pinned in the source always win; analyzers only fill gaps and raise warnings."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from importlib import metadata
from typing import Protocol


class Analyzer(Protocol):
    name: str
    version: str

    def segment(self, text: str) -> list[str] | None: ...

    def reading(self, scheme: str, text: str) -> str | None: ...


def _version(dist: str) -> str | None:
    try:
        return metadata.version(dist)
    except metadata.PackageNotFoundError:
        return None


@dataclass
class Cantonese:
    """PyCantonese (MIT): word segmentation and Jyutping."""

    name: str = "pycantonese"
    version: str = ""

    def segment(self, text: str) -> list[str] | None:
        import pycantonese  # pyright: ignore[reportMissingTypeStubs]

        return [str(w) for w in pycantonese.segment(text)]  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]

    def reading(self, scheme: str, text: str) -> str | None:
        if scheme != "jyutping":
            return None
        import pycantonese  # pyright: ignore[reportMissingTypeStubs]

        from nabu.compiler.text import SYLLABLE

        pairs = pycantonese.characters_to_jyutping(text)  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        syllables: list[str] = []
        for _word, jp in pairs:  # pyright: ignore[reportUnknownVariableType]
            if not jp:
                return None
            syllables.extend(SYLLABLE.findall(str(jp)))  # pyright: ignore[reportUnknownArgumentType]
        return " ".join(syllables)


@dataclass
class Persian:
    """hazm (MIT): Persian tokenization."""

    name: str = "hazm"
    version: str = ""

    def segment(self, text: str) -> list[str] | None:
        import hazm  # pyright: ignore[reportMissingTypeStubs]

        return [str(w) for w in hazm.word_tokenize(text)]  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]

    def reading(self, scheme: str, text: str) -> str | None:
        return None


def analyzers_by_tool() -> dict[str, Analyzer]:
    """Installed analyzers, keyed by the profile's `segmentation.content` value."""
    out: dict[str, Analyzer] = {}
    if (v := _version("pycantonese")) is not None:
        out["pycantonese"] = Cantonese(version=v)
    if (v := _version("hazm")) is not None:
        out["hazm"] = Persian(version=v)
    return out


ALL_TOOLS = ("pycantonese", "hazm")


def versions(found: dict[str, Analyzer], tools: Iterable[str] = ALL_TOOLS) -> dict[str, str]:
    """analyzer.<tool> → version (or "absent") for each of `tools` that is a known analyzer."""
    return {
        f"analyzer.{t}": (found[t].version if t in found else "absent")
        for t in ALL_TOOLS
        if t in set(tools)
    }
