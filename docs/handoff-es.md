# Handoff: the Cuban Spanish course (es), what is left

The course is done and on main: thirty units, A1 to B2, 1062 sentences, 741 KCs, 169 lessons, 30
stories and 10 scenarios, with the typed adaptive placement test. It builds with 0 errors and 0
warnings, and `pipeline/tests/test_courses.py` pins its shape. The brief is `courses/es/README.md`;
the decisions are ADR 0076 (the course) and ADR 0077 (placement); reviewer notes are in
`courses/REVIEW.md` § es. Delete this file once the list below is done.

## 1. Audio (the big one)

About 220 of roughly 2,200 clips exist (mostly unit 1 and the first word cards). Items without a
clip simply have no listening cards. OmniVoice clones the Cuban reference in every clip, so on a
CPU it takes 15–30 s a clip, many hours in all. Cloud sessions are suspended when idle, so a
generator started there only runs while someone is working in the session.

On a machine with a GPU (or any machine that stays on):

```sh
pnpm i
apt-get install -y libicu-dev pkg-config espeak-ng ffmpeg
cd pipeline && uv sync --all-groups
uv run nabu audio generate ../courses/es --check   # resumes; the base model downloads on first use
uv run nabu audio report ../courses/es
cd .. && pnpm bundles
```

Then commit `courses/es/audio/index.yaml` with every clip it lists (never one without the other)
and the rebuilt `apps/web/public/bundles`, and push: CI fails if the bundles are stale.

Held-back clips (failed the Whisper round trip) are mostly Cuban slang Whisper does not know
(*¿Qué bolá?* heard as *¿Por qué volar?*). A listener decides them in the audio check
(`#/es/es-Latn.standard/audio`, debug mode), then `uv run nabu audio verdicts ../courses/es <file> --reviewer
human:<id>`.

## 2. A native speaker's review

Every sentence, story and scenario is an LLM draft. `courses/REVIEW.md` § es lists what to check
first, unit by unit: Cuban usage and slang, Miami anglicisms (u29), facts in KC notes (exile dates,
music, Martí), and the Martí verse *En julio como enero* (the downloaded edition) against *como en
enero* (the song, some editions). Reviewers can sign off in the review workspace (`#/review`,
ADR 0074).
