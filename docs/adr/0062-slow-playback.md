# 0062. Slow speech: the player slows the clip down

- Status: Proposed
- Date: 2026-11-05
- Amends: [0040](0040-audio-pipeline.md)

## Context

**ADR 0040 says a slow variant is made by time-stretching, keeping pitch.** But synthesis asked
each provider for its own slow speech instead (rate 0.67). That was fine for eSpeak NG,
whose rate setting slows every clip by the same amount (1.5× its length). It is not fine for
the neural voices:
- **A slow clip is another take.** It has its own mistakes, so a listener's verdict on the
  normal clip says nothing about it.
- **The rate is a hint, not a rule.** apc (OmniVoice) has 161 of 617 slow clips less than 1.2×
  as long as their normal clip, some no slower at all; uz (Navoiy) has 62 of 628.
- **It doubles the work and the files:** synthesis time, the audio check, bundles, offline
  downloads, and the files Pages publishes.

## Decision

**Each item gets one synthesized clip, at normal speed.** `nabu audio generate` no longer makes
slow clips.

**"Slow" plays that same clip at 0.75× with its pitch kept** (`SLOW_RATE`, @nabu/ui/player).
- **How:** the audio element's `playbackRate`, with `preservesPitch`: every browser
  time-stretches speech this way.
- **Karaoke:** it reads the element's clock in media time, so it follows a slowed clip too.
- **Recordings:** a clip's own slow recording plays as it is. `nabu audio ingest` still makes
  one by time-stretching.
- **The button:** every clip has a slow button.

## Consequences

- **Slow is always the take a listener judged,** and always slower by the same amount.
- **Half the clips:** the four courses lost about 2,500 slow clips with no new synthesis, and
  future voices generate in half the time.
- **Stretching quality depends on the browser.** At 0.75× it is the speed people already slow
  speech to in video players. A course that wants a slower reading can record one.
- **The schema keeps `slow`,** for recorded slow takes.
