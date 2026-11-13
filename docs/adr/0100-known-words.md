# 0100. Known words: each skill shown on a later day

- Status: Proposed
- Date: 2026-11-12
- Amends: gameplan §8.2 (gap-fill's facet), §9 (the learner state), the word list (Phase 4 notes)

## Context

The word list called a word "learned" once any of its cards had a review, and FSRS counts a wrong
answer as one (the 2026-11 review's L4). After 30 simulated days it listed 251 es words, of which
111 had ever been recognized and produced; fa listed 237 against 46. Nothing in the app had a
stricter idea of knowing a word.

The owner decided (2026-11-12):
- **D2.** Getting a word right in the session it was first met doesn't count: each skill must be
  shown in a later session, after at least a night.
- **D3.** A known word that is missed again goes back to learning until that skill is shown again.
- **D4.** Production is only supplying the form: typing it, or saying it from its meaning once
  scored speech exists. Gap-fill, which picks the form among options, becomes recognition (L10).
- A word is known once it has been recognized and produced, whatever the modality, and, in a course
  whose voice may be relied on, recognized by sound.

## Decision

**The skills.** A word (a KC of kind sense or form) is known by its `recognize`, `produce` and
`listen` cards. `skillsAsked(course)` says which a course asks of each word:
- **recognize:** always, where the course practises recognition.
- **produce:** where a sentence uses the word (a word is produced by typing a sentence).
- **listen:** where the course plans listening and the word can be heard in its own clip or in a
  sentence's. A course plans listening when its facets include it (ADR 0071) and its voice is good
  (ADR 0091). iffy and bad voices, and Classical Chinese, ask no listening.

It is derived from the course's facets, voice rating and clips, with no per-course list.

**The fold** (`replay`) records three maps, all projections of the log:
- `met`: the local date each KC was first answered.
- `shown`: for each skill card, the local date it was last shown. That means a first try, right,
  not self-rated, on a later local date than the word was met and than the skill was last missed.
- `missed`: the local date each skill card was last missed. A miss takes the skill away (D3), and
  it can be shown again only on a later day.

**A miss counts against a word only where the grading pins it there:**
- a card about one word;
- the word a card asks about (a blank, a pronunciation card's word: `askedKcs`);
- a word typed or said wrong among words that were right (word-level credit).

A sentence missed as a whole says nothing about which word failed, so it leaves its words alone,
though FSRS still rates them Again. A revealed answer ("Skip") is a miss for a one-word card. Retries
and self-ratings show nothing and miss nothing.

**Known** means every skill the course asks of the word has been shown. `learnedWords` gives each
word `known` and its `skills`, each shown or not.

**Gap-fill is recognition.** Its facet is `recognize`. Production is typing a sentence
(`translate-type.l1-l2`) or a blank (`complete-translation`); speaking from the meaning will join it
once scored speech exists.

**A word is presented by a card credited to it.** In a lesson, a new word counts as presented only
by a card that credits it. Being the context of a pronunciation card's word doesn't count. Such a
word got no card from that pronunciation card, so it stayed unseen, and later sentences with it were
never admissible. In fa, لطفاً was "presented" this way, and آب, found only in sentences with لطفاً,
then went unpresented.

**The simulator** logs credits as the player does: the words a card asks about are right or wrong,
the rest given.

**The word list** shows:
- each word as Known or Learning, and for a learning word the skills it has yet to show (Reading,
  Writing, Listening), in words, never by colour alone;
- a filter (All, Known, Learning) with counts;
- how many of each unit's words are known.

Search also matches readings (Jyutping, pinyin, SBL, sitelen Lasina), with or without tone digits,
spaces and marks. The link to the list moves up to Practice on the course page, with the number of
known words (S14).

## Consequences

- **The golden state** (`fa-lesson-1.state.json`) carries `met`, `shown` and `missed`: one lesson on
  one day shows nothing.
- **Known words come slowly.** After 30 simulated days, the runs know 1–83 words. Weaker learners in
  good-voice courses know the fewest: every word must also be typed and heard, and the simulated
  learner takes almost only new lessons. The planner now aims at the skills words lack
  ([ADR 0101](0101-skill-targets.md)); adaptive pacing (L2) and review sized to the backlog (L3) are
  the next steps.
- **No server change.** Known status is replayed from the device's log like the rest of the state.
- **"Practise these" from the word list (S14) is not part of this.** It waits for L3's review
  sessions.
