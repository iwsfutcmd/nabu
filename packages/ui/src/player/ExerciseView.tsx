/** One view per template, and each template's instruction: shared by lessons and stories. */
import type { Exercise } from "@nabu/core/lesson";
import type { MessageId } from "@nabu/i18n";
import type { JSX } from "react";
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
  "char-read": "player.instruction.char-read-word",
  "reading-disambiguation": "player.instruction.reading-disambiguation",
  vocalize: "player.instruction.vocalize-choice",
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
    case "gap-fill":
      return <GapFillView {...props} ex={ex} />;
    case "char-read":
    case "reading-disambiguation":
    case "letter-read":
    case "word-read":
      return <CharReadView {...props} ex={ex} />;
    case "vocalize":
      return <VocalizeView {...props} ex={ex} />;
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
