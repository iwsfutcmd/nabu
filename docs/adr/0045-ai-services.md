# 0045. AI services: gateway, judge, explanations, roleplay, reviews

- Status: Proposed
- Date: 2026-11-03
- Updated by [ADR 0052](0052-learner-claims.md): a learner's report also revises their own answer.

## Context

Phase 8 (gameplan §13, §16) asks for:
- an LLM gateway;
- a judge fallback for answers the accept sets miss;
- a review queue, and pull requests that promote approved answers into accept sets;
- Explain My Answer, as structured segments;
- roleplay under a vocabulary constraint;
- an authoring assistant;
- an evaluation harness.

Acceptance:
- the judge's false-accept rate is at most 2% on the adversarial set for each fixture language,
  or the judge stays off for that language;
- an Arabic-UI learner sees `yue` explanations with correct bidi;
- every AI output carries provenance.

No model was available while this was built, and none was downloaded. Everything that needs no
model is complete and tested. A scripted stand-in tests the plumbing. No result in the repository
claims a model's quality.

## Decision

**One gateway on the server** (`apps/api/src/ai/`).

- **Providers.** Adapters cover Ollama, any OpenAI-compatible server (llama.cpp's llama-server,
  vLLM, OpenAI), and Anthropic, which uses a forced tool call for structured output.
  - They are configured only from the environment: `NABU_LLM`, `NABU_LLM_MODEL`, `NABU_LLM_URL`,
    and a key.
  - There is no default model. Without `NABU_LLM`, every AI feature reports off and the app hides
    it (§13.1).
- **Prompts.** Templates live in `prompts/*.md` and are referenced by the first 12 hex digits of
  their SHA-256.
  - A missing placeholder value is an error.
  - Learner text sits between markers and is stripped of marker sequences and control characters.
- **Validation.** Outputs are validated against `schemas/ai.schema.json`; invalid output gets one
  retry, then an error. Nothing unvalidated reaches a learner.
- **Provenance.** Every output carries provider, model, prompt id, prompt hash and time.
- **Controls:**
  - a response cache keyed by model, prompt hash and the normalized request;
  - daily budgets per learner and per instance;
  - a kill switch by feature, course or orthography (`NABU_AI_KILL`).
- **Privacy.** Budgets, votes and ratings store an HMAC of the user id, never the id. Logs hold
  the feature, course, model, timing and outcome, and no user ids or learner text (§13.1, §14.4).
- **Accounts.** The AI endpoints need an account: budgets are per learner. Reporting does not.

**The judge** (§8.3, §13.2). Its rules are pure, in `@nabu/core/ai`.
- It sees only free production (`translate-type.l1-l2`) graded `WRONG`. It never sees choice,
  tiles, dictation, typos or real-word slips.
- It reads the prompt and the accept set from the server's own bundles (`NABU_BUNDLES`), never
  from the request.
- An accept counts only at confidence ≥ 0.9.
- **Revision.** An accept becomes an `outcome_revised` event.
  - The server issues it into the learner's log; replay applies it in place of the original
    outcome (`withRevisions`), as do the game and league projections.
  - Uploads of revisions the server did not issue are refused.
  - The app records a revision it receives and replays.
  - Offline, the check waits in a queue that the next sync drains.
- **Grading now, revising later.** The player grades at once and shows "Checking your answer
  again…" under the feedback. It does not hold the learner in a "checking" state (see errata 47).
- **The gate.** The judge runs for a course orthography only behind an open gate in
  `evals/gates.json` for that provider, model and prompt hash.
  - A gate opens when false accepts on at least 20 adversarial items are ≤ 2%, and a missing
    verdict counts as an accept.
  - Changing `prompts/judge.md` closes every gate.
  - `gates.json` is empty, so the judge is off everywhere: the gameplan's fallback, accept sets
    plus reports.

**The evaluation harness** (`apps/api/src/evals.ts`, `pnpm --filter @nabu/api evals`).
- **Golden sets.** `evals/judge/<course>.jsonl` holds 193 items across the six fixture
  orthographies.
  - Adversarial categories: negation, person, number, tense, particle, classifier, case, register
    (MSA for Lebanese), word choice, omission and prompt injection.
  - Paraphrases measure false rejects.
  - The items are LLM-drafted, `status: draft`.
- **Check mode** runs in CI: every item must be a real judge case, which means the grader says
  `WRONG`.
- **Run mode** needs a model. It uses the server's own prompt and gateway and writes gates.

**Reports and promotion.**
- **Reporting.** "My answer should be accepted" is an `answer_reported` event in the learner's own
  log, so it works offline and without an account, and reaches reviewers when it syncs.
- **The queue.** The server keeps one row per normalized answer to an item, with the learners
  (hashed) behind it.
  - A row is approved by a reviewer (`/admin/v1`, `NABU_ADMIN_TOKEN`).
  - It is also approved on its own once the judge accepted it for three learners.
- **Promotion.** `nabu reports promote` does the rest:
  - it adds approved answers to the sentence's `reverse` set at weight 0.5, editing only that
    value in the YAML;
  - it checks with core-cli that the answer now grades correct and that the course compiles;
  - it writes the pull request's description, and optionally commits on a branch and marks the
    reports promoted.

**Explain My Answer** (§13.3). The model returns segments: support prose, target quotes, and
references to the learner's answer by word index.
- Core turns them into TaggedText in each segment's own language. Han and kana are split per
  cluster, so references can point at one character.
- The paragraph takes the support language's direction, not the UI's.
- Each segment is isolated by `<T>`. An English explanation quoting Cantonese reads left to
  right inside Arabic chrome. The visual matrix asserts this in every cell; ar-XB × yue is the
  acceptance case.
- The model is named under every explanation, and learners can rate it.

**Roleplay** (§13.4).
- **Scenario cards.** They are course content (`scenarios:` in a unit, lints `scenario.node` and
  `scenario.missing-text`). They hold no target text, and open after their `after` node.
- **Each turn.** The server computes the learner's known forms (recognize R ≥ 0.7) from their
  log.
  - It asks for a turn with at most one new word, and checks it before showing it: unknown words,
    and characters outside the orthography's script (Script_Extensions).
  - A turn that fails is generated again, up to three times. No unchecked turn is ever shown.

**The authoring assistant** (`nabu author draft`).
- It drafts sentences for a node in every orthography, from the components taught so far.
- Each draft is tagged `llm:<model>@<prompt-hash>` with status `draft`, and is compiled with the
  course to list the lints it trips.
- Drafts are written to `courses/<id>/drafts/<node>.yaml` for a human to review.

## Consequences

- An instance with no model behaves as before Phase 8, plus reporting. That is the expected
  local-first setup.
- Turning the judge on for a language takes one evaluation run with the chosen model. The run
  writes the gate; reviewers check the golden sets first.
- The harness found that the deterministic grader accepts some meaning changes as typos (errata
  46). That is a grading issue for the typo model, outside the judge.
- Not done in Phase 8:
  - grading learner turns in roleplay (§13.4, "graded gently");
  - runtime TTS of model turns;
  - learner-facing explanation ratings beyond thumbs up and down.
