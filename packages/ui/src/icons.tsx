/**
 * Inline SVG icons (no icon font, so nothing falls back to a system font).
 * Icons that point along the reading direction mirror with the inline
 * direction; media icons such as play never mirror (gameplan §11.3).
 */
import type { JSX, SVGProps } from "react";
import styles from "./icons.module.css";

interface IconProps {
  readonly size?: number;
}

const base = (size: number, className: string): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  "aria-hidden": true,
  focusable: false,
  className,
});

/** Points toward the inline end: mirrors in RTL. */
export const ArrowForwardIcon = ({ size = 20 }: IconProps): JSX.Element => (
  <svg {...base(size, `${styles.icon} ${styles.mirror}`)} data-icon="arrow-forward">
    <path d="M5 12h12m-5-6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Media control: never mirrors. */
export const PlayIcon = ({ size = 20 }: IconProps): JSX.Element => (
  <svg {...base(size, styles.icon)} data-icon="play">
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
  </svg>
);

/** Symmetric: nothing to mirror. */
export const CloseIcon = ({ size = 20 }: IconProps): JSX.Element => (
  <svg {...base(size, styles.icon)} data-icon="close">
    <path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

/** Feedback: right. Symmetric enough not to mirror. */
export const CorrectIcon = ({ size = 28 }: IconProps): JSX.Element => (
  <svg {...base(size, styles.icon)} data-icon="correct">
    <circle cx="12" cy="12" r="11" fill="currentColor" />
    <path d="m7 12.5 3.2 3.2L17 9" fill="none" className={styles.mark} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Feedback: not right. Symmetric: never mirrors. */
export const WrongIcon = ({ size = 28 }: IconProps): JSX.Element => (
  <svg {...base(size, styles.icon)} data-icon="wrong">
    <circle cx="12" cy="12" r="11" fill="currentColor" />
    <path d="m8 8 8 8M16 8l-8 8" fill="none" className={styles.mark} strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

/**
 * Shows what is folded away, or folds it again: a chevron pointing down, and up once `open`. Points
 * across the line, not along it: never mirrors.
 */
export const ExpandIcon = ({ size = 20, open = false }: IconProps & { readonly open?: boolean }): JSX.Element => (
  <svg {...base(size, styles.icon)} data-icon={open ? "collapse" : "expand"}>
    <path d={open ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A locked lesson. Symmetric: never mirrors. */
export const LockIcon = ({ size = 20 }: IconProps): JSX.Element => (
  <svg {...base(size, styles.icon)} data-icon="lock">
    <rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
  </svg>
);

/** Report a problem (a flag on its pole). Points nowhere: never mirrors. */
export const FlagIcon = ({ size = 20 }: IconProps): JSX.Element => (
  <svg {...base(size, styles.icon)} data-icon="flag">
    <path d="M6 21V4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M6 4.5h10.5l-2.4 4 2.4 4H6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

/** Sound on (a speaker sending waves). Media control: never mirrors. */
export const SoundOnIcon = ({ size = 20 }: IconProps): JSX.Element => (
  <svg {...base(size, styles.icon)} data-icon="sound-on">
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
    <path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** Sound off (a speaker, crossed out). Media control: never mirrors. */
export const SoundOffIcon = ({ size = 20 }: IconProps): JSX.Element => (
  <svg {...base(size, styles.icon)} data-icon="sound-off">
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
    <path d="m15.5 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** Preferences (a cog wheel of eight teeth). Symmetric: never mirrors. */
export const SettingsIcon = ({ size = 20 }: IconProps): JSX.Element => (
  <svg {...base(size, styles.icon)} data-icon="settings">
    <path
      d="M10.38 4.98L10.58 2.51L13.42 2.51L13.62 4.98A7.2 7.2 0 0 1 15.82 5.89L17.71 4.28L19.72 6.29L18.11 8.18A7.2 7.2 0 0 1 19.02 10.38L21.49 10.58L21.49 13.42L19.02 13.62A7.2 7.2 0 0 1 18.11 15.82L19.72 17.71L17.71 19.72L15.82 18.11A7.2 7.2 0 0 1 13.62 19.02L13.42 21.49L10.58 21.49L10.38 19.02A7.2 7.2 0 0 1 8.18 18.11L6.29 19.72L4.28 17.71L5.89 15.82A7.2 7.2 0 0 1 4.98 13.62L2.51 13.42L2.51 10.58L4.98 10.38A7.2 7.2 0 0 1 5.89 8.18L4.28 6.29L6.29 4.28L8.18 5.89A7.2 7.2 0 0 1 10.38 4.98ZM15 12a3 3 0 1 0-6 0a3 3 0 1 0 6 0Z"
      fill="currentColor"
      fillRule="evenodd"
    />
  </svg>
);

/** Play slowly (a tortoise). Media control: never mirrors. */
export const SlowIcon = ({ size = 20 }: IconProps): JSX.Element => (
  <svg {...base(size, styles.icon)} data-icon="slow">
    <path d="M4 15.5c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5z" fill="currentColor" />
    <path d="M17 13.5h1.6a2 2 0 0 0 0-4h-.4M6 15.5v2.2M14.5 15.5v2.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
