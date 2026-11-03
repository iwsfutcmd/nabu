/**
 * Strict logical-properties config (gameplan §11.9). stylelint-use-logical
 * covers margins, paddings, insets, sizes, corner radii, text-align, float and
 * clear; the built-in rules below close the gaps it leaves, so a physical
 * property can only get in with an explicit, reviewed disable comment.
 */
import useLogical from "stylelint-use-logical";

const PHYSICAL_BOX = ["top", "right", "bottom", "left"];

/** Three- and four-value shorthands name the left and right sides separately. */
const SIDE_SPECIFIC_SHORTHAND = "/^\\s*\\S+\\s+\\S+\\s+\\S+/";

export default {
  // Imported, not named: pnpm does not hoist the plugin to the repo root.
  plugins: [useLogical],
  rules: {
    "csstools/use-logical": ["always", { severity: "error" }],
    "property-disallowed-list": [
      [
        // physical sizes (also caught above; listed so the message is ours)
        "width",
        "height",
        "min-width",
        "min-height",
        "max-width",
        "max-height",
        // physical sides the plugin does not map
        ...PHYSICAL_BOX.flatMap((side) => [
          `border-${side}`,
          `border-${side}-width`,
          `border-${side}-style`,
          `border-${side}-color`,
          `scroll-margin-${side}`,
          `scroll-padding-${side}`,
        ]),
        "overflow-x",
        "overflow-y",
        "overscroll-behavior-x",
        "overscroll-behavior-y",
        "contain-intrinsic-width",
        "contain-intrinsic-height",
        // vertical text is done with writing-mode, never by rotating (§11.4)
        "rotate",
      ],
      { message: (p) => `"${p}" is physical; use its logical equivalent (gameplan §11.9).` },
    ],
    "declaration-property-value-disallowed-list": [
      {
        "text-align": ["left", "right"],
        float: ["left", "right"],
        clear: ["left", "right"],
        resize: ["horizontal", "vertical"],
        "caption-side": ["left", "right"],
        transform: ["/rotate/"],
        "/^(margin|padding|inset|border-width|border-style|border-color|scroll-margin|scroll-padding)$/": [SIDE_SPECIFIC_SHORTHAND],
        "/^(background-position|object-position|transform-origin)$/": ["/\\b(left|right)\\b/"],
      },
      { message: (p, v) => `"${p}: ${v}" is physical; use logical values (gameplan §11.9).` },
    ],
    // Selectors that pin a direction would let physical CSS back in through :dir()/[dir].
    "selector-disallowed-list": [["/\\[dir=/"], { message: () => "Style by :dir() only to mirror icons; never by [dir] attribute." }],
  },
};
