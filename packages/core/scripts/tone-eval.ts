/**
 * pnpm --filter @nabu/core tone-eval [<set dir>] [--json <out>]
 *
 * Tone accuracy per tone on a tone set (evals/tones/<set>/index.json and its WAV clips): native
 * clips heard as said, deliberately wrong clips flagged. Defaults to the synthetic eSpeak NG set;
 * the Phase 9 acceptance runs it on recorded native speakers (evals/tones/README.md).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { decodeWav, evaluateTones, toneSystemById, type EvalClip } from "../src/speech/index.ts";

interface Index {
  readonly set: string;
  readonly synthetic: boolean;
  readonly system: string;
  readonly speakers: readonly { readonly id: string; readonly clips: readonly { readonly file: string; readonly expected: string; readonly said: string; readonly kind: "native" | "wrong" }[] }[];
}

const args = process.argv.slice(2);
const jsonAt = args.indexOf("--json");
const out = jsonAt >= 0 ? args[jsonAt + 1] : undefined;
const dir = resolve(args.find((a, i) => !a.startsWith("--") && (jsonAt < 0 || i !== jsonAt + 1)) ?? join(import.meta.dirname, "../../../evals/tones/synthetic-espeak"));
const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8")) as Index;
// The set names its tone system (yue-jyutping): a reading scheme's, from its data (ADR 0109).
const system = toneSystemById(index.system);
if (system === undefined) throw new Error(`no tone system ${index.system}`);
const speakers = index.speakers.map((s) =>
  s.clips.map((c): EvalClip => {
    const wav = decodeWav(readFileSync(join(dir, c.file)));
    if (wav === undefined) throw new Error(`${c.file}: not 16-bit mono WAV`);
    return { ...wav, expected: c.expected, said: c.said, kind: c.kind };
  }),
);
const report = evaluateTones(speakers, system);
const pct = (x: number): string => `${(100 * x).toFixed(0)}%`;
console.info(`${index.set}${index.synthetic ? " (SYNTHETIC: not native speech)" : ""}, ${index.speakers.length} speaker(s)`);
console.info("tone  native heard as said   wrong flagged");
for (const [tone, c] of Object.entries(report.perTone)) {
  console.info(`  ${tone}   ${String(c.native.correct).padStart(3)}/${String(c.native.n).padEnd(3)} ${pct(c.native.n === 0 ? 0 : c.native.correct / c.native.n).padStart(5)}       ${String(c.wrong.flagged).padStart(3)}/${String(c.wrong.n).padEnd(3)} ${pct(c.wrong.n === 0 ? 0 : c.wrong.flagged / c.wrong.n).padStart(5)}`);
}
console.info(`all   native ${pct(report.nativeAccuracy)}, wrong flagged ${pct(report.wrongDetection)}`);
if (out !== undefined) writeFileSync(out, `${JSON.stringify({ set: index.set, synthetic: index.synthetic, ...report }, null, 2)}\n`);
