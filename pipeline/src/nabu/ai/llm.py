"""Models for the authoring side (gameplan §13.1, §13.5), configured like the server's gateway.

    NABU_LLM            ollama | openai | anthropic   (unset: no model)
    NABU_LLM_MODEL      the model name (required; there is no default)
    NABU_LLM_URL        base URL (ollama: http://127.0.0.1:11434; openai: https://api.openai.com/v1;
                        anthropic: https://api.anthropic.com)
    NABU_LLM_KEY        API key, else OPENAI_API_KEY / ANTHROPIC_API_KEY (environment only)

Prompt templates are the repository's prompts/*.md, referenced by hash (the first 12 hex digits
of the file's SHA-256, as the server computes it); drafts carry `llm:<model>@<hash>`.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

from nabu.paths import REPO

PROMPTS = REPO / "prompts"
SYSTEM = (
    "You are a careful assistant inside a language-learning app. "
    "Follow the task exactly and answer with JSON only."
)
PLACEHOLDER = re.compile(r"\{\{([a-z][a-zA-Z0-9]*)\}\}")

Transport = Callable[[str, dict[str, str], bytes], bytes]


class NoModel(RuntimeError):
    """No model is configured; nothing is invented in its place."""


class ModelError(RuntimeError):
    pass


@dataclass(frozen=True)
class Prompt:
    id: str
    source: str
    hash: str


def load_prompt(prompt_id: str, directory: Path = PROMPTS) -> Prompt:
    data = (directory / f"{prompt_id}.md").read_bytes()
    return Prompt(prompt_id, data.decode("utf-8"), hashlib.sha256(data).hexdigest()[:12])


def render(source: str, values: Mapping[str, str]) -> str:
    def fill(m: re.Match[str]) -> str:
        name = m.group(1)
        if name not in values:
            raise KeyError(f"prompt placeholder {{{{{name}}}}} has no value")
        return values[name]

    return PLACEHOLDER.sub(fill, source)


@dataclass(frozen=True)
class Model:
    provider: str
    model: str
    url: str
    key: str | None
    transport: Transport

    def complete(
        self, prompt: str, schema: dict[str, Any], name: str, max_tokens: int = 4000
    ) -> Any:
        """The model's JSON answer to `prompt` (not yet validated: callers validate)."""
        headers = {"Content-Type": "application/json"}
        if self.provider == "ollama":
            body: dict[str, Any] = {
                "model": self.model,
                "stream": False,
                "format": schema,
                "options": {"temperature": 0.7, "num_predict": max_tokens},
                "messages": [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": prompt},
                ],
            }
            reply = self._post(f"{self.url}/api/chat", headers, body)
            return _json_text(cast(dict[str, Any], reply.get("message") or {}).get("content"))
        if self.provider == "openai":
            if self.key:
                headers["Authorization"] = f"Bearer {self.key}"
            body = {
                "model": self.model,
                "temperature": 0.7,
                "max_tokens": max_tokens,
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {"name": name, "schema": schema, "strict": False},
                },
                "messages": [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": prompt},
                ],
            }
            reply = self._post(f"{self.url}/chat/completions", headers, body)
            choices = cast(list[dict[str, Any]], reply.get("choices") or [{}])
            return _json_text(cast(dict[str, Any], choices[0].get("message") or {}).get("content"))
        # anthropic: structured output through a forced tool call
        headers |= {"x-api-key": self.key or "", "anthropic-version": "2023-06-01"}
        body = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": SYSTEM,
            "tools": [{"name": name, "description": "Return the answer.", "input_schema": schema}],
            "tool_choice": {"type": "tool", "name": name},
            "messages": [{"role": "user", "content": prompt}],
        }
        reply = self._post(f"{self.url}/v1/messages", headers, body)
        for block in cast(list[dict[str, Any]], reply.get("content") or []):
            if block.get("type") == "tool_use":
                return block.get("input")
        raise ModelError("the model returned no tool call")

    def _post(self, url: str, headers: dict[str, str], body: dict[str, Any]) -> dict[str, Any]:
        raw = self.transport(url, headers, json.dumps(body, ensure_ascii=False).encode("utf-8"))
        try:
            return cast(dict[str, Any], json.loads(raw))
        except json.JSONDecodeError as error:
            raise ModelError(f"{url}: not JSON") from error


def _json_text(text: object) -> Any:
    if not isinstance(text, str):
        raise ModelError("the model returned no text")
    fenced = re.fullmatch(r"\s*```(?:json)?\s*([\s\S]*?)\s*```\s*", text)
    try:
        return json.loads(fenced.group(1) if fenced else text)
    except json.JSONDecodeError as error:
        raise ModelError("the model's answer is not JSON") from error


DEFAULT_URL = {
    "ollama": "http://127.0.0.1:11434",
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com",
}


def model_from_env(
    env: Mapping[str, str] | None = None, transport: Transport | None = None
) -> Model:
    from nabu.audio.providers import http_post

    env = os.environ if env is None else env
    provider = env.get("NABU_LLM", "")
    if provider not in DEFAULT_URL:
        raise NoModel("no model: set NABU_LLM (ollama, openai or anthropic) and NABU_LLM_MODEL")
    model = env.get("NABU_LLM_MODEL", "")
    if not model:
        raise NoModel("NABU_LLM is set but NABU_LLM_MODEL is not: name the model to use")
    key = env.get("NABU_LLM_KEY") or {
        "openai": env.get("OPENAI_API_KEY"),
        "anthropic": env.get("ANTHROPIC_API_KEY"),
    }.get(provider)
    if provider == "anthropic" and not key:
        raise NoModel(
            "NABU_LLM=anthropic needs ANTHROPIC_API_KEY (or NABU_LLM_KEY) in the environment"
        )
    url = (env.get("NABU_LLM_URL") or DEFAULT_URL[provider]).rstrip("/")
    return Model(provider, model, url, key, transport or http_post)
