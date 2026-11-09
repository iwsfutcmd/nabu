"""YAML output that keeps invisible characters visible: any string holding one (ZWNJ, bidi
controls, BOM, ...) is written double-quoted with backslash-u escapes, never literally (CLAUDE.md).
Multi-line strings (accept sets: one alternative per line) are written as literal blocks."""

from __future__ import annotations

import re
from typing import Any

import yaml

# Also the ideographic space (U+3000), between sitelen pona sentences: it reads as two spaces.
INVISIBLE = re.compile(
    "[\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\u3000\ufeff]"
)


class Flow(dict[str, Any]):
    """A mapping written inline: { surface: Salom, sense: salom }."""


class FlowList(list[Any]):
    """A sequence written inline: [a, b]."""


class _Dumper(yaml.SafeDumper):
    pass


def _represent_str(dumper: yaml.SafeDumper, value: str) -> yaml.ScalarNode:
    style = '"' if INVISIBLE.search(value) else "|" if "\n" in value else None
    return dumper.represent_scalar("tag:yaml.org,2002:str", value, style=style)  # pyright: ignore[reportUnknownMemberType]


def _represent_flow(dumper: yaml.SafeDumper, value: Flow) -> yaml.MappingNode:
    return dumper.represent_mapping("tag:yaml.org,2002:map", value, flow_style=True)


def _represent_flow_list(dumper: yaml.SafeDumper, value: FlowList) -> yaml.SequenceNode:
    return dumper.represent_sequence("tag:yaml.org,2002:seq", value, flow_style=True)


_Dumper.add_representer(str, _represent_str)
_Dumper.add_representer(Flow, _represent_flow)
_Dumper.add_representer(FlowList, _represent_flow_list)


def dump(data: Any, width: int = 200) -> str:
    """yaml.safe_dump with unicode kept, key order kept and invisibles escaped."""
    text = yaml.dump(data, Dumper=_Dumper, allow_unicode=True, sort_keys=False, width=width)
    # Only double-quoted scalars can hold an invisible character here, and backslash-u escapes
    # are valid in them.
    return INVISIBLE.sub(lambda m: f"\\u{ord(m.group()):04x}", text)
