# Evaluations

Golden sets and gates for the AI features (gameplan §13.6). Phase 8 covers the judge.

## The judge

`judge/<course>.jsonl` holds one `EvalItem` per line (`schemas/ai.schema.json`): an answer to a
production sentence (`translate-type.l1-l2`) that the course's accept set rejects, and what a good
judge should say about it.

- **Adversarial items** (`expect: reject`): near misses that change the meaning. They include
  negation, person, number, tense, sentence-final particles, classifiers, case endings, register
  (MSA for Lebanese), word choice, omissions and prompt injection. False accepts on these are the
  main metric.
- **Paraphrases** (`expect: accept`): correct answers the accept set does not list. False rejects on
  these only annoy, but they are measured too.

Every orthography needs at least 20 adversarial items, a paraphrase and an injection. The items
were drafted by an LLM (`author: llm:claude@…`, `status: draft`) and await review by speakers of
each language. Write invisible characters (ZWNJ) as `\u200c` escapes.

### Check mode (no model, runs in CI)

```sh
pnpm --filter @nabu/api evals
```

This checks that every item is valid, names a real sentence, and is a real judge case: the
accept-set grader must say `WRONG`. An answer the grader already accepts, or marks as a typo or
a wrong word, never reaches the judge, so it measures nothing.

### Run mode (needs a model)

```sh
NABU_LLM=ollama NABU_LLM_MODEL=<model> pnpm --filter @nabu/api evals -- --run
```

Run mode judges every item through the server's own prompt and gateway. It prints false accepts
and false rejects per orthography, lists every miss, and writes `gates.json`. The judge goes on
for a course orthography only when both of these hold:

- its false-accept rate is at most 2%;
- an item without a valid verdict counts as an accept.

A gate holds only for the model it was measured with and for the judge prompt's hash
(`prompts/judge.md`). Changing the prompt closes every gate until the next run. Hosted models work
the same way: set `NABU_LLM=openai` or `anthropic`, and put the key in the environment, never in a
file.

`gates.json` is empty: no model has been evaluated yet, so the judge is **off for every
language**. That is the designed fallback (§13.1): accept sets plus learner reports.

## What check mode found in the grader

Drafting the sets turned up meaning changes that the deterministic cascade accepted before any
judge saw them (gameplan errata 46). Person and possessive suffixes one letter apart looked like
typos to the keyboard model. Since [ADR 0066](../docs/adr/0066-meaningful-endings.md), each
profile lists the endings and pronouns that carry meaning (`typo.contrasts`), so these are wrong
words, with a note on what the ending changes:

| Orthography | Answer | Expected | Grader said | Grader says |
|---|---|---|---|---|
| `uz-Latn` | *Talabasan* ("you're a student") | *Talabaman* | typo | wrong word (person) |
| `uz-Latn` | *Bu kitobing* ("your book") | *Bu kitobim* | typo | wrong word (possessive) |
| `uz-Latn` | *Azizsan* | *Azizman* | typo | wrong word (person) |
| `uz-Cyrl` | *Сен талабасан* | *Мен талабаман* | typo (С is next to М on the keyboard) | wrong word (pronoun, person) |
| `apc-Arab` | ⁨وأنا؟⁩ ("and me?") | ⁨وإنت؟⁩ ("and you?") | typo | wrong word (pronoun) |

A wrong word never reaches the judge either: it is wrong without a second check.
