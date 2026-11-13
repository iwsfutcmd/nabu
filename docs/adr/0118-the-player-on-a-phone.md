# 0118. The player on a phone: vertical text, and Check while a keyboard composes

- Status: Proposed
- Date: 2026-11-12
- Amends: [0034](0034-lesson-player.md) (a submit while composing), [0043](0043-stories.md) (vertical
  reading), [0071](0071-classical-chinese.md) (readings in vertical text); gameplan §11.4 (ruby in
  vertical text) and §11.5 (a submit while composing)

## Context

The 2026-11 review walked through the app at phone width (390×844) and found two problems in the
player.

**Vertical text (W6).** Vertical text is a display choice for the Han courses (yue, lzh). On a phone:
- Turning it on hid the readings without saying so. §11.4, ADR 0043 and ADR 0071 hid them on
  purpose, because rotated Latin ruby reads badly.
- Everything inside a vertical region turned with it:
  - a story's "Show translation" and "This sentence is wrong" ran sideways down the columns;
  - a prompt's play buttons stacked into a column, with "Synthetic voice" rotated beside them.
- Two regions left a large empty block that pushed Continue or Check to the screen edge, or past
  it:
  - the vertical story transcript was a fixed 22rem tall, however short its lines;
  - a vertical word bank was one column as tall as all its tiles.
- A story's "Synthetic voice" stood on a line of its own above the transcript.

**Check while composing (P16).** Check was disabled while an input method composed (§11.5).
Android keyboards such as Gboard compose the word being typed until it is committed: by a space,
punctuation, a suggestion, or focus leaving the field. Chromium's touch emulation reproduces the
problem with the answer still composing:
- A tap on the disabled Check commits the composition and blurs the field, but checks nothing. A
  second tap checks.
- A press that moves no focus, such as a screen reader's, does nothing at all.

## Decision

**In vertical text, only the language being learned turns.**
- **Prompts.** A prompt's text turns into columns. Its play buttons and "Synthetic voice" stay
  horizontal above it, and both are centred.
- **Stories.** Each line's text turns into columns. Everything else stays horizontal: the speaker's
  name, the play buttons, the translation and its button, and the line's own action. Lines follow
  one another down the transcript, which keeps its horizontal size and scrolling. ADR 0043 had the
  whole transcript turn into columns read from the right, with Latin turned sideways.
- **Word banks.** A word bank stays vertical as a whole, since its tiles are target text. Tile
  numbers stay upright.
- **Column length.** A column is at most 16rem long, and longer text goes on in the next column. A
  long bank goes on in more columns beside the answer's. The bank's region is as wide as its
  columns, and at least 18rem.
- **Readings.** The reading layer stays as the learner chose it. In vertical-rl text, ruby sits to
  the right of the column, with Latin turned as vertical CJK print turns it. The Display menu's
  vertical switch no longer changes the readings.
- **Synthetic voice.** A story says "Synthetic voice" once, beside a synthesized clip's play
  buttons, as a lesson says it beside its prompt's. While the story is read, that is the newest such
  line, so the note stays in sight. When the story is read again from the top, it is the first.

**Check takes a press while a keyboard composes.**
- **When Check is enabled.** Check is enabled whenever the draft makes an answer, composing or not.
  Enter still never checks while composing, since an input method's Enter commits a candidate.
- **The state machine.** A `submit` during composition is held: the answering state's `queued` is
  set.
  - At `compositionend`, a held submit goes ahead with the settled text.
  - A `compositionend` with no held submit submits nothing. That covers an input method's Enter and
    a tapped candidate.
  - A new `compositionstart` drops a held submit.
  - Nothing is ever submitted mid-composition (§6.7).
- **Focus.** A press on Check during composition moves focus to Check (`focusInReach`), which ends
  the composition as a tap anywhere else does. Without it, a screen reader's press, which moves no
  focus, would wait until the learner committed the word.
- **Enter key hint.** The answer field's Enter key hint is `done`.

## Consequences

- **One tap.** One tap on Check checks what was typed, even while the keyboard still composes the
  last word. This is verified in Chromium, with touch emulation and CDP composition, but not yet on
  an Android device.
- **Tapping Check before converting.** A CJK learner who taps Check before converting submits what
  the browser commits. On desktop Chromium, that is the text shown, so a Pinyin or Jyutping input
  method commits the romanization. Check is an explicit action, and Enter still converts.
- **Vertical stories read down, not across.** Vertical stories are now a column of text per line, so
  the lines no longer flow from right to left as one text. A book-like flow would need the line's
  buttons, translation and actions outside the columns, in a panel. That is a later choice.
- **Baselines.** These visual baselines change:
  - every vertical cell (prompts, banks, stories);
  - every story whose clips are synthesized, because the note moved;
  - the player matrix gains a vertical screen with a target prompt (new-words).
