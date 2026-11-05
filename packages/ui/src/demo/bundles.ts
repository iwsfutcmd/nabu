/** Set by .storybook/main.ts from NABU_STORYBOOK_BUNDLES. */
declare const __NABU_BUNDLES__: string | undefined;

/**
 * Where the stories load the compiled fixture courses (pnpm bundles), ending in "/": Storybook's
 * own copy, or on Pages the demo's (`../demo/bundles/`), so the site carries them once.
 */
export const BUNDLES: string = typeof __NABU_BUNDLES__ === "string" ? __NABU_BUNDLES__ : "bundles/";
