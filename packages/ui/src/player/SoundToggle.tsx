/**
 * The sound switch in a lesson's or story's header (P6). Off, nothing plays by itself: no tone
 * after an answer, no clip said once a card is answered or a story line appears, no listening
 * prompt that starts on its own. The play buttons still work: pressing one is asking for it.
 */
import type { JSX } from "react";
import { ToggleButton } from "react-aria-components";
import { useTranslator } from "../context.tsx";
import { SoundOffIcon, SoundOnIcon } from "../icons.tsx";
import styles from "./Player.module.css";

export const SoundToggle = ({ on, onChange }: { readonly on: boolean; readonly onChange: (on: boolean) => void }): JSX.Element => {
  const t = useTranslator();
  return (
    <ToggleButton className={styles.iconButton} isSelected={on} onChange={onChange} aria-label={t.format("player.sound.label")} data-action="sound" data-sound={on ? "on" : "off"}>
      {on ? <SoundOnIcon /> : <SoundOffIcon />}
    </ToggleButton>
  );
};
