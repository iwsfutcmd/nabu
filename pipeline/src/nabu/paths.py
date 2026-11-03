"""Repository locations the pipeline reads (profiles, schemas, generated CLDR data, core-cli)."""

from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
PROFILES = REPO / "profiles"
SCHEMAS = REPO / "schemas"
I18N_GENERATED = REPO / "packages" / "i18n" / "src" / "generated"
CORE_CLI = REPO / "packages" / "core-cli" / "src" / "main.ts"
