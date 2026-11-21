/**
 * Two spellings compared by sound where an orthography's sound is a token's pinned reading
 * (`sound: {from: reading, scheme}`, ADR 0148; docs/migration-design.md, "Stages 5 and 6"): the
 * typed spelling says what the expected one says when the scheme's statement lets it be read as one
 * of the expected word's pinned readings. Where it does, the places the two spellings differ are
 * found by pairing the steps of each one's path through that reading: what each writes of the same
 * stretch of the reading. A place is free only where every step on both sides there is free.
 */
import { graphemes } from "../text/graphemes.ts";
import type { ReadingProjection, ReadingSite } from "./reading.ts";
import type { SoundComparison, SoundPlace } from "./sound.ts";

const NOT_SAME: SoundComparison = { same: false, sounds: false, free: false, differs: [] };

/** Each step with where in the reading it starts and ends (in graphemes of its `says`). */
const spans = (sites: readonly ReadingSite[]): readonly { readonly site: ReadingSite; readonly from: number; readonly to: number }[] => {
  let at = 0;
  return sites.map((site) => {
    const from = at;
    at += graphemes(site.says).length;
    return { site, from, to: at };
  });
};

/** Where two paths through one reading write it differently: the stretches both paths begin and end at, each compared. */
const placesApart = (expected: readonly ReadingSite[], typed: readonly ReadingSite[]): readonly SoundPlace[] => {
  const e = spans(expected);
  const t = spans(typed);
  const out: SoundPlace[] = [];
  let i = 0;
  let j = 0;
  let endE = 0;
  let endT = 0;
  while (i < e.length || j < t.length) {
    const group: { e: ReadingSite[]; t: ReadingSite[] } = { e: [], t: [] };
    // Take steps from the side that is behind until both stand at one place of the reading.
    do {
      const nextE = e[i];
      const nextT = t[j];
      if (nextE !== undefined && (nextT === undefined || nextE.to <= nextT.to)) {
        group.e.push(nextE.site);
        endE = nextE.to;
        i++;
      } else if (nextT !== undefined) {
        group.t.push(nextT.site);
        endT = nextT.to;
        j++;
      } else break;
    } while (endE !== endT);
    const writtenE = group.e.map((s) => s.written).join("");
    const writtenT = group.t.map((s) => s.written).join("");
    if (writtenE === writtenT) continue;
    const all = [...group.e, ...group.t];
    const decided = group.e.find((s) => s.written !== "") ?? group.e[0] ?? group.t[0];
    const note = all.find((s) => s.note !== undefined)?.note;
    out.push({
      expected: writtenE,
      typed: writtenT,
      ...(decided !== undefined && { rule: decided.rule }),
      kind: all.length > 0 && all.every((s) => s.kind === "free") ? "free" : "fixed",
      ...(note !== undefined && { note }),
    });
  }
  return out;
};

/**
 * Whether `typed` says what `expected` says, its sound being any of `readings` (the readings the
 * course pins on tokens spelled `expected`, in the scheme the profile names). Readings have no
 * stress of their own here: `sounds` is `same`. Where the scheme cannot relate the expected spelling
 * to the reading (its statement does not account for it), the typed one still says it, and the
 * whole word is one fixed place.
 */
export const compareByReading = (scheme: ReadingProjection, readings: readonly string[], expected: string, typed: string): SoundComparison => {
  const e0 = expected.normalize("NFC");
  const t0 = typed.normalize("NFC");
  for (const reading of readings) {
    const t = scheme.spells(reading, t0);
    if (t === undefined) continue;
    const e = scheme.spells(reading, e0);
    const differs: readonly SoundPlace[] = e === undefined ? (e0 === t0 ? [] : [{ expected: e0, typed: t0, kind: "fixed" }]) : placesApart(e, t);
    return { same: true, sounds: true, free: differs.length > 0 && differs.every((d) => d.kind === "free"), differs };
  }
  return NOT_SAME;
};
