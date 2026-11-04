"""Phase 8, pipeline side: prompts and the model client, report promotion, and drafting.

No model runs here. A scripted transport stands in for the provider to test the plumbing
(request shapes, validation, provenance, lints); it says nothing about a model's quality.
"""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any

import pytest
import yaml

from nabu.ai.author import draft, load_course, prompt_values
from nabu.ai.llm import PROMPTS, Model, NoModel, load_prompt, model_from_env, render
from nabu.ai.reports import escape_notation, locate, pr_body, promote, read_export
from nabu.compiler import compile_course
from nabu.corecli import CoreCli
from nabu.paths import REPO
from nabu.schema.models import AnswerReport

ZWNJ = "\u200c"


def recorder(reply: Any) -> tuple[list[tuple[str, dict[str, str], dict[str, Any]]], Any]:
    calls: list[tuple[str, dict[str, str], dict[str, Any]]] = []

    def transport(url: str, headers: dict[str, str], body: bytes) -> bytes:
        calls.append((url, headers, json.loads(body)))
        return json.dumps(reply).encode()

    return calls, transport


# ---------------------------------------------------------------------------- prompts, model


def test_prompts_are_hashed_like_the_server() -> None:
    for path in PROMPTS.glob("*.md"):
        p = load_prompt(path.stem)
        assert p.hash == hashlib.sha256(path.read_bytes()).hexdigest()[:12]
    with pytest.raises(KeyError, match="b"):
        render("{{a}} {{b}}", {"a": "1"})


def test_model_from_env_needs_a_model_and_keys() -> None:
    with pytest.raises(NoModel):
        model_from_env({})
    with pytest.raises(NoModel, match="NABU_LLM_MODEL"):
        model_from_env({"NABU_LLM": "ollama"})
    with pytest.raises(NoModel, match="ANTHROPIC_API_KEY"):
        model_from_env({"NABU_LLM": "anthropic", "NABU_LLM_MODEL": "m"})
    assert (
        model_from_env(
            {
                "NABU_LLM": "openai",
                "NABU_LLM_MODEL": "m",
                "NABU_LLM_URL": "http://127.0.0.1:8080/v1/",
            }
        ).url
        == "http://127.0.0.1:8080/v1"
    )


@pytest.mark.parametrize(
    ("provider", "reply", "url"),
    [
        ("ollama", {"message": {"content": '{"ok": 1}'}}, "http://h/api/chat"),
        (
            "openai",
            {"choices": [{"message": {"content": '```json\n{"ok": 1}\n```'}}]},
            "http://h/chat/completions",
        ),
        (
            "anthropic",
            {"content": [{"type": "tool_use", "input": {"ok": 1}}]},
            "http://h/v1/messages",
        ),
    ],
)
def test_each_provider_returns_the_json_it_was_asked_for(
    provider: str, reply: Any, url: str
) -> None:
    calls, transport = recorder(reply)
    model = Model(provider, "m", "http://h", "k", transport)
    assert model.complete("p", {"type": "object"}, "Out") == {"ok": 1}
    assert calls[0][0] == url


# --------------------------------------------------------------------------------- reports


def test_escape_notation_keeps_an_answer_literal() -> None:
    assert escape_notation("I (really) am | not @home") == "I \\(really\\) am \\| not \\@home"
    assert escape_notation("# not a comment") == "\\# not a comment"
    assert escape_notation("  two   spaces ") == "two spaces"


def report(
    course: str,
    orthography: str,
    item: str,
    answer: str,
    template: str = "translate-type.l1-l2",
    status: str = "approved",
    claim: str = "accept",
) -> AnswerReport:
    return AnswerReport.model_validate(
        {
            "id": f"00000000-0000-7000-8000-{abs(hash(answer)) % 10**12:012d}",
            "course": course,
            "orthography": orthography,
            "template": template,
            "item": item,
            "answer": answer,
            "claim": claim,
            "status": status,
            "reports": 3,
            "notes": ["我覺得冇問題"],
            "createdAt": "2026-06-01T00:00:00Z",
        }
    )


@pytest.fixture
def courses(tmp_path: Path) -> Path:
    for c in ("yue", "fa"):
        shutil.copytree(REPO / "courses" / c, tmp_path / c, ignore=shutil.ignore_patterns("audio"))
        # Without the audio directory the audio settings would point nowhere.
        source = (tmp_path / c / "course.yaml").read_text(encoding="utf-8")
        (tmp_path / c / "course.yaml").write_text(
            source.split("\naudio:")[0] + "\n", encoding="utf-8"
        )
    shutil.copytree(REPO / "courses" / "images", tmp_path / "images")
    return tmp_path


def test_promote_adds_weighted_alternatives_and_the_course_still_compiles(
    courses: Path, tmp_path: Path
) -> None:
    reports = [
        report(
            "yue", "yue-Hant-HK/standard", "s.12", "我係一個學生"
        ),  # plain scalar → literal block
        report("yue", "yue-Hant-HK/standard", "s.1", "早晨啊"),  # literal block → one more line
        report(
            "fa", "fa-Arab/standard", "s.28", f"کتاب{ZWNJ}ها خوب{ZWNJ}اند"
        ),  # an invisible → \u escapes
        report("yue", "yue-Hant-HK/standard", "s.13", "我唔係學生"),  # already accepted
        report(
            "yue", "yue-Hant-HK/standard", "s.12", "I am a student", template="translate-tap.l2-l1"
        ),
        report("yue", "yue-Hant-HK/standard", "s.14", "我係一個老師", status="pending"),
        # A story line has no accept set: the reviewer changes the story.
        report(
            "yue",
            "yue-Hant-HK/standard",
            "yue.story.dim-sum/4",
            "我哋去飲茶啦",
            template="story-arrange",
        ),
        # "This should have been wrong": an alternative to take out, by hand.
        report("yue", "yue-Hant-HK/standard", "s.13", "我唔係學生啊", claim="reject"),
    ]
    export = tmp_path / "approved.jsonl"
    export.write_text(
        "".join(r.model_dump_json(exclude_none=True) + "\n" for r in reports), encoding="utf-8"
    )
    with CoreCli() as cli:
        outcome = promote(read_export(export), courses, cli)
        assert [r.answer for r, _, _ in outcome.promoted] == [
            "我係一個學生",
            "早晨啊",
            f"کتاب{ZWNJ}ها خوب{ZWNJ}اند",
        ]
        assert [why.split(" ")[0] for _, why in outcome.skipped] == [
            "already",
            "translate-tap.l2-l1:",
            "status",
            "story-arrange:",
            "should",
        ]
        assert "no accept set" in outcome.skipped[-2][1]
        assert "by hand" in outcome.skipped[-1][1]
        yue = (courses / "yue" / "units" / "intro.yaml").read_text(encoding="utf-8")
        assert "      reverse: |-\n        我係學生\n        我係一個學生 @0.5\n" in yue
        assert "        早晨呀\n        早晨啊 @0.5\n" in yue
        fa = (courses / "fa" / "units" / "intro.yaml").read_text(encoding="utf-8")
        assert ZWNJ not in fa.split("کتاب\\u200Cها خوب\\u200Cاند @0.5")[0][-200:]
        assert "\\u200Cاند @0.5" in fa
        loc = locate([courses / "fa" / "units" / "intro.yaml"], "s.28", "fa-Arab/standard")
        assert loc is not None and loc.current.endswith(f"خوب{ZWNJ}اند @0.5")
        for course in ("yue", "fa"):
            diags, compiled = compile_course(courses / course, cli)
            assert compiled is not None, [d.format() for d in diags.errors]
    body = pr_body(outcome, courses)
    assert "<bdi>我係一個學生</bdi>" in body
    assert "<bdi>我覺得冇問題</bdi>" in body
    assert str(reports[0].id) in body


# ---------------------------------------------------------------------------------- author


def test_author_prompt_lists_what_was_taught_up_to_the_node() -> None:
    values = prompt_values(load_course(REPO / "courses" / "uz"), "uz.my", 3)
    assert "sense:kitob: kitob, kitobim / китоб, китобим (book)" in values["kcs"]
    assert "sense:salom" in values["kcs"] and "sense:ism" in values["kcs"]
    assert values["orthographies"] == "uz-Latn/standard, uz-Cyrl/standard"
    assert values["introduces"].startswith("form:poss-1sg-im")
    prompt = load_prompt("author")
    render(prompt.source, values)  # every placeholder filled


def test_draft_writes_reviewable_sources_with_provenance_and_lints(tmp_path: Path) -> None:
    course = tmp_path / "uz"
    shutil.copytree(REPO / "courses" / "uz", course, ignore=shutil.ignore_patterns("audio"))
    shutil.copytree(REPO / "courses" / "images", tmp_path / "images")
    answer = {
        "sentences": [
            {
                "forms": {
                    "uz-Latn/standard": {
                        "text": "Bu kitobim.",
                        "tokens": [
                            {"surface": "Bu", "kc": "sense:bu"},
                            {"surface": "kitobim", "kc": "sense:kitob"},
                        ],
                    },
                    "uz-Cyrl/standard": {
                        "text": "Бу китобим.",
                        "tokens": [
                            {"surface": "Бу", "kc": "sense:bu"},
                            {"surface": "китобим", "kc": "sense:kitob"},
                        ],
                    },
                },
                "translations": ["This is my book.", "It's my book."],
            },
            {
                "forms": {
                    "uz-Latn/standard": {
                        "text": "Bu qalam.",
                        "tokens": [
                            {"surface": "Bu", "kc": "sense:bu"},
                            {"surface": "qalam", "kc": "sense:qalam"},
                        ],
                    }
                },
                "translations": ["This is a pen."],
            },
        ]
    }
    calls, transport = recorder({"message": {"content": json.dumps(answer, ensure_ascii=False)}})
    out, findings = draft(
        course, "uz.my", 2, Model("ollama", "qwen 2.5@test", "http://h", None, transport)
    )
    hash_ = load_prompt("author").hash
    data = yaml.safe_load(out.read_text(encoding="utf-8"))
    assert out == course / "drafts" / "uz.my.yaml"
    assert [s["id"] for s in data["sentences"]] == ["draft.uz.my.1", "draft.uz.my.2"]
    assert data["sentences"][0]["provenance"] == {
        "author": f"llm:qwen-2.5-test@{hash_}",
        "status": "draft",
    }
    assert data["sentences"][0]["forms"]["uz-Latn/standard"]["reverse"] == "Bu kitobim."
    assert data["sentences"][0]["translations"]["en"] == "This is my book.\nIt's my book."
    # The second draft uses a word the course lacks and has no Cyrillic form: the findings say so.
    assert any("qalam" in f for f in findings), findings
    assert any("uz-Cyrl" in f for f in findings), findings
    assert "uz.my" in calls[0][2]["messages"][1]["content"]
