/// <reference types="vite/client" />
declare module "*.css";
declare module "*?raw" {
  const source: string;
  export default source;
}

interface ImportMetaEnv {
  /** The sync server's base URL (e.g. https://api.example.org). Unset: the app is local-only. */
  readonly VITE_NABU_API?: string;
}
