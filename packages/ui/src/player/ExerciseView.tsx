/** One view per template, and each template's instruction: shared by lessons and stories. */
import type { Exercise } from "@nabu/core/lesson";
import type { MessageId, Translator } from "@nabu/i18n";
import type { SchemeId } from "@nabu/schema";
import type { JSX } from "react";
import { schemeName } from "./Readings.tsx";
import type { ViewProps } from "./shared.ts";
import {
  CharReadView,
  ChooseTranslationView,
  CompleteTranslationView,
  GapFillView,
  ListenChoiceView,
  ListenTapView,
  ListenTypeView,
  MatchPairsView,
  SelectImageView,
  SpeakView,
  SpeechView,
  StoryArrangeView,
  StoryChooseView,
  StoryCompleteView,
  TilesView,
  ToneIdentifyView,
  TranscribeView,
  TranslateTypeView,
  VocalizeBuildView,
  WriteWordView,
  VocalizeView,
  type ViewExtras,
} from "./Views.tsx";

export const INSTRUCTIONS: Readonly<Record<Exercise["template"], MessageId>> = {
  "select-image": "player.instruction.select-image",
  "match-pairs": "player.instruction.match-pairs",
  "choose-translation": "player.instruction.choose-translation",
  "translate-tap.l2-l1": "player.instruction.translate-into-support",
  "translate-tap.l1-l2": "exercise.instruction.write-in",
  "translate-type.l1-l2": "exercise.instruction.write-in",
  "complete-translation": "player.instruction.complete-translation",
  "gap-fill": "player.instruction.gap-fill",
  "spelling-choice": "player.instruction.spelling-choice",
  "char-read": "player.instruction.char-read-word",
  "reading-feature": "player.instruction.reading-feature",
  "reading-disambiguation": "player.instruction.reading-disambiguation",
  vocalize: "player.instruction.vocalize-choice",
  "vocalize-build": "player.instruction.vocalize-build",
  transcribe: "player.instruction.transcribe-word",
  "speak.tier-0": "player.instruction.speak",
  speak: "player.instruction.speak-scored",
  "listen-speak": "player.instruction.listen-speak",
  "tone-identify": "player.instruction.tone-identify",
  "listen-tap": "player.instruction.listen-tap",
  "listen-type": "player.instruction.listen-type",
  "listen-select": "player.instruction.listen-select",
  "minimal-pair": "player.instruction.minimal-pair",
  "story-choose": "player.instruction.story-choose",
  "story-complete": "player.instruction.story-complete",
  "story-arrange": "player.instruction.story-arrange",
  "letter-read": "player.instruction.letter-read",
  "letter-pairs": "player.instruction.letter-pairs",
  "word-read": "player.instruction.word-read",
  "word-write": "player.instruction.word-write",
  "write-word": "player.instruction.write-word",
};

/**
 * A card's instruction. A fill-in says what it asks (ADR 0132): which word, or which form; one from
 * before that (a session left part-way) keeps its template's.
 */
export const instructionOf = (ex: Exercise): MessageId => {
  if (ex.template === "gap-fill" && ex.asks !== undefined) return ex.asks === "form" ? "player.instruction.gap-fill-form" : "player.instruction.gap-fill-word";
  if (ex.template === "story-complete" && ex.asks !== undefined) return ex.asks === "form" ? "player.instruction.story-complete-form" : "player.instruction.story-complete-word";
  // A reading card of an orthography read in several traditions names the one it asks (ADR 0138).
  if (traditionOf(ex) !== undefined) {
    if (ex.template === "char-read") return "player.instruction.char-read-word.tradition";
    if (ex.template === "reading-feature") return "player.instruction.reading-feature.tradition";
    if (ex.template === "reading-disambiguation") return "player.instruction.reading-disambiguation.tradition";
    if (ex.template === "transcribe") return "player.instruction.transcribe-word.tradition";
  }
  return INSTRUCTIONS[ex.template];
};

/** The reading tradition a reading card asks (ADR 0138), where its orthography is read in several. */
export const traditionOf = (ex: Exercise): SchemeId | undefined =>
  ex.template === "char-read" || ex.template === "reading-feature" || ex.template === "reading-disambiguation" || ex.template === "transcribe" ? ex.tradition : undefined;

/** A card's instruction, formatted: `language` is the course's name; a tradition's name comes from its data. */
export const formatInstruction = (t: Translator, ex: Exercise, language: string): string => {
  const tradition = traditionOf(ex);
  return t.format(instructionOf(ex), { language, ...(tradition === undefined ? {} : { scheme: schemeName(t, tradition) }) });
};

export const ExerciseView = (props: ViewProps & ViewExtras): JSX.Element => {
  const { ex } = props;
  switch (ex.template) {
    case "select-image":
      return <SelectImageView {...props} ex={ex} />;
    case "match-pairs":
    case "letter-pairs":
      return <MatchPairsView {...props} ex={ex} />;
    case "choose-translation":
      return <ChooseTranslationView {...props} ex={ex} />;
    case "translate-tap.l2-l1":
    case "translate-tap.l1-l2":
    case "word-write":
      return <TilesView {...props} ex={ex} />;
    case "translate-type.l1-l2":
      return <TranslateTypeView {...props} ex={ex} />;
    case "complete-translation":
      return <CompleteTranslationView {...props} ex={ex} />;
    case "write-word":
      return <WriteWordView {...props} ex={ex} />;
    case "gap-fill":
    case "spelling-choice":
      return <GapFillView {...props} ex={ex} />;
    case "char-read":
    case "reading-feature":
    case "reading-disambiguation":
    case "letter-read":
    case "word-read":
      return <CharReadView {...props} ex={ex} />;
    case "vocalize":
      return <VocalizeView {...props} ex={ex} />;
    case "vocalize-build":
      return <VocalizeBuildView {...props} ex={ex} />;
    case "transcribe":
      return <TranscribeView {...props} ex={ex} />;
    case "speak.tier-0":
      return <SpeakView {...props} ex={ex} />;
    case "speak":
    case "listen-speak":
      return <SpeechView {...props} ex={ex} />;
    case "tone-identify":
      return <ToneIdentifyView {...props} ex={ex} />;
    case "listen-tap":
      return <ListenTapView {...props} ex={ex} />;
    case "listen-type":
      return <ListenTypeView {...props} ex={ex} />;
    case "listen-select":
    case "minimal-pair":
      return <ListenChoiceView {...props} ex={ex} />;
    case "story-choose":
      return <StoryChooseView {...props} ex={ex} />;
    case "story-complete":
      return <StoryCompleteView {...props} ex={ex} />;
    case "story-arrange":
      return <StoryArrangeView {...props} ex={ex} />;
  }
};
