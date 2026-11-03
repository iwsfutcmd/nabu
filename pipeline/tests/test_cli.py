from typer.testing import CliRunner

from nabu.cli import app

from .conftest import EXAMPLES, PROFILES

runner = CliRunner()


def test_validate_profiles() -> None:
    result = runner.invoke(app, ["validate", *map(str, sorted(PROFILES.glob("*.yaml")))])
    assert result.exit_code == 0, result.output
    assert result.output.count("✓") == len(list(PROFILES.glob("*.yaml")))


def test_validate_rejects_invalid() -> None:
    bad = EXAMPLES / "tagged-text/invalid/no-script-subtag.json"
    result = runner.invoke(app, ["validate", str(bad)])
    assert result.exit_code == 1
