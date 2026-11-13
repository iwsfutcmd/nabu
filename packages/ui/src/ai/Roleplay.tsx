/**
 * Roleplay (gameplan §13.4): a conversation with a character from a scenario card. The model's
 * turns were checked against the learner's vocabulary before they arrive; each can show its
 * translation. The learner's field is the player's IME-safe one: nothing is sent, normalized or
 * reset during composition, and a turn becomes TaggedText only once it is sent. Send stays enabled
 * while a keyboard composes: a press then waits for the composition to end (ADR 0118, D39).
 */
import { autoTokens, type TextBase } from "@nabu/core/ai";
import type { Direction } from "@nabu/i18n";
import type { TaggedText } from "@nabu/schema";
import { useRef, useState, type JSX } from "react";
import { useTranslator } from "../context.tsx";
import { useSettledSubmit } from "../ime.ts";
import { AnswerInput } from "../player/AnswerInput.tsx";
import { T } from "../T.tsx";
import styles from "./Ai.module.css";

export interface ChatTurn {
  readonly role: "character" | "learner";
  readonly text: TaggedText;
  readonly translation?: TaggedText | undefined;
}

export interface ScenarioCard {
  readonly title: TaggedText;
  readonly setting: TaggedText;
  readonly character: TaggedText;
  readonly goal: TaggedText;
}

export type RoleplayStatus = "idle" | "thinking" | "no-turn" | "unavailable" | "budget" | "locked" | "gone";

export interface RoleplayChatProps {
  readonly scenario: ScenarioCard;
  readonly turns: readonly ChatTurn[];
  /** The target orthography: the field's lang and the learner turns' language. */
  readonly base: TextBase;
  readonly dir: Direction;
  readonly status: RoleplayStatus;
  readonly onSend: (turn: TaggedText) => void;
  /** Translations open at first (Storybook, tests). */
  readonly initialTranslations?: readonly number[];
}

const STATUS: Readonly<Record<Exclude<RoleplayStatus, "idle">, "ai.roleplay.thinking" | "ai.roleplay.no-turn" | "ai.unavailable" | "ai.budget" | "ai.roleplay.locked" | "ai.roleplay.gone">> = {
  thinking: "ai.roleplay.thinking",
  "no-turn": "ai.roleplay.no-turn",
  unavailable: "ai.unavailable",
  budget: "ai.budget",
  locked: "ai.roleplay.locked",
  gone: "ai.roleplay.gone",
};

export const RoleplayChat = ({ scenario, turns, base, dir, status, onSend, initialTranslations = [] }: RoleplayChatProps): JSX.Element => {
  const t = useTranslator();
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set(initialTranslations));
  const sendButton = useRef<HTMLButtonElement>(null);
  const compose = useRef<HTMLDivElement>(null);
  const ready = status !== "thinking" && draft.trim() !== "";
  // The settled turn: never mid-composition, when a press waits for compositionend (D39).
  const settled = useSettledSubmit(
    () => {
      if (!ready) return;
      onSend(autoTokens(draft.trim(), base));
      setDraft("");
    },
    sendButton,
    compose,
  );
  return (
    <section className={styles.roleplay} data-roleplay="">
      <header className={styles.card} data-ink-container="scenario">
        <h2 className={styles.title}>
          <T text={scenario.title} />
        </h2>
        <dl className={styles.facts}>
          <dt>{t.format("ai.roleplay.setting")}</dt>
          <dd>
            <T as="p" text={scenario.setting} />
          </dd>
          <dt>{t.format("ai.roleplay.character")}</dt>
          <dd>
            <T as="p" text={scenario.character} />
          </dd>
          <dt>{t.format("ai.roleplay.goal")}</dt>
          <dd>
            <T as="p" text={scenario.goal} />
          </dd>
        </dl>
      </header>
      <ol className={styles.log} aria-label={t.format("ai.roleplay.log")} data-roleplay-log="">
        {turns.map((turn, i) => (
          <li key={i} className={turn.role === "learner" ? styles.mine : styles.theirs} data-turn={turn.role} data-ink-container="turn">
            <span className={styles.speaker}>{t.format(turn.role === "learner" ? "ai.roleplay.you" : "ai.roleplay.them")}</span>
            <T as="p" text={turn.text} />
            {turn.translation !== undefined && (
              <>
                <button
                  type="button"
                  className={styles.inline}
                  aria-expanded={open.has(i)}
                  onClick={() => setOpen((s) => (s.has(i) ? new Set([...s].filter((x) => x !== i)) : new Set([...s, i])))}
                  data-action="translation"
                >
                  {t.format(open.has(i) ? "ai.roleplay.hide-translation" : "ai.roleplay.show-translation")}
                </button>
                {open.has(i) && <T as="p" className={styles.translation} text={turn.translation} />}
              </>
            )}
          </li>
        ))}
      </ol>
      <p className={styles.status} role="status" data-roleplay-status={status}>
        {status === "idle" ? "" : t.format(STATUS[status])}
      </p>
      <div ref={compose} className={styles.compose}>
        <AnswerInput
          value={draft}
          base={base}
          dir={dir}
          label={t.format("ai.roleplay.your-turn")}
          disabled={false}
          extraKeys={[]}
          onInput={setDraft}
          onCompositionStart={settled.composition.onCompositionStart}
          onCompositionEnd={(text) => {
            setDraft(text);
            settled.composition.onCompositionEnd();
          }}
          onSubmit={settled.enter}
        />
        {/* Enabled while composing (D39): a press waits for the composition to end, then sends the settled turn. */}
        <button ref={sendButton} type="button" className={styles.send} onClick={settled.press} disabled={!ready} data-action="send">
          {t.format("ai.roleplay.send")}
        </button>
      </div>
    </section>
  );
};
