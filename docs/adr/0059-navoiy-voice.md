# 0059. An Uzbek voice: Navoiy on CosyVoice2, in its own environment

- Status: Proposed
- Date: 2026-11-05
- Amends: [0040](0040-audio-pipeline.md), [0058](0058-lahgtna-voice.md)

## Context

The uz course spoke with eSpeak NG. It is rule-based and robotic: Whisper's round trip
(ADR 0040) failed 499 of its 628 normal-speed clips. Clips that fail stay out of bundles, so most
uz sentences and words reached learners with no audio.

**Navoiy** (`aisha-org/navoiy-tts`) is an Uzbek voice from Aisha AI.
- **What it is:** CosyVoice2-0.5B's language model, fine-tuned on about 600 hours of Uzbek, with
  ten style presets ("calm", "warm", "happy"…) and an Uzbek text normalizer (`uztts`: numbers,
  dates and units to words, apostrophes unified).
- **How it runs:** only through CosyVoice's own runtime. That runtime is a source checkout, not a
  package, together with the CosyVoice2-0.5B base model, which the fine-tuned weights replace in
  part.
- **Its stack is older than the pipeline's:** CosyVoice pins torch 2.3, transformers 4.51 and
  numpy 1.26 on Python 3.10–3.11. The pipeline runs torch 2.15, transformers 5 and numpy 2 on
  Python 3.13.
- **License:** Apache-2.0 for the checkpoint, its base model and CosyVoice's code.
- **No voice design:** every clip clones a prompt recording. Navoiy's own demos clone the prompt
  recording of CosyVoice's examples.

## Decision

**A provider, `navoiy`** (`nabu.audio.providers`), whose model runs in an environment of its own.
- **The runtime** is `pipeline/runtimes/cosyvoice`: a uv project with its own lock, Python 3.11,
  CPU torch, and CosyVoice's requirements without its GPU, training and serving packages.
- **The pipeline starts `worker.py` there as a subprocess** and talks to it in JSON lines: one
  line loads the model, then each line asks for one clip and gets back its PCM.
- **Neither stack constrains the other**, and CI installs neither.
- **The worker fetches and checks what it runs.** These are the commits Navoiy's
  `demo/manifest.json` records:
  - CosyVoice's source and its Matcha-TTS submodule at a pinned commit (git, cached);
  - the base model at a pinned commit (Hugging Face);
  - the checkpoint at the voice's `model` commit, its sha256 checked.

**Where it departs from Navoiy's `inference.py`:**
- **float32 everywhere,** where upstream uses float16 on GPUs. A clip then does not depend on the
  machine.
- **No English or Chinese text frontend.** CosyVoice would run Uzbek through its English
  normalizer; Navoiy's own normalizer does that work.
- **A seed per clip** (`seed_of`), not one per run, so a clip does not depend on the clips before
  it.

**What it reads.**
- **The text:** the uz-Latn text as written. Navoiy's normalizer turns ʻ (U+02BB) into the
  apostrophe it was trained on. The Cyrillic orthography shares the clips, as before.
- **The style:** the "calm" preset, an even, neutral voice. Its instruction is part of each clip's
  identity.

**One course voice is one speaker,** as for OmniVoice (ADR 0058).
- **Casting:** Navoiy cannot design a voice from attributes. `nabu audio cast` has it read course
  sentences in the voice of CosyVoice's prompt recording, at a pinned commit and sha256. That is
  the recording its demos use.
- **The reference:** the result is the course's reference, `audio/voices/<id>.wav`. Every clip
  clones it.
- **The prompt recording itself is not kept in the course.** The reference's `design.prompt`
  names it: where it is, its sha256 and its license.
- **The voice is a woman's,** as the prompt's is. Uzbek marks no grammatical gender, so no
  sentence needs a speaker of a given gender (ADR 0056).

**License: the clips are Apache-2.0,** the terms of everything they come from: the checkpoint,
its base model, and the prompt recording the reference was cloned from. Unlike apc's
(ADR 0058), they can be used commercially.

**Word timings by forced alignment.**
- **The gap:** OmniVoice and Navoiy report no word onsets. eSpeak NG did, so without this uz
  would lose karaoke and tap-a-word.
- **The command:** `nabu audio align <course>` aligns every clip that has no timings, using the
  phone aligner `ingest --align` uses (speech group) and eSpeak NG phones for each word. Its
  timings are marked `timingSource: alignment`.

## Consequences

- **uz sounds like a person.** TODO(numbers): pass, review and fail counts after generation.
- **Whisper is a weak judge of Uzbek.** It writes Uzbek in Turkish or Azerbaijani spelling, and
  makes up text for one-word clips. Navoiy's own demos score CER 0.21–0.35. Many good clips land
  in review, and a native speaker should still listen.
- **Speed.**
  - On a 4-core CPU with nothing else running, a short sentence takes 5–9 s.
  - The course's roughly 1,260 clips (two speeds) take about 2.5 hours.
  - The model holds about 6 GB of memory: run it alone on a small machine.
- **Two Python environments** for the pipeline's audio. The second is opt-in and only for
  making uz clips. Committed clips need neither.
- **GPU:** the runtime's lock pins CPU torch, so a GPU machine needs torch's CUDA wheels there.
- **apc can be aligned too** (`nabu audio align ../courses/apc`), with eSpeak NG's Arabic phones.
