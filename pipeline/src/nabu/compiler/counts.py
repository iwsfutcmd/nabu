"""The manifest's license and provenance summary (§7.1): what it counts, one entry each (a source
sentence, a KC image, a clip), so a release build (compiler/release.py) counts only what ships."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from nabu.compiler.build import Compiled


@dataclass(frozen=True)
class Counted:
    """One thing the summary counts."""

    item: str  # a sentence id, an image's bundle path, an audio item id
    license: str | None
    status: str | None
    author: str | None


def add_count(licenses: dict[str, int], provenance: dict[str, int], c: Counted) -> None:
    """Adds one counted thing to a license and a provenance summary."""
    if c.license is not None:
        licenses[c.license] = licenses.get(c.license, 0) + 1
    if c.status is not None and c.author is not None:
        for key in (f"status.{c.status}", f"author.{c.author.split(':', 1)[0]}"):
            provenance[key] = provenance.get(key, 0) + 1


def count(compiled: Compiled, c: Counted) -> None:
    """Counts one thing in the manifest's summaries, and remembers it."""
    compiled.counted.append(c)
    add_count(compiled.licenses, compiled.provenance, c)
