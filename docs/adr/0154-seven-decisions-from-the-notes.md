# 0154. Seven decisions the model notes record

- Status: Proposed
- Date: 2026-11-22
- Builds on: [ADR 0145](0145-lexical-model.md) (the lexical model), [ADR 0146](0146-what-is-learned.md),
  [ADR 0148](0148-projections-and-misses.md)

## Context

ADRs 0145–0151 were written from the model's notes ([lexeme-model.md](../lexeme-model.md),
[lexemes.md](../lexemes.md)). When the notes were brought up to the accepted ADRs (2026-11-20), seven
decisions turned up that the notes record as decided and no ADR states (the handoff's "Decisions the notes
record that no ADR states"). They bind lexicon authoring and the rules that come next, and a notes file is
not where the next reader looks for a decision. The owner let the proposal to write them into an ADR stand
(2026-11-22).

Nothing here is new. Each is stated as the notes have it, with the place.

## Decision

1. **The citation form is the language's, and a lemma is its realisation.** A lexeme's lemma is a
   combination of one in the language's citation form, realised and blocked like any other: the infinitive
   for es, uz and fa (*ser* is SER and the infinitive; خوردن is the past stem and ‑ن), the third person
   masculine singular perfect for Arabic and Hebrew, the first person singular present for Greek. It is not
   the elsewhere morpheme, which is the stem that rules use by default (SER's *s‑*: *seré*, *sido*,
   *siendo*). Where a lexeme has several listed stems and none is the default (Persian's present and past
   stems), one is named as elsewhere. (Notes: the points under Diagram 2. As built: `citation` and `bare` in
   lexicons/<lang>/language.yaml.)
2. **A plural with a sense of its own is a separate morpheme,** not a register form of its singular:
   Persian اخبار "the news" (a broadcast) beside خبرها "news items". (Notes: the Persian register points.)
3. **A bound stem with a meaning is a morpheme, never a root:** Indonesian *ajar* (*belajar*, *mengajar*,
   *pelajaran*), Bantu *‑swahili* (*Mswahili*, *Waswahili*, *Kiswahili*), as 習 is in 學習. Its derivatives
   link to it as to any base. (Notes: "Outside Semitic", "No root object at all".)
4. **A coinage on a root with no verb is a listed morpheme,** its pattern a link: with no base lexeme there
   is no combination. A lexicalised sense (كاتِب "scribe, author", مَشْرُوب "a drink") is a morpheme of its
   own, and blocks per sense. (Notes: "Roots and families".)
5. **Data for a word form is keyed by its content.** A word form is a value, a morpheme with inflectional
   features, not an object. What is derived for it (a clip, a homograph mark) is keyed by that content, as
   clips said alike already share a file. (Notes: "A morpheme's manifestations". As built: the form key,
   `lexeme:ra7|form:Aspect=Part;Gender=Masc;Number=Sing`.)
6. **Thai and Lao visual order is the projection's job.** Written order is not always spoken order inside
   a word: Thai and Lao store preposed vowels in visual order. Projection rules handle it. (Notes: "Order".)
7. **Two verdicts on what is one lexeme.** Uzbek *tayyora* and *samolyot* are two lexemes: synonyms with no
   grammar between them, a separate vocabulary gap. Cantonese 佢 and written Standard Chinese 他 are not
   forms of one lexeme for spoken Cantonese: the second is another language's word, linked by a concept or
   by nothing. (Notes: the table of edges that test the line.)

## Consequences

- Nothing built changes: the language files' `citation` and `bare` cells and the form key already follow 1
  and 5.
- 2, 3, 4 and 7 bind what goes into a lexicon as an entry of its own, in the courses there are and in the
  planned ones (Indonesian, Javanese, a Bantu language, Arabic with roots and patterns).
- 6 binds the profile of a Thai or Lao orthography when one comes.
- The model notes' second diagram listed *siendo* as a listed morpheme of SER beside the stem *s‑*. The stem
  and the gerund's rule give it; the diagram no longer lists it (the owner, 2026-11-22, by the same page).
