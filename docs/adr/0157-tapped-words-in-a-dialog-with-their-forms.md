# 0157. A tapped word opens in a dialog, with its forms

- Status: Proposed
- Date: 2026-11-24
- Supersedes: [0043](0043-stories.md)'s "the meaning shows in a live panel under the transcript, not a floating
  popover" (and its 2026-11-12 amendment's shared panel in lessons)
- The owner asked for it (2026-11-24), on a card of apc: "when i click on a word, it should open the glossary as a
  modal, which should also show all the different forms (basically, everything that we were considering a
  'cell')".

## Context

Tap-for-gloss showed what a word means in a panel under the text: in a story a box that always stood there with a
hint, in a lesson a quiet live region that opened under the card. ADR 0043 chose a panel over a popover so it would
read the same in left-to-right, right-to-left and vertical text. It showed the word's entries (ADR 0061: each lexeme
a word writes), the dictionary form and principal parts (rules stage 4), and other readings of the spelling
(ADR 0140), but nothing of the word's other forms: a learner who taps بْفيق learns it means "wake up" and not that it
is the "I" of the present, nor what "you" or "she" or "we woke up" would be.

The lexicon now says what those forms are. Where a language has rules (apc), the compiler ships each inflecting
lexeme's paradigm, a form per cell of its category (`cells`, `paradigm`; read by `formsOfLexeme`), and the language
names its forms (`labels`, `labelOf`: "b-: I (present)"). Where it has none yet (es, sk, hbo, chg, uz, fa, grc,
yue…), the course's tokens still say which form each word stands in: the feature values chosen on the lexeme, and
those its endings realise.

## Decision

**A dialog.** Tapping a word opens a modal dialog (react-aria `Modal` and `Dialog`, as the quit dialog), in lessons
and in stories alike. Its title is the word as tapped, with its reading even where readings fade (ADR 0131); then
each entry, as before; then each entry's forms; then the spelling's other readings. It closes with its button,
Escape or a press outside, and gives the focus back to the word. It is chrome: never vertical, in the interface's
language and direction, each text in it in its own (`<T>`), so it reads the same in every cell of the visual matrix,
which is what ADR 0043's panel was for. A story keeps a line under its transcript saying words can be tapped. Looking
a word up before answering is still a hint (D16); nothing else about it changes.

**The forms**, laid out in core (`@nabu/core/lesson` `lexemeForms`, `formCellAt`), never in UI code:
- Where the lexeme has a paradigm in the orthography, every cell of its category in the lexicon's order of cells,
  each its paradigm's form (the marked text where the orthography has a marked layer, as principal parts are shown),
  then any form the course writes outside those cells (apc ra7's participles), in the order of the language's labels
  as below. A row says whether a sentence or story line writes it (`attested`); the dialog shows them alike. Where the
  course writes the cell, the form keeps the pinned readings of the word it writes that is one spelling of it (hbo
  בֵּן), and the course's other words of the form follow it (es buen beside bueno; 2026-11-25, when every language's
  rules gave it paradigms).
- Otherwise the forms the course writes, in its sentences and story lines, in the order the language's labels name
  them (a form no label names first), then as the course first writes them.
- A form is the lexeme with one set of feature values (ADR 0145): those its token chooses on it and, on a token's
  base, those its endings realise (uz ich·a·man: Tense=Pres, Number=Sing, Person=1; yue 佢·哋: Number=Plur), the
  whole token its text, readings and all. A clitic, an article or a suffixed pronoun written with it is another
  lexeme and left out (بَدّ of بَدّي). A word that starts a sentence is listed in lower case where the course writes
  it so, or where its lemma is (¡Haz! is a form of hacer).
- One form, one spelling, unless the course writes it otherwise (amended 2026-11-25, on the owner's report of
  chg ʿāliminizlar shown twice). Ways the profile says are one spelling are merged, the most written kept: alike
  once folded and stripped of the profile's marks (apc's vowel marks, Attic accents taken from a neighbour); the
  same pinned reading where the sound is a token's reading (chg-Arab, hbo-Hebr: the scribes' letters,
  عالمینکزلار and عالمینکیزلار); apart only by free correspondences where it is the spelling's. A stem cut
  before a clitic or suffixed pronoun (בְּנִ of בְּנִי) stands for its form only where no token writes the form
  as a word of its own, and then alone. A lexeme written as several words (buenas tardes, إن شاء الله) has no
  table. What is left is another word of the form, shown beside it: es buen and bueno, sk v and vo, grc ἐκ and
  ἐξ, chg dep and tep.
- Each is named as the language names it (`labelOf`, with the lexeme's own values), and the form the tapped token
  stands in is marked ("this word", `aria-current`). A lexeme with one form, an ending (bound), a phrase or a part the
  script leaves unwritten has no table. Where a word writes several lexemes with forms (es échale), each table is
  headed by its lexeme.

Nothing is realised or spelled on the device (rules stage 4): the forms are the compiler's paradigms or the
course's own tokens.

## Consequences

- Every apc verb, auxiliary and adjective with a paradigm lists 27, 9 or 3 cells; the other courses list what they
  write (es hacer 21 forms, chg bar- 22, sk byť 16, uz bormoq 12; yue only its 哋 plurals).
- A cell with no label shows its form alone (apc's imperative to a man, every uz and chg form: their languages
  name no forms yet). Labels are drafted (REVIEW) and some are long (apc's "feminine: a feminine noun (…)"):
  they read as the forms' names here too.
- The dialog does not log what it shows (ADR 0146's `seen`): a form looked up is not a form met in a passage.
- The visual matrix's story reading screen no longer has a word open, and a new screen, glossed, shows the dialog
  in every cell; lesson cards lose the quiet panel's gap, so their baselines moved.
