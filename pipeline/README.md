# pipeline/

Python side of Nabu (gameplan §5, §7): the content compiler, analyzers, TTS and alignment, LLM
authoring and model training. Managed with [uv](https://docs.astral.sh/uv/).

Phase 0 contents: Pydantic v2 models generated from `/schemas` (`src/nabu/schema/models.py`,
never hand-edited), a `nabu validate` command, and tests that validate the same profiles and
examples as the TypeScript suite.

```sh
uv sync                      # create .venv
uv run nabu validate ../profiles/*.yaml
uv run pytest
pnpm codegen                 # from the repo root: regenerate TS and Python types
```
