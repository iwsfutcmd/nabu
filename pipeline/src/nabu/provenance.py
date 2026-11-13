"""Provenance (schemas/common.schema.json): whether a person has checked an item.

The twin of @nabu/core/corrections `signedOff` (packages/core/src/corrections/signoff.ts)."""

from __future__ import annotations

#: The statuses of an item a person checked: reviewed, and published since.
SIGNED_OFF = ("reviewed", "published")


def signed_off(status: str | None) -> bool:
    """Whether a person checked the item (ADR 0072): it is reviewed or published."""
    return status in SIGNED_OFF
