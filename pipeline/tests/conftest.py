import os
from collections.abc import Iterator
from pathlib import Path

import pytest

from nabu.corecli import CoreCli

ROOT = Path(__file__).resolve().parents[2]
SCHEMAS = ROOT / "schemas"
PROFILES = ROOT / "profiles"
EXAMPLES = SCHEMAS / "examples"
CORE_CLI = ROOT / "packages" / "core-cli" / "src" / "main.ts"
FIXTURES = Path(__file__).parent / "fixtures"
# CI sets this so missing analyzers or ICU fail instead of skipping.
REQUIRE_TOOLS = os.environ.get("NABU_REQUIRE_TOOLS") == "1"

__all__ = [
    "CORE_CLI",
    "EXAMPLES",
    "FIXTURES",
    "PROFILES",
    "REQUIRE_TOOLS",
    "ROOT",
    "SCHEMAS",
    "CoreCli",
]


@pytest.fixture(scope="session")
def core_cli() -> Iterator[CoreCli]:
    c = CoreCli()
    yield c
    c.close()
