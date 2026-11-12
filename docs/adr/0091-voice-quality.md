# 0091. A course's voice is good, iffy or bad: how far learners may rely on its clips

- Status: Proposed
- Date: 2026-11-10

## Context

Not every course has a voice made for its language.
- apc's (Lahgtna, ADR 0058), es's and uz's are models trained on the language itself.
- Others are stopgaps hacked together from what exists:
  - Biblical Hebrew's Tiberian phonemes said by an Arabic voice (ADR 0082, 0089);
  - Toki Pona said through another language's voice (ADR 0086);
  - Attic Greek through a Modern Greek voice given IPA (ADR 0087).

  These are often right and sometimes wrong.

The app used every voice the same way. A listening exercise asks the learner to understand or
transcribe what they hear, with nothing else to go on, so a wrong clip there teaches the wrong thing
or marks a right answer wrong. hbo had already been kept from that by hand: its `facets` leave out
listen (ADR 0082). Nothing said why, or let another course say the same.

Ben's distinction:
- **good:** use the voice everywhere;
- **iffy:** play the clips only where the learner is not relying on them, and give no listening
  tests;
- **bad:** present no clip at all.

## Decision

**A course's audio says its quality:** `audio.quality` in course.yaml, one of good (the default),
iffy, bad.

- **good:** clips play everywhere, as before:
  - listening exercises (listen-tap, listen-type, listen-select, minimal pairs, tones);
  - listen-and-repeat;
  - the clip said once a card is answered;
  - stories and the word list.
- **iffy:** the clips only reinforce what the learner reads.
  - They play once a card is answered (ADR 0064), in stories, in the word list, and on a tapped word
    in match-the-pairs, always with the text in front of the learner.
  - No template whose prompt is a clip is ever planned. That is the LISTENING set (every template
    with audio out), listen-and-repeat included.
  - The manifest carries `audioQuality: "iffy"`. The core rules those templates out with the
    course's facets (`voiceExclusions`, joined in `courseExclusions`) everywhere a plan is made:
    lessons, practice, mistakes, placement, the card gallery.
- **bad:** no clip reaches the learner.
  - The compiler leaves the clips out of the bundle, so nothing can play, offline downloads carry
    none, and no listening template is built (they exist only where a clip does).
  - The clips stay in courses/<id>/audio, where the audio check (ADR 0060) still plays them, so a
    reviewer can judge a voice before it is promoted.

**The courses now:**

| Course | Quality | Why |
|---|---|---|
| apc | good (written out) | Lahgtna is trained on Lebanese Arabic |
| hbo | iffy | an Arabic voice given Tiberian phonemes (ADR 0089) |
| tok | iffy | eSpeak NG's Esperanto phonemes (a Tok Pisin voice is being tried) |
| grc | bad | a Modern Greek voice given IPA is too far from Attic to present |

fa, yue, uz and es keep the default, good.

## Consequences

- **Changing a course's quality is one line, and no clip is regenerated.** Raising grc to iffy or a
  stopgap to good is a decision about the voice, not new audio.
- **Older settings still hold.** hbo's `facets` still leave out listen, a choice about the course
  (ADR 0082) that stays even if a good voice arrives.
- **Held-back clips are another layer.** A good voice can still hold back single clips that fail
  their round trip or a listener (ADR 0060); quality is the course's verdict on the voice as a whole.
- **Bundles:** grc's bundle loses its clips, hbo's and tok's manifests gain the flag, and every
  other bundle is byte for byte as it was.
