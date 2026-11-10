# Handoff: the Cuban Spanish course (es), what is left

The course is done and on main: thirty units, A1 to B2, 1062 sentences, 741 KCs, 169 lessons, 30
stories and 10 scenarios, with the typed adaptive placement test. It builds with 0 errors and 0
warnings, and `pipeline/tests/test_courses.py` pins its shape. The brief is `courses/es/README.md`;
the decisions are ADR 0076 (the course) and ADR 0077 (placement); reviewer notes are in
`courses/REVIEW.md` § es. Delete this file once the list below is done.

## 1. Audio: the held-back clips

Every item has its clip: 2,263 in all, read by the two cloned voices (coral-m 1,126, zapata-f
1,137), made on a Kaggle T4 in about seven hours with the Whisper round trip. 1,760 passed it,
400 are marked for review (they ship) and 103 failed and are held back, so those items have no
listening cards yet. Most are Cuban speech Whisper does not know (*¿Qué volá?* heard as *¿Qué
volamos?*, *Hialeah* as *Jalea*) rather than bad clips. A listener decides them in the audio
check (`#/es/es-Latn.standard/audio`, debug mode), then `uv run nabu audio verdicts ../courses/es
<file> --reviewer human:<id>`; a rejected clip is made again as its next take by the next
`generate`. `uv run nabu audio report ../courses/es` lists them with what Whisper heard.

To make clips again (a changed sentence, a new voice), on a machine with a GPU or one that stays on:

```sh
pnpm i
apt-get install -y libicu-dev pkg-config espeak-ng ffmpeg
cd pipeline && uv sync --all-groups
uv run nabu audio generate ../courses/es --check   # resumes; the base model downloads on first use
cd .. && pnpm bundles
```

The pinned PyTorch has CUDA builds only for CUDA 13.2; on an older driver (Kaggle's) install the
newest pair built for CUDA 12.6 in the venv for that run. On a T4 a clip takes about 11 s (the T4
has no native bfloat16); `--check` runs Whisper on the GPU when it can (0.3 s a clip, against 13 s
on Kaggle's four CPUs). Commit `courses/es/audio/index.yaml` with every clip it lists (never one
without the other) and the rebuilt `apps/web/public/bundles`: CI fails if the bundles are stale.

## 2. A native speaker's review

Every sentence, story and scenario is an LLM draft. `courses/REVIEW.md` § es lists what to check
first, unit by unit: Cuban usage and slang, Miami anglicisms (u29), facts in KC notes (exile dates,
music, Martí), and the Martí verse *En julio como enero* (the downloaded edition) against *como en
enero* (the song, some editions). Reviewers can sign off in the review workspace (`#/review`,
ADR 0074).
