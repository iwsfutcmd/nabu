/// <reference types="vite/client" />
declare module "*.css";
declare module "*?raw" {
  const source: string;
  export default source;
}

/** This build of the app (vite.config.ts): a new value after every update. */
declare const __NABU_BUILD__: string;

interface ImportMetaEnv {
  /** The sync server's base URL (e.g. https://api.example.org). Unset: the app is local-only. */
  readonly VITE_NABU_API?: string;
}

/** What the course list says of each course, read from the bundles at build time (vite-courses.ts). */
declare module "virtual:nabu-courses" {
  const summaries: Readonly<
    Record<string, { readonly units: number; readonly lessons: number; readonly levels?: readonly [string, string]; readonly listening: boolean; readonly speaking: boolean }>
  >;
  export default summaries;
}
