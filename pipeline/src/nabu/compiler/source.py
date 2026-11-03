"""Loading course sources with a source line for every YAML node, so every diagnostic can say
file:line (Phase 2 acceptance: i+1 violations are reported with file and line)."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import yaml

from nabu.compiler.diagnostics import Loc

Path_ = tuple[str | int, ...]


@dataclass(frozen=True)
class Doc:
    """One YAML document (or an inline unit inside course.yaml) with its line index."""

    file: str
    data: Any
    lines: dict[Path_, int]
    base: Path_ = ()

    def loc(self, *path: str | int) -> Loc:
        full = self.base + path
        while full:
            if full in self.lines:
                return Loc(self.file, self.lines[full])
            full = full[:-1]
        return Loc(self.file, self.lines.get((), 1))

    def sub(self, *path: str | int) -> Doc:
        node: Any = self.data
        for p in path:
            node = node[p]
        return Doc(self.file, node, self.lines, self.base + path)


def _construct(loader: yaml.SafeLoader, node: yaml.Node) -> Any:
    return loader.construct_object(node)  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]


def _build(node: yaml.Node, path: Path_, lines: dict[Path_, int], loader: yaml.SafeLoader) -> Any:
    lines[path] = node.start_mark.line + 1
    if isinstance(node, yaml.MappingNode):
        out: dict[str, Any] = {}
        for key_node, value_node in cast(list[tuple[yaml.Node, yaml.Node]], node.value):
            key = str(_construct(loader, key_node))
            out[key] = _build(value_node, (*path, key), lines, loader)
        return out
    if isinstance(node, yaml.SequenceNode):
        items = cast(list[yaml.Node], node.value)
        return [_build(item, (*path, i), lines, loader) for i, item in enumerate(items)]
    return _construct(loader, node)


def load_doc(path: Path, display: str) -> Doc:
    text = path.read_text(encoding="utf-8")
    loader = yaml.SafeLoader(text)
    try:
        node = loader.get_single_node()
        lines: dict[Path_, int] = {}
        data = None if node is None else _build(node, (), lines, loader)
    finally:
        loader.dispose()  # pyright: ignore[reportUnknownMemberType]
    return Doc(display, data, lines)
