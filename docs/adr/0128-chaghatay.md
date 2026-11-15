# 0128. Chaghatay: the Arabic script with Schluessel's transliteration, read and written

- Status: Proposed
- Date: 2026-11-15
- Amends: [0124](0124-script-tracks-from-the-profile.md) (a romanization scheme `forms`)

## Context

Ben asked for a Chaghatay course: the literary Turkic ("Turki") of Central Asia, from Navai and Babur in the
fifteenth century to the manuscripts and documents of Xinjiang in the twentieth. The Arabic script is the
baseline; the transliteration is Eric Schluessel's, *An Introduction to Chaghatay: A Graded Textbook for Reading
Central Asian Sources* (2018). The references (ADR 0079 library, `books/ling/tut/trk/chg`) are Schluessel (2018),
Eckmann's *Chagatay Manual* (1966) and the Uzbek Academy's dictionary of Navai's language (1983-85). No one speaks
Chaghatay today; it is read. No audio was asked for.

Schluessel's book is CC BY-NC-ND 4.0: the course takes facts from it (letters and their transliteration,
suffixes, words and their spellings, glosses as facts), never its example sentences or exercises. The passages its
later chapters read are older texts in the public domain (Babur, Abu 'l-Ghazi, Navai, an anonymous tadhkira).

## Decision

**Two orthographies, every sentence pinned in both** (as uz, apc and tok):

- **`chg-Arab/standard`** (profiles/chg-Arab.standard.yaml), the baseline and the course's target (`chg-Arab`, right
  to left; CLDR's likely subtags make `chg` chg-Arab-TM).
  - Spelled as Schluessel's typescript spells it: Persian letters (ک, ی, ه for a final -a/-ä), ŋ as نک, the copula
    -dur after a zero-width non-joiner (qattiq-dur: قاتیق, U+200C, دور), other suffixes joined, and a half-space
    after a final vowel ه (mewä-si: میوه, U+200C, سی). Manuscripts have no punctuation; the course adds the Persian
    marks (، ؟ . « ») as typeset editions do.
  - Exemplars are CLDR's Persian (`cldr:fa`), which has every letter the texts use.
  - Answers (REVIEW): a suffix after a half-space, a space or joined is one spelling, silently; گ and ک are one
    letter (the scribes write g with either); a hamza seat or a dropped hamza is accepted; harakat never decide an
    answer; Arabic kaf and yeh, ڭ and the ae letter fold in normalization. Contrast sets (ADR 0066) for the person,
    case and past endings and the pronouns.
- **`chg-Latn/schluessel`** (profiles/chg-Latn.schluessel.yaml): Schluessel's transliteration (xii-xxxii), a
  modified IJMES system, one letter a sound: b p ṗ t s̱ j č ḥ ḫ d ź r z ž s š ṣ ż ṭ ẓ ʿ ǧ f q k g ŋ l m n w h y ʾ and
  a ä e i o ö u ü, ā ī ū in Arabic and Persian words, à for alef maksura. It is a reading, not letter for letter
  (Babur's سیکیز is säkkiz): the course follows Schluessel's readings, also for the passages.
  - Capitals begin sentences and names; Latin punctuation; the ezafe after a hyphen (tārīḫ-i).
  - Answers (REVIEW): diacritics left out or misplaced are CORRECT_MARKS with a new note `translit-marks`, unless
    the answer spells another word of the course (`distinguishes`: bardi "went" for bärdi "gave",
    `translit-marks-word`); ng for ŋ is noted; an apostrophe for ʿayn is its half ring. Contrast sets for person,
    past, possessive and case endings and the pronouns, the past before the possessive (bärdi for bärdim is a
    person slip, not a possessive one).
  - Its tokens match the Arabic word for word, with the same senses and suffixes; a test checks it
    (`test_chaghatay_is_read_and_written_in_two_scripts`). The profile says so: `transliterate: {to:
    chg-Arab/standard, via: hand-pinned}`.
- Conformance vectors pin all of this in both harnesses (normalize, grade, direction).
- The three new notes are in every UI catalog (drafts outside English, stamped).

**Read and written, never heard**: `facets: [recognize, produce, read-script, write-script]`, no audio (as lzh,
ADR 0071); the script facets are the alphabet track's.

**An alphabet track** (units/abc.yaml, ADR 0088), as Schluessel's book opens with one: eight nodes in his groups of
letters that share a shape (2018, xi-xxxii), reordered so that words can be read from the first node (alif and the
be family, then the letters that do not join, then ye …), each drilling early words of the course spelled with
the letters taught by then. It is the Arabic orthography's: a learner of the transliteration has no such row.
- An abjad's words cannot be romanized from their letters (کوشت is göšt, not kwšt), so the profile's
  `romanize` names a new scheme, **`forms`**: a letter's and a word's Latin spelling is its KC's own first form in
  the named orthography (chg-Latn/schluessel), which each then needs (`script.missing-form`). A letter's form there
  gives all its values (و "w / u / o / ü / ö / ū"; ه "h / a / ä"). A Latin orthography the course teaches is not
  shipped twice.

**The course** (`courses/chg`): fourteen units, A1 to B1, each teaching the words of an authentic passage that its
story reads, in the order of Schluessel's grammar (copula and existence, cases, persons and questions, the
present-future, the past, the aorist, converbs and participles, the conditional, the reported past, the narrative
past, the habitual past, -ǧač). A Chaghatay word is a stem and its suffixes, so suffixes are morphs with their own
form KCs (`form:dat`, `form:past-1s`, …) and `iPlusOne: 2`. Verbs are cited as Schluessel cites them, the stem with a
hyphen (bar-). Story lines keep their source's spellings (فادشاه for pādišāh and پز for biz in the tadhkira, tep for
dep in Abu 'l-Ghazi), with Schluessel's reading in the transliteration; the scribe's بامو is read barmu, as Schluessel
reads it.

| Unit | Passage |
|---|---|
| 1 | Babur, Bāburnāma: a small country (Ferghana, Osh) |
| 2 | Babur: seven towns (Ferghana's towns, Andijan's gates) |
| 3 | Babur: the pears of Andijan |
| 4 | The Tadhkira of Jalāl ud-Dīn Katakī (Jarring Prov. 328): "Do you have a king?" |
| 5 | The Tadhkira: they drink wine, but speak like Muslims |
| 6 | Babur: king at twelve (the opening; a pavilion at Osh) |
| 7 | Babur: four men cannot finish a pheasant |
| 8 | The Tadhkira: "Let us go in at dawn" |
| 9 | Abu 'l-Ghazi, Shajara-i Turk (Uppsala O Vet. 60): the orphan cuts his own cord |
| 10 | Navai, Tārīḫ-i anbiyā: the Seven Sleepers |
| 11 | Babur: the pavilion at Osh (the narrative past -ptur) |
| 12 | Qasim Beg, Events in Ghulja (St Petersburg, IOM B 4018): the Kalmyks came |
| 13 | The Stories of the Prophets (Jarring Prov. 431): the giant ʿĀj |
| 14 | Navai: a coin of Decius (the end of the Seven Sleepers) |

Chaghatay marks no gender: English accept sets give he/she. "You" is sän to one person one knows well, siz
politely to one or to several, sizlär to several: sän sentences are tagged "to one person", sizlär "to several",
and accept sets take siz as well; untagged siz sentences accept all three (ADR 0075). Women speak and are named
(Ḫumā Bibi).

## Consequences

- 517 sentences, 387 KCs (33 of them letters), 69 lessons, fourteen stories, fourteen roleplay scenarios and an
  alphabet track of eight nodes. LLM drafts (`llm:`, status draft), CC-BY-SA-4.0; the passages are public domain.
- The course was written from a compact source (each word as stem and suffix keys, both scripts built from the
  same pieces), kept in the reference library (`nabu/notes/chg/generator`), not in the repository: the YAML is the
  source now, and the test keeps the two scripts in step.
- Not done: no ruby (an Arabic word cannot carry its transliteration above it: ruby is per character or syllable
  today); no vocalization file (harakat); words not checked against the Navai dictionary.
- Every spelling of a Turkic word follows one convention, where the manuscripts have many: accept sets add the
  common ones (plene and defective vowels, the dative's غه که قه گه, ایرماس for ایماس), never all.
