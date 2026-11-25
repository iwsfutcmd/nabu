/**
 * A link to the exact card on screen (debug mode): the exercise itself, deflated and base64url-encoded into
 * `#/<course>/<orthography>/card/<code>`, so it opens the same card on any device, whatever the planner would
 * make there now (which gap, which wrong options). A card is course data: nothing in it names the learner.
 * A link names the bundle format it was made with (BUNDLE_FORMAT) as well as its own: one from another build
 * is refused rather than misread.
 */
import { BUNDLE_FORMAT, TEMPLATES, type Exercise } from "@nabu/core/lesson";

/** Raise when an exercise's shape changes so that an older link cannot be read as one. */
const FORMAT = 2;

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

const fromBase64Url = (code: string): Uint8Array | undefined => {
  try {
    const binary = atob(code.replaceAll("-", "+").replaceAll("_", "/"));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return undefined;
  }
};

const through = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> =>
  new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer());

/** The card as a link's code. */
export const encodeCard = async (ex: Exercise): Promise<string> =>
  toBase64Url(await through(new TextEncoder().encode(JSON.stringify({ format: FORMAT, bundle: BUNDLE_FORMAT, exercise: ex })), new CompressionStream("deflate-raw")));

/** The card a code carries, or nothing where it is cut short, garbled, or from another format. */
export const decodeCard = async (code: string): Promise<Exercise | undefined> => {
  const bytes = fromBase64Url(code);
  if (bytes === undefined) return undefined;
  try {
    const json: unknown = JSON.parse(new TextDecoder().decode(await through(bytes, new DecompressionStream("deflate-raw"))));
    if (typeof json !== "object" || json === null) return undefined;
    const { format, bundle, exercise } = json as { readonly format?: unknown; readonly bundle?: unknown; readonly exercise?: unknown };
    if (format !== FORMAT || bundle !== BUNDLE_FORMAT || typeof exercise !== "object" || exercise === null) return undefined;
    const { template, id } = exercise as { readonly template?: unknown; readonly id?: unknown };
    return typeof template === "string" && Object.hasOwn(TEMPLATES, template) && typeof id === "string" ? (exercise as Exercise) : undefined;
  } catch {
    return undefined;
  }
};
