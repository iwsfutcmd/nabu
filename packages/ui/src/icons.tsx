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
