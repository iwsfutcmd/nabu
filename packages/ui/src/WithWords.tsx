/**
 * A message with something of its own in it: words of the language being learned (cómo and como),
 * a label in the support language, an id in code. Each reaches the message as a placeholder, so a
 * translation puts it where its grammar wants it; the rest is the UI's text.
 */
import type { MessageId } from "@nabu/i18n";
import type { TaggedText } from "@nabu/schema";
import { Fragment, type JSX, type ReactNode } from "react";
import { useTranslator } from "./context.tsx";
import { T } from "./T.tsx";

/** Marks where a slot goes in a message: a private-use character no message holds. */
const SLOT = "\uE000";

/** A message with each slot's node where its placeholder stands. */
export const WithSlots = ({ id, slots }: { readonly id: MessageId; readonly slots: Readonly<Record<string, ReactNode>> }): JSX.Element => {
  const t = useTranslator();
  const names = Object.keys(slots);
  const slot = (i: number): string => `${SLOT}${i}${SLOT}`;
  const parts = t.formatToParts(id, Object.fromEntries(names.map((name, i) => [name, slot(i)])));
  return (
    <>
      {parts.map((part, i) => {
        // What a slot holds isolates itself (<T>, a <bdi>, a <code dir>).
        if (part.type === "bidiIsolation") return null;
        const value = "value" in part && typeof part.value === "string" ? part.value : "";
        const name = names.find((_, k) => slot(k) === value);
        return <Fragment key={i}>{name === undefined ? value : slots[name]}</Fragment>;
      })}
    </>
  );
};

/** A message with words in it, each through <T> with its own lang, dir and fonts. */
export const WithWords = ({ id, words }: { readonly id: MessageId; readonly words: Readonly<Record<string, TaggedText>> }): JSX.Element => (
  <WithSlots id={id} slots={Object.fromEntries(Object.entries(words).map(([name, word]) => [name, <T key={name} text={word} />]))} />
);
