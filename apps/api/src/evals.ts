/**
 * The judge's evaluation harness (gameplan §13.2, §13.6, §16 Phase 8).
 *
 * Golden sets live in evals/judge/<course>.jsonl: for each course orthography, adversarial near
 * misses the judge must reject (negation, person, number, tense, particle, classifier, case,
 * register, word choice, omission, prompt injection) and paraphrases it should accept.
 *
 * - `check` needs no model and runs in CI: every item is valid, names a real production sentence,
 *   and is a real judge case (the accept-set grader says WRONG, so the judge would see it); every
 *   course orthography has enough adversarial items, at least one paraphrase and one injection.
 * - `run` sends every item through the same prompt and gateway as the server, then computes each
 *   orthography's gate (≤ 2% false accepts) for that model and prompt hash.
 */
import { readdirSync, readFileSync } from "node:fs";
import { GATE_MIN_ADVERSARIAL, gateOf, accepts, productionAccept, type EvalResult } from "@nabu/core/ai";
import { createGrader, type Grader } from "@nabu/core/lesson";
import type { EvalGate, EvalItem, JudgeOutput } from "@nabu/schema";
import type { Courses } from "./ai/courses.ts";
import { validAi, type Gateway } from "./ai/gateway.ts";
import { judgeVars, sentenceOf } from "./ai/routes.ts";

export const EVALS = new URL("../../../evals/", import.meta.url);

export interface LoadedItem {
  readonly file: string;
  readonly line: number;
  readonly item: EvalItem;
}

export const loadItems = (dir: URL = new URL("judge/", EVALS)): { items: LoadedItem[]; problems: string[] } => {
  const items: LoadedItem[] = [];
  const problems: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort()) {
    readFileSync(new URL(file, dir), "utf8")
      .split("\n")
      .forEach((raw, i) => {
        if (raw.trim() === "") return;
        let value: unknown;
        try {
          value = JSON.parse(raw);
        } catch {
          problems.push(`${file}:${i + 1}: not JSON`);
          return;
        }
        if (!validAi("EvalItem", value)) problems.push(`${file}:${i + 1}: not an EvalItem`);
        else items.push({ file, line: i + 1, item: value as EvalItem });
      });
  }
  return { items, problems };
};

const key = (i: EvalItem): string => `${i.course} ${i.orthography}`;

/** Check mode: the problems with a golden set, empty when it is sound. */
export const check = (loaded: readonly LoadedItem[], courses: Courses): string[] => {
  const problems: string[] = [];
  const ids = new Set<string>();
  const graders = new Map<string, Grader>();
  const groups = new Map<string, EvalItem[]>();
  for (const { file, line, item } of loaded) {
    const at = `${file}:${line} ${item.id}`;
    if (ids.has(item.id)) problems.push(`${at}: duplicate id`);
    ids.add(item.id);
    if (`${file}` !== `${item.course}.jsonl`) problems.push(`${at}: course ${item.course} in ${file}`);
    groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
    const course = courses.get(item.course, item.orthography);
    if (course === undefined) {
      problems.push(`${at}: no course ${item.course} in ${item.orthography}`);
      continue;
    }
    const sentence = sentenceOf(course, item.item);
    if (sentence === undefined) {
      problems.push(`${at}: no sentence ${item.item}`);
      continue;
    }
    if (item.direction !== "l1-l2") {
      problems.push(`${at}: the judge only sees L1→L2 answers (translate-type.l1-l2)`);
      continue;
    }
    const accept = productionAccept(sentence, item.orthography);
    if (accept === undefined) {
      problems.push(`${at}: ${item.item} has no reverse accept set`);
      continue;
    }
    let grader = graders.get(item.course);
    if (grader === undefined) {
      grader = createGrader(course);
      graders.set(item.course, grader);
    }
    const verdict = grader.grade(item.orthography, accept, item.answer).verdict;
    if (verdict !== "WRONG") problems.push(`${at}: the grader says ${verdict}, so the judge never sees ${JSON.stringify(item.answer)}`);
  }
  for (const [group, items] of groups) {
    const adversarial = items.filter((i) => i.expect === "reject").length;
    if (adversarial < GATE_MIN_ADVERSARIAL) problems.push(`${group}: ${adversarial} adversarial items; a gate needs ${GATE_MIN_ADVERSARIAL}`);
    if (!items.some((i) => i.expect === "accept")) problems.push(`${group}: no paraphrase (false rejects go unmeasured)`);
    if (!items.some((i) => i.category === "injection")) problems.push(`${group}: no prompt-injection item`);
  }
  return problems;
};

export interface GroupResult {
  readonly course: string;
  readonly orthography: string;
  readonly results: readonly (EvalResult & { readonly id: string; readonly category: string; readonly verdict?: JudgeOutput | undefined })[];
}

/** Run mode: every item through the judge as the server would call it. Nothing is cached. */
export const run = async (loaded: readonly LoadedItem[], courses: Courses, gateway: Gateway, subject = "evals"): Promise<GroupResult[]> => {
  const groups = new Map<string, GroupResult["results"][number][]>();
  for (const { item } of loaded) {
    const course = courses.get(item.course, item.orthography);
    const sentence = course === undefined ? undefined : sentenceOf(course, item.item);
    const accept = sentence === undefined ? undefined : productionAccept(sentence, item.orthography);
    if (course === undefined || sentence === undefined || accept === undefined) continue;
    const res = await gateway.call<JudgeOutput>({
      feature: "judge",
      prompt: "judge",
      output: "JudgeOutput",
      subject,
      course: item.course,
      orthography: item.orthography,
      vars: judgeVars(sentence, item.orthography, course.supportKey, accept, item.answer),
    });
    const verdict = res.ok ? res.value.output : undefined;
    groups.set(key(item), [...(groups.get(key(item)) ?? []), { id: item.id, category: item.category, expect: item.expect, accepted: verdict === undefined ? undefined : accepts(verdict), verdict }]);
  }
  return [...groups].map(([k, results]) => {
    const [course = "", orthography = ""] = k.split(" ");
    return { course, orthography, results };
  });
};

/** The gates a run opens or closes, for the gateway's model and the judge prompt's current hash. */
export const gatesOf = (groups: readonly GroupResult[], gateway: Gateway, evaluatedAt: string): EvalGate[] => {
  const provider = gateway.provider;
  if (provider === undefined) return [];
  return groups.map((g) => ({
    course: g.course,
    orthography: g.orthography as EvalGate["orthography"],
    provider: provider.name,
    model: provider.model,
    promptHash: gateway.promptHash("judge"),
    ...gateOf(g.results),
    evaluatedAt,
  }));
};

/** Merges new gates into a gates file: a gate replaces the one for the same course, orthography, provider and model. */
export const mergeGates = (old: readonly EvalGate[], fresh: readonly EvalGate[]): EvalGate[] => {
  const same = (a: EvalGate, b: EvalGate): boolean => a.course === b.course && a.orthography === b.orthography && a.provider === b.provider && a.model === b.model;
  return [...old.filter((o) => !fresh.some((f) => same(o, f))), ...fresh].sort((a, b) => `${a.course}${a.orthography}${a.model}`.localeCompare(`${b.course}${b.orthography}${b.model}`, "en"));
};
