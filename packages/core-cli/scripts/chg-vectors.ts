/**
 * Writes conformance/realise-chg.json's and spell-chg.json's chg vectors from the course (docs/rules/chg.md): one
 * realise vector per allomorph a course token needs (the first token whose realisation changes without it; a free
 * one, whose alternatives do), one per phonology rule a token takes; one spell vector per rule of chg-Arab/standard's
 * and chg-Latn/schluessel's statements (the first course form whose spelling changes without the rule, else the
 * first it fires on, else a constructed word). Expected values are core-cli's own answers, so both harnesses check
 * the same thing; each vector's note keeps the Schluessel references the file's notes gave its lexeme. The vectors on
 * invented languages (realise/free/*, spell/fixture/*) are kept as they are. After a change to chg's lexicon,
 * language or profiles, run from packages/core-cli and look at the diff:
 *   node scripts/chg-vectors.ts
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileLanguage, compileSpeller, realiseToken, spell, type Realisation, type Speller } from "@nabu/core";
import type { LanguageDeclaration, Lexicon, OrthographyProfile } from "@nabu/schema";
import { parse } from "yaml";
import { handleRequest } from "../src/protocol.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const nfc = (s: string): string => s.normalize("NFC");
const read = (path: string): unknown => parse(readFileSync(`${ROOT}/${path}`, "utf8"));
const declared = read("lexicons/chg/language.yaml") as LanguageDeclaration;
const lexicon = read("lexicons/chg/lexemes.yaml") as Lexicon;
const notation = declared.notation ?? { sets: {} };
const full = compileLanguage(declared, lexicon);
if (!full.ok) throw new Error(`chg: ${JSON.stringify(full.error)}`);

interface Written { readonly lexeme: string; readonly base?: true }
interface Token { readonly surface: string; readonly reading: string; readonly lexemes: readonly Written[]; readonly sentence: string }
interface Vector { readonly id: string; readonly op: string; readonly args: Readonly<Record<string, unknown>>; readonly expected: unknown; readonly note: string }

// Every token with a Schluessel reading, in unit order, with the sentence or story it is in.
const tokens: Token[] = [];
const visit = (o: unknown, sentence: string): void => {
  if (Array.isArray(o)) {
    for (const x of o) visit(x, sentence);
    return;
  }
  if (o === null || typeof o !== "object") return;
  const r = o as Record<string, unknown>;
  const here = typeof r["id"] === "string" && /^(?:s|st|q)\./u.test(r["id"]) ? r["id"] : sentence;
  if (Array.isArray(r["tokens"])) {
    for (const t of r["tokens"] as Record<string, unknown>[]) {
      const reading = (t["readings"] as Record<string, string> | undefined)?.["schluessel"];
      if (reading === undefined) continue;
      const listed = (t["lexemes"] as { lexeme: string; base?: boolean }[] | undefined) ?? [{ lexeme: t["lexeme"] as string, base: true }];
      tokens.push({ surface: nfc(t["surface"] as string), reading: nfc(reading), lexemes: listed.map((l) => ({ lexeme: `lexeme:${l.lexeme}`, ...(l.base === true && { base: true as const }) })), sentence: here });
    }
  }
  for (const [k, v] of Object.entries(r)) if (k !== "tokens") visit(v, here);
};
const units = `${ROOT}/courses/chg/units`;
for (const f of readdirSync(units).sort()) visit(parse(readFileSync(`${units}/${f}`, "utf8")), f);

const ask = (op: string, args: Readonly<Record<string, unknown>>): unknown => {
  const r = handleRequest({ id: 1, op, ...args });
  if (!r.ok) throw new Error(`${op}: ${r.error}`);
  return r.result;
};
type Realised = ReturnType<typeof realiseToken>;
const keyOf = (r: Realised): string => (r.ok ? JSON.stringify([r.value.form, (r.value.alternatives ?? []).map((a) => a.form)]) : `error ${r.error.kind}`);
/** What a vector pins of a realisation: its form, status and steps, and its free alternatives where it has any. */
const pinned = (r: unknown): unknown => {
  const res = r as { ok: boolean; value?: Realisation };
  if (!res.ok || res.value === undefined) return r;
  const v = res.value;
  return { ok: true, value: { form: v.form, status: v.status, steps: v.steps, ...(v.alternatives !== undefined && { alternatives: v.alternatives }) } };
};

// Schluessel's references, kept from the file's own notes: what follows the sentence, per lexeme.
const REALISE = `${ROOT}/conformance/realise-chg.json`;
const SPELL = `${ROOT}/conformance/spell-chg.json`;
const before = JSON.parse(readFileSync(REALISE, "utf8")) as { vectors: Vector[] };
const refs = new Map<string, string[]>();
for (const v of before.vectors) {
  const id = /^realise\/chg\/([^/]+)\/\d+$/u.exec(v.id)?.[1];
  const tail = /\)\. (S \d.*)$/u.exec(v.note)?.[1];
  if (id === undefined || tail === undefined) continue;
  const known = refs.get(id) ?? [];
  for (const ref of tail.split(/; (?=S \d)/u)) if (!known.includes(ref)) known.push(ref);
  refs.set(id, known);
}

const conditionOf = (a: Readonly<Record<string, unknown>>): string => {
  const bits = ["before", "after"].flatMap((side) => {
    const c = a[side] as Record<string, unknown> | undefined;
    return c === undefined ? [] : [`${side} ${Object.entries(c).map(([k, v]) => `${k} ${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ")}`];
  });
  return bits.length > 0 ? `; ${bits.join("; ")}` : "";
};

// ---------------------------------------------------------------- realise
const realised = tokens.map((t) => realiseToken(full.value, t.lexemes, { spellings: false }));
const realise: Vector[] = [];
const seen = new Set<string>();
const push = (list: Vector[], v: Vector): void => {
  if (seen.has(v.id)) return;
  seen.add(v.id);
  list.push(v);
};
for (const e of lexicon.lexemes) {
  const all = e.allomorphs ?? [];
  for (let i = 0; i < all.length; i++) {
    const without = { ...lexicon, lexemes: lexicon.lexemes.map((x) => (x.id === e.id ? { ...x, allomorphs: all.filter((_, j) => j !== i) } : x)) };
    const lang = compileLanguage(declared, without);
    if (!lang.ok) continue;
    const k = tokens.findIndex((t, n) => t.lexemes.some((l) => l.lexeme === e.id) && (realised[n] as Realised).ok && keyOf(realised[n] as Realised) !== keyOf(realiseToken(lang.value, t.lexemes, { spellings: false })));
    if (k < 0) continue;
    const t = tokens[k] as Token;
    const a = all[i] as unknown as Readonly<Record<string, unknown>>;
    const args = { lang: "chg", lexemes: t.lexemes, spellings: false };
    const ref = refs.get(e.id.slice(7))?.join("; ");
    push(realise, {
      id: `realise/chg/${e.id.slice(7)}/${i}`,
      op: "realise-token",
      args,
      expected: pinned(ask("realise-token", args)),
      note: `${e.id}'s allomorph ${i} ('${String(a["form"])}'${a["free"] === true ? ", free: an alternative" : ""}${conditionOf(a)}), in ${t.surface} ${t.reading} (${t.sentence}).${ref !== undefined ? ` ${ref}` : ""}`,
    });
  }
}
tokens.forEach((t, n) => {
  const r = realised[n] as Realised;
  if (!r.ok) return;
  for (const s of r.value.steps) {
    const args = { lang: "chg", lexemes: t.lexemes, spellings: false };
    push(realise, { id: `realise/chg/${s.rule.replace(/^rule:/u, "rule-")}${s.branch !== undefined ? `/${s.branch}` : ""}`, op: "realise-token", args, expected: pinned(ask("realise-token", args)), note: `${s.rule}${s.branch !== undefined ? ` (${s.branch})` : ""}, in ${t.surface} ${t.reading} (${t.sentence}).` });
  }
});

// ---------------------------------------------------------------- spell
const speller = (p: OrthographyProfile): Speller => {
  const s = compileSpeller(p, notation);
  if (!s.ok) throw new Error(s.error.join("; "));
  return s.value;
};
const profileAt = (file: string): { readonly profile: OrthographyProfile; readonly text: string } => {
  const text = readFileSync(`${ROOT}/profiles/${file}`, "utf8");
  return { profile: parse(text) as OrthographyProfile, text };
};
const arabic = speller(profileAt("chg-Arab.standard.yaml").profile);
const latin = speller(profileAt("chg-Latn.schluessel.yaml").profile);
const spellings = (s: Speller, form: string): string[] => {
  const r = spell(s, form);
  return [r.spelling, ...r.alternatives.map((x) => x.spelling)].map(nfc);
};
/** Whether a form is the token's own: the Arabic among its spellings and the Latin its reading (a constructed word is). */
const own = (form: string, t: Token): boolean => t.surface === "" || (spellings(arabic, form).includes(t.surface) && nfc(spell(latin, form).spelling).toLocaleLowerCase("und") === t.reading.toLocaleLowerCase("und"));

const forms: { readonly form: string; readonly t: Token }[] = [];
tokens.forEach((t, n) => {
  const r = realised[n] as Realised;
  if (!r.ok) return;
  forms.push({ form: nfc(r.value.form), t });
  for (const a of r.value.alternatives ?? []) forms.push({ form: nfc(a.form), t });
});
for (const e of lexicon.lexemes) {
  const ar = e.spelled?.["chg-Arab/standard"]?.[0];
  if (typeof e.form !== "string" || e.on !== undefined || ar === undefined) continue;
  forms.push({ form: nfc(e.form), t: { surface: nfc(ar), reading: nfc(e.spelled?.["chg-Latn/schluessel"]?.[0] ?? ""), lexemes: [], sentence: `${e.id}'s lemma` } });
}
// Words no course word is, for rules no course form fires (each named in its vector's note).
const X = "̦", Y = "̯";
for (const [form, gloss] of [["bäk+GA", "bäkkä, to the bey"], ["yol+lAr", "yollar, roads"], ["yum+mA", "yummä, not closing"], ["qilič+čA", "qiličča, like a sword"], ["šayʾ", "šayʾ, a thing"], ["bē·āb", "bē·āb, without water"], ["bē·adab", "bē·adab, ill-mannered"], [`I${X}brā${X}hīm`, "Ibrāhīm, written without its first vowel letter or ā"], [`Mūsa${Y}`, "Mūsa, Moses, written with ی"]] as const)
  forms.push({ form: nfc(form), t: { surface: "", reading: gloss, lexemes: [], sentence: "constructed: no course word" } });

const spelled: Vector[] = [];
for (const [id, file, short, want] of [["chg-Arab/standard", "chg-Arab.standard.yaml", "arab", "surface"], ["chg-Latn/schluessel", "chg-Latn.schluessel.yaml", "latn", "reading"]] as const) {
  const { profile, text } = profileAt(file);
  const statement = profile.spell;
  if (statement === undefined) throw new Error(`${id} states no spell`);
  // Each rule's comment: its own, else its section's (the comment lines above it).
  const notes: string[] = [];
  let section = "";
  let open = false;
  for (const line of text.slice(text.indexOf("\n  rules:\n") + 10).split("\n")) {
    if (/^\S/u.test(line)) break;
    if (line.startsWith("  # ")) {
      section = open ? `${section} ${line.slice(4)}` : line.slice(4);
      open = true;
      continue;
    }
    open = false;
    if (line.startsWith("  - ")) notes.push(/ {2}# (.*)$/u.exec(line)?.[1] ?? section);
  }
  const rules = statement.rules;
  if (notes.length !== rules.length) throw new Error(`${file}: ${notes.length} notes, ${rules.length} rules`);
  const whole = speller(profile);
  const out = (s: Speller, f: string): string => JSON.stringify(spellings(s, f));
  const used = new Set<string>();
  const with_ = (kept: typeof rules): Speller => speller({ ...profile, spell: { ...statement, rules: kept } });
  for (let k = 0; k < rules.length; k++) {
    const less = with_(rules.filter((_, j) => j !== k));
    let hit = forms.find(({ form, t }) => !used.has(form) && out(whole, form) !== out(less, form) && own(form, t)) ?? forms.find(({ form }) => out(whole, form) !== out(less, form));
    if (hit === undefined) {
      const upto = with_(rules.slice(0, k + 1)), prior = with_(rules.slice(0, k));
      hit = forms.find(({ form, t }) => !used.has(form) && own(form, t) && out(upto, form) !== out(prior, form)) ?? forms.find(({ form }) => out(upto, form) !== out(prior, form));
    }
    if (hit === undefined) {
      console.error(`${id} rule ${k + 1}: fires on no form`);
      continue;
    }
    used.add(hit.form);
    const mine = own(hit.form, hit.t) && hit.t.surface !== "";
    const expected = want === "surface" && mine ? hit.t.surface : spell(whole, hit.form).spelling;
    const args = { profile: id, form: hit.form, expected };
    const said = mine || hit.t.surface === "" ? hit.t.reading : `${spell(latin, hit.form).spelling} (a free spelling of ${hit.t.reading})`;
    const note = notes[k] ?? "";
    spelled.push({ id: `spell/chg/${short}/rule-${String(k + 1).padStart(2, "0")}`, op: "spell", args, expected: ask("spell", args), note: `Rule ${k + 1}${note !== "" ? ` (${note})` : ""}: ${said} ${mine ? hit.t.surface : spell(arabic, hit.form).spelling} (${hit.t.sentence}).` });
  }
}

// ---------------------------------------------------------------- write
const REALISE_COMMENT =
  "Realising chg's tokens (docs/rules/chg.md): a token's lexemes merged (ADR 0158), the base in its citation cell, the others in their allomorphs, joined and rewritten by chg's rules (lexicons/chg/language.yaml, lexemes.yaml). The forms are Schluessel's reading with signs for what only the Arabic writes (a vowel written or not where the default says otherwise, a twin letter, a letter written and not said, the half-space as ·; the notation's `sets` and docs/rules/chg.md say which), suffixes in archiphonemes (A U D G K, Ğ for the dative) that each orthography's `spell` resolves. An allomorph marked `free` (a scribe's other spelling) is never chosen: each that holds gives the token an alternative. realise/free/* run a language of their own; realise/chg/<lexeme>/<n> is the first course token whose realisation changes without allomorph n (a free one: whose alternatives do), realise/chg/rule-* a phonology rule a token takes. Written by packages/core-cli/scripts/chg-vectors.ts from the course: regenerate them, never edit by hand.";
const SPELL_COMMENT =
  "Spelling chg's lexical forms (docs/rules/chg.md) both ways: chg-Arab/standard's and chg-Latn/schluessel's `spell` statements (profiles/), run by @nabu/core over forms in chg's notation (lexicons/chg/language.yaml), realised ones with their boundaries (+), which the statements keep for their rules (`boundaries: true`). spell/fixture/boundaries/* run a statement and notation of their own; spell/chg/arab/rule-<n> and spell/chg/latn/rule-<n> one vector per rule of each statement, the first course form whose spelling changes without it (else the first it fires on), its `expected` the course's own spelling (Arabic: the token's surface; Latin: Schluessel's reading) unless the note says the form is a free spelling or a constructed word for a rule no course word needs. Written by packages/core-cli/scripts/chg-vectors.ts from the course: regenerate them, never edit by hand.";
/** Format characters (the ZWNJ) as \u escapes, as the repository writes invisibles. */
const escaped = (json: string): string => json.replace(/\p{Cf}/gu, (c) => `\\u${(c.codePointAt(0) as number).toString(16).padStart(4, "0")}`);
for (const [path, keep, vectors, comment] of [[REALISE, "realise/free/", realise, REALISE_COMMENT], [SPELL, "spell/fixture/", spelled, SPELL_COMMENT]] as const) {
  const old = JSON.parse(readFileSync(path, "utf8")) as { vectors: Vector[] };
  const kept = old.vectors.filter((v) => v.id.startsWith(keep));
  writeFileSync(path, `${escaped(JSON.stringify({ $comment: comment, vectors: [...kept, ...vectors] }, null, 2))}\n`);
  console.log(`${path.slice(ROOT.length + 1)}: ${kept.length} kept, ${vectors.length} written`);
}
