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
    <path d="m7 12.5 3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Feedback: not right. Symmetric: never mirrors. */
export const WrongIcon = ({ size = 28 }: IconProps): JSX.Element => (
  <svg {...base(size, styles.icon)} data-icon="wrong">
    <circle cx="12" cy="12" r="11" fill="currentColor" />
    <path d="m8 8 8 8M16 8l-8 8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

/** A locked lesson. Symmetric: never mirrors. */
export const LockIcon = ({ size = 20 }: IconProps): JSX.Element => (
  <svg {...base(size, styles.icon)} data-icon="lock">
    <rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
  </svg>
);

/** Play slowly (a tortoise). Media control: never mirrors. */
export const SlowIcon = ({ size = 20 }: IconProps): JSX.Element => (
  <svg {...base(size, styles.icon)} data-icon="slow">
    <path d="M4 15.5c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5z" fill="currentColor" />
    <path d="M17 13.5h1.6a2 2 0 0 0 0-4h-.4M6 15.5v2.2M14.5 15.5v2.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
