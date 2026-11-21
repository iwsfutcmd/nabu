/**
 * @nabu/schema — TypeScript types for every Nabu document, generated from
 * /schemas (JSON Schema 2020-12). The generated file is never hand-edited.
 */
export type * from "./generated/schema.ts";

// The shapes of the lexical model under the names they take once the old ones are gone
// (docs/migration-design.md, deliverable 3): a bundle of format version 2 and an event of schema 2.
// Until the schema files themselves are renamed, the generated types carry `Next`.
export type {
  NextBundleAudio as BundleAudio,
  NextBundleFile as BundleFile,
  NextBundleManifest as BundleManifest,
  NextBundleNode as BundleNode,
  NextBundleSentence as BundleSentence,
  NextBundleStory as BundleStory,
  NextBundleStoryLine as BundleStoryLine,
  NextBundleStoryStep as BundleStoryStep,
  NextBundleUnit as BundleUnit,
  NextScriptItem as ScriptItem,
  NextAnswerReported as AnswerReported,
  NextAnswerSubmitted as AnswerSubmitted,
  NextExercisePresented as ExercisePresented,
  NextExerciseRef as ExerciseRef,
  NextExerciseSkipped as ExerciseSkipped,
  NextGoalSet as GoalSet,
  NextLearnerEvent as LearnerEvent,
  NextOutcomeRevised as OutcomeRevised,
  NextProgressReset as ProgressReset,
  NextSentenceReported as SentenceReported,
  NextSessionCompleted as SessionCompleted,
  NextSessionStarted as SessionStarted,
} from "./generated/schema.ts";

// An event as it was logged before the lexical model (schema 1): what `upgrade` reads, and nothing else.
export type {
  AnswerReported as AnswerReportedV1,
  AnswerSubmitted as AnswerSubmittedV1,
  ExercisePresented as ExercisePresentedV1,
  ExerciseRef as ExerciseRefV1,
  ExerciseSkipped as ExerciseSkippedV1,
  GoalSet as GoalSetV1,
  KcCredit as KcCreditV1,
  LearnerEvent as LearnerEventV1,
  OutcomeRevised as OutcomeRevisedV1,
  ProgressReset as ProgressResetV1,
  SentenceReported as SentenceReportedV1,
  SessionCompleted as SessionCompletedV1,
  SessionStarted as SessionStartedV1,
} from "./generated/schema.ts";
