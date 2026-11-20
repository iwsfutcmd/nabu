"""Write docs/lexical-forms/apc.yaml (a worked entry for every KC of courses/apc) and
docs/lexical-forms/apc-review.md (what the course pins that the projections do not give back).

Run from pipeline/, which has PyYAML:
    uv run --frozen python ../docs/prototypes/apc-lexical-forms/build.py
"""

from __future__ import annotations

import collections
import re
from pathlib import Path
from typing import Any

import yaml

import lexform as lf
from check import compare, shape_of
from course import COURSE, ROOT, Course, load, nfc, unmark
from derive import Draft, draft

HERE = Path(__file__).resolve().parent
OUT = ROOT / "docs" / "lexical-forms"
SPECIAL = {lf.E_SIGN, lf.O_SIGN, lf.SILENT}


def q(text: str) -> str:
    """A YAML double-quoted string, the three signs a reader may not see written as escapes."""
    out = []
    for ch in text:
        if ch in SPECIAL:
            out.append(f"\\u{ord(ch):04x}")
        elif ch in '"\\':
            out.append("\\" + ch)
        else:
            out.append(ch)
    return '"' + "".join(out) + '"'


def flow(d: dict[str, Any]) -> str:
    parts = []
    for k, v in d.items():
        if isinstance(v, dict):
            parts.append(f"{k}: {flow(v)}")
        elif isinstance(v, (list, tuple)):
            parts.append(f"{k}: [" + ", ".join(q(str(x)) for x in v) + "]")
        elif isinstance(v, bool):
            parts.append(f"{k}: {'true' if v else 'false'}")
        else:
            parts.append(f"{k}: {q(str(v))}")
    return "{" + ", ".join(parts) + "}"


# --- verbs and participles ------------------------------------------------------------------------

WEAK = (lf.WAW, lf.YA)


def root_class(radicals: list[str]) -> str:
    """A verb's root class, from its radicals alone (ADR 0145: derived, never stored)."""
    if len(radicals) == 4:
        return "four radicals"
    r1, r2, r3 = radicals
    if r2 == r3:
        return "doubled"
    if r3 in WEAK or r3 in lf.HAMZAS:
        return "defective"
    if r2 in WEAK:
        return "hollow"
    if r1 in lf.HAMZAS:
        return "hamza-initial"
    if r1 == lf.WAW:
        return "w-initial"
    return "sound"


# The feminine ending is -a after these and -e elsewhere (Kline, p. 16: ر ع ق ص ض ط ظ; his own
# words add ح غ ء: REVIEW).
FEMININE_A_AFTER = set("\u0631\u0639\u0642\u0635\u0636\u0637\u0638\u062d\u063a\u0621\u0623")


def from_template(template: str, radicals: list[str], back: set[str]) -> str:
    """A pattern's template filled with a verb's radicals: digits are radicals; A the pattern's
    long a (said e unless the radical before it is a back consonant); i a short i; . no vowel;
    E the feminine ending; in the plural ending; y the hollow verb's ya; I the defective -e."""
    out = ""
    before = ""
    for k, ch in enumerate(template):
        if ch.isdigit():
            before = radicals[int(ch) - 1]
            out += before
        elif ch == "A":
            out += (lf.FATHA if before in back else lf.E_SIGN) + lf.ALEF
        elif ch == "y":
            before = lf.YA
            out += lf.YA
        elif ch == "i":
            if template[k + 1 : k + 2] == "n":
                out += lf.KASRA + lf.YA
            else:
                out += lf.KASRA
        elif ch == ".":
            out += lf.SUKUN
        elif ch == "E":
            out += (lf.FATHA if before in FEMININE_A_AFTER else lf.E_SIGN) + lf.TA_MARBUTA
        elif ch == "n":
            out += "\u0646"
        elif ch == "I":
            out += lf.KASRA + lf.YA
    return nfc(out)


# --- the entries ----------------------------------------------------------------------------------


def projections(form: str) -> dict[str, Any]:
    words = form.split()
    spelt = [""]
    for w in words:
        spelt = [a + (" " if a else "") + b for a in spelt for b in lf.to_arabizi(w)[:6]][:6]
    return {
        "arabic": " ".join(lf.to_arabic(w) for w in words),
        "marked": " ".join(lf.to_marked(w) for w in words),
        "arabizi": spelt[:4],
        "phonemes": " ".join("".join(lf.to_phonemes(w)) for w in words),
    }


def classify(problem: str, notes: tuple[str, ...]) -> str:
    """Why a pinned spelling does not come back, in the review list's headings."""
    text = problem + " | " + " | ".join(notes)
    if "Arabizi not read" in text:
        return "loan"
    if "helping vowel" in text:
        return "helper"
    if "doubled in Arabizi" in text or "doubled in the marks" in text:
        return "doubled"
    if "written, not said" in text:
        return "silent"
    if "diphthong" in text or re.search("pinned .*\u064e[\u064a\u0648](?![\u0652\u064e\u0650\u064f\u0651])", problem) and "\u064e\u064a\u0652" in problem + "\u064e\u0648\u0652":
        return "glide"
    if "vowel:" in text:
        return "vowel"
    return "other"


# The letters the article's lam is lost in (Kline, p. 8: Standard Arabic's sun letters, and jim).
SUN = "\u062a\u062b\u062c\u062f\u0630\u0631\u0632\u0633\u0634\u0635\u0636\u0637\u0638\u0644\u0646"
ARTICLE_KEPT = re.compile(lf.ALEF + lf.SILENT + "\u0644" + lf.SUKUN + "([" + SUN + "])")

def mispaired(arabic: str, arabizi: str) -> bool:
    """Whether the Arabizi is plainly another word: fewer than half of the Arabic's consonants
    have their letter in it. Then the reader (course.py) paired the wrong tokens."""
    latin = arabizi.lower()
    # Not the letters Arabizi may leave out or that are also vowels: waw, ya, h, hamza, qaf.
    cons = [c for c in unmark(arabic) if c in lf.CONSONANTS and c not in (lf.WAW, lf.YA, lf.HA, "\u0642") and c not in lf.HAMZAS]
    if len(cons) < 2:
        return False
    found = sum(1 for c in cons if any(s and s[0] in latin for s in lf.CONSONANTS[c]))
    return found * 2 < len(cons)


HEADINGS = {
    "reader": "Not paired by the prototype's reader",
    "none": "No lexical form",
    "sun": "The article before a sun letter, with the letter not doubled",
    "loan": "The Arabizi is not this word's sounds in Arabizi's letters",
    "vowel": "The marks and the Arabizi give different vowels",
    "helper": "The marks write a vowel the Arabizi leaves out, between a word's last two consonants",
    "doubled": "Doubled in one script and not in the other",
    "silent": "A letter is written and the Arabizi does not say it",
    "glide": "ay and aw: the marks and the Arabizi differ, or the glide has no sukun",
    "other": "The marks do not follow the convention the other words follow",
}
WHY = {
    "reader": "Not a finding about the course: in these sentences the two scripts order or split their words differently (a phrase that is one KC), and the reader took the wrong Arabizi token for the Arabic word. They are counted among the words that do not come back.",
    "none": "The Arabic and the Arabizi could not be read as one word, letter by letter.",
    "sun": "These come back, since the form was drafted from the marks: but the marks have no shadda on a sun letter after the article, where other words of the course have one (\u0627\u0644\u0633\u064e\u0651\u0644\u0627\u0645\u0650\u0629, \u0627\u0644\u062c\u0651\u0627\u0645\u0652\u0639\u064e\u0629). Kline counts jim a sun letter in Lebanese (p. 8).",
    "loan": "A loan kept in its French or English spelling (merci, football, taxi), or two different forms of a word in the two scripts (the teens: Arabic with -ar, Arabizi without). No correspondence gives the spelling; it has to be listed with the word, or the Arabizi changed.",
    "vowel": "One of the two is wrong, or the word is said both ways. The drafted form follows the Arabizi where it has a vowel and the marks where it has none.",
    "helper": "A helping vowel (\u062e\u0650\u0628\u0650\u0632 khebz): the drafted form leaves it out, as the Arabizi does, and the projection writes none. Kline writes shames but wa2t, and kalb beside kalib (the notes, \u00a71.4): no rule. The voices were given these marks, so they said the vowel.",
    "doubled": "A doubled letter tells words apart (mara, a woman; marra, once), so the projection writes it twice and takes nothing else. Here the marks have a shadda and the Arabizi one letter (bas, nos), or the Arabizi doubles a letter the marks leave single (a loan's spelling: dollar). Some are one spelling for two words: the course's vocalization gives \u0645\u0631\u0629, a woman, the shadda of once.",
    "silent": "Arabizi writes the word as it is said, Arabic as it is built (3enna, written with its d).",
    "glide": "The course writes a diphthong's glide with a sukun in some words (\u0639\u064e\u064a\u0652\u0644\u0650\u0629) and without in others (\u0647\u064e\u064a\u062f\u0627); and the marks write ay where the Arabizi has a long e (7zeiran).",
    "other": "Each differs from what the projection writes in its own way: the difference is on the line.",
}


def main() -> None:
    course = load()
    authored = yaml.safe_load((HERE / "authored.yaml").read_text(encoding="utf-8"))
    verbs = {v["id"]: v for v in authored["verbs"]}
    parts = {p["id"]: p for p in authored["participles"]}
    templates = authored["templates"]["active-participle"]
    back = set(templates["back"])

    # Every distinct word of the sentences and stories, drafted and projected back.
    drafts: dict[tuple[str, str | None, str], tuple[Draft, list[str], str]] = {}
    choices: collections.Counter[str] = collections.Counter()
    by_sense: dict[str, list[tuple[str, str, str, Draft]]] = collections.defaultdict(list)
    morph_shapes: dict[str, collections.Counter[tuple[str, str]]] = collections.defaultdict(collections.Counter)
    for w in course.words:
        for (kc, a), (_, l) in zip(w.morphs, w.latin_morphs, strict=False):
            if kc.startswith("form:") or kc in ("sense:el", "sense:w", "sense:b", "sense:3a", "sense:hal"):
                morph_shapes[kc][(unmark(a), l)] += 1
        key = (w.arabic, w.marked, w.arabizi)
        if key not in drafts:
            articles, starts = shape_of(w)
            d = draft(w.arabic, w.marked, w.arabizi, articles, starts)
            pinned_marks = w.marked if w.marked else (w.arabic if unmark(w.arabic) != w.arabic else None)
            problems = compare(d.form, w.arabic, pinned_marks, w.arabizi) if d.form else []
            drafts[key] = (d, problems, w.item)
            for c in d.choices:
                choices[c] += 1
        if w.sense:
            d = drafts[key][0]
            tag = (w.form or "").replace("form:", "")
            extra = "+".join(k.replace("form:", "").replace("sense:", "") for k, _ in w.morphs if k != f"sense:{w.sense}")
            entry = (tag + ("+" + extra if extra else ""), w.arabic, w.arabizi, d)
            if entry[:3] not in [e[:3] for e in by_sense[w.sense]]:
                by_sense[w.sense].append(entry)

    out: list[str] = []
    out.append("# Worked entries for every KC of courses/apc, in apc's lexical form (docs/lexical-forms/apc.md).")
    out.append("# Written by docs/prototypes/apc-lexical-forms/build.py from the course, the drafting step")
    out.append("# (derive.py) and authored.yaml: do not edit by hand. Every entry is a draft for review.")
    out.append("#   form     the lexical form: Arabic script, every vowel written. U+065C is e, U+065D is o,")
    out.append("#            U+06DF marks a letter written and not said; they are written here as escapes.")
    out.append("#   gives    what the four projections make of it: the course's Arabic, the vowel-marked text")
    out.append("#            the voices read, Arabizi (the default spelling first), phonemes.")
    out.append("#   course   what courses/apc pins for the same word.")
    out.append("#   review   what of `course` does not come back from `form`, and why.")
    out.append("language: apc")
    out.append("variety: apc-LB (Beirut)")
    out.append("license: CC-BY-SA-4.0")
    out.append("provenance: {author: 'llm:claude@fable-5.2', status: draft}")
    out.append("lexemes:")

    review: dict[str, list[str]] = collections.defaultdict(list)
    counts: collections.Counter[str] = collections.Counter()
    verb_lines: list[str] = []
    for kc_id, kc in course.kcs.items():
        if not kc_id.startswith("sense:"):
            continue
        counts["lexemes"] += 1
        forms = kc.get("forms", {})
        arab = [nfc(x) for x in forms.get("apc-Arab/standard", [])]
        latn = list(forms.get("apc-Latn/arabizi", []))
        out.append(f"- id: {q(kc_id)}")
        out.append(f"  unit: {q(course.unit_of[kc_id])}")
        out.append(f"  pos: {kc.get('pos', '?')}")
        out.append(f"  gloss: {q(kc.get('gloss', {}).get('en', ''))}")
        verb = verbs.get(kc_id)
        part = parts.get(kc_id)
        if verb is not None:
            radicals = verb["radicals"]
            cls = root_class(radicals)
            past = draft(verb["past"][0], None, verb["past"][1])
            present = draft(verb["present"][0], None, verb["present"][1])
            out.append("  verb:")
            out.append(f"    form: {verb['form']}")
            out.append("    radicals: [" + ", ".join(radicals) + "]")
            out.append(f"    class: {cls}  # from the radicals")
            if verb.get("vowels"):
                out.append("    vowels: " + flow(verb["vowels"]))
            out.append(f"    past: {flow({'form': past.form or '?', 'arabizi': verb['past'][1]})}")
            out.append(f"    present: {flow({'form': present.form or '?', 'arabizi': verb['present'][1]})}")
            out.append(f"    source: {q(verb['source'])}")
            if verb.get("note"):
                out.append(f"    note: {q(verb['note'])}")
            counts["verbs"] += 1
            if verb["source"] == "inferred":
                verb_lines.append(f"- `{kc_id}` {verb['past'][1]} / {verb['present'][1]}: {verb.get('note', 'Kline does not list it.')}")
            if past.form is None or present.form is None:
                verb_lines.append(f"- `{kc_id}`: a citation form could not be drafted ({past.why} {present.why})")
        if part is not None:
            out.append("  participle:")
            out.append(f"    head: {part['head']}")
            of = part.get("of")
            base = verbs.get(of) if isinstance(of, str) else of
            if isinstance(of, str):
                out.append(f"    of: {q(of)}")
            elif of:
                out.append(f"    of: {flow({'form': of['form'], 'radicals': of['radicals'], 'past': of['past'][1], 'present': of['present'][1]})}")
            out.append(f"    note: {q(part['note'])}")
            if base is not None and base["form"] == "I" and part["head"] == "participle":
                cls = root_class(base["radicals"])
                tpl = templates["I"].get(cls)
                if tpl is not None:
                    made = {k: from_template(tpl[k], base["radicals"], back) for k in ("masculine", "feminine", "plural")}
                    out.append("    by the template: " + flow(made))
                    # Compare with what the course writes for it.
                    want = {"": "masculine", "fem": "feminine", "pl": "plural"}
                    for tag, a, l, d in by_sense.get(kc_id[6:], []):
                        which = want.get(tag)
                        if which is None or (part.get("forms") and unmark(a) not in part["forms"] and tag == ""):
                            continue
                        if d.form is not None and d.form != made[which]:
                            verb_lines.append(f"- `{kc_id}` {which}: the template gives {made[which]} ({lf.to_arabizi(made[which])[0]}), the course writes {a} / {l}, drafted {d.form}")
                        elif d.form is not None:
                            counts["participle forms the template gives"] += 1
        # The forms the KC lists.
        out.append("  forms:")
        for n in range(max(len(arab), len(latn))):
            a = arab[n] if n < len(arab) else ""
            l = latn[n] if n < len(latn) else ""
            counts["KC forms"] += 1
            if not a or not l:
                out.append(f"  - {flow({'course': {'arabic': a, 'arabizi': l}, 'review': ['one script only: ' + (kc.get('notes', {}).get('en', '') or 'no note')]})}")
                counts["KC forms in one script"] += 1
                continue
            marked = course.marks_of(a)
            d = draft(a, marked, l)
            for c in d.choices:
                choices["(word list) " + c] += 0  # counted once, from the sentences
            if d.form is None:
                out.append(f"  - {flow({'course': {'arabic': a, 'marked': marked or '', 'arabizi': l}, 'review': [d.why]})}")
                review["none"].append(f"`{kc_id}` {a} / {l}: {d.why}")
                counts["KC forms with no lexical form"] += 1
                continue
            problems = compare(d.form, a, marked, l)
            entry: dict[str, Any] = {"form": d.form, "gives": projections(d.form), "course": {"arabic": a, "marked": marked or "", "arabizi": l}}
            if problems or d.notes:
                entry["review"] = list(d.notes) + problems
            out.append("  - form: " + q(d.form))
            out.append("    gives: " + flow(entry["gives"]))
            out.append("    course: " + flow(entry["course"]))
            if "review" in entry:
                out.append("    review: [" + ", ".join(q(x) for x in entry["review"]) + "]")
            if problems:
                counts["KC forms that do not come back"] += 1
            else:
                counts["KC forms that come back"] += 1
        # A verb's other forms in the sentences: pinned until the conjugation is written.
        if verb is not None:
            rest = [(tag, a, l, d) for tag, a, l, d in by_sense.get(kc_id[6:], []) if tag]
            if rest:
                out.append("  pinned:  # the forms its sentences write; the rules that would give them are not written")
                for tag, a, l, d in rest:
                    out.append("  - " + flow({"features": tag, "form": d.form or "?", "arabic": a, "arabizi": l}))
                    counts["pinned verb forms"] += 1

    # Affixes and clitics: the shapes the sentences write for each.
    out.append("# The course's form KCs and clitics, with every shape its sentences write for each (Arabic,")
    out.append("# Arabizi, how many words). These are allomorphs to be given lexical forms and conditions when")
    out.append("# the rules are written; a suffix's form begins with its vowel, on a tatweel (docs/lexical-forms/apc.md).")
    out.append("morphemes:")
    for kc_id in course.kcs:
        if kc_id.startswith("sense:") and kc_id not in ("sense:el", "sense:w", "sense:b", "sense:3a", "sense:hal"):
            continue
        if kc_id.startswith("grapheme:"):
            continue
        shapes = morph_shapes.get(kc_id)
        out.append(f"- id: {q(kc_id)}")
        out.append(f"  gloss: {q(course.kcs[kc_id].get('gloss', {}).get('en', ''))}")
        if shapes:
            out.append("  shapes: [" + ", ".join(flow({"arabic": a, "arabizi": l, "words": str(n)}) for (a, l), n in shapes.most_common()) + "]")
        else:
            out.append("  shapes: []  # a feature a word carries with no letters of its own, or a pattern")
        counts["morphemes"] += 1
    (OUT / "apc.yaml").write_text("\n".join(out) + "\n", encoding="utf-8")
    yaml.safe_load((OUT / "apc.yaml").read_text(encoding="utf-8"))

    # --- the review list ---------------------------------------------------------------------
    total = len(drafts)
    came_back = 0
    marked_ok: set[str] = set()
    for (a, marked, l), (d, problems, item) in drafts.items():
        if mispaired(a, l):
            review["reader"].append(f"{a} / {l} ({item})")
            continue
        if d.form is None:
            review["none"].append(f"{a} / {l} ({item}): {d.why}")
            continue
        sun = ARTICLE_KEPT.search(d.form)
        if sun and (marked or unmark(a) != a):
            review["sun"].append(f"{marked or a} / {l} ({item}): no shadda on {sun.group(1)}")
        if not problems:
            came_back += 1
            if marked:
                marked_ok.add(marked)
            elif unmark(a) != a:
                marked_ok.add(a)
            else:
                marked_ok.add(a)
            continue
        if not any(p.startswith("marks:") for p in problems):
            marked_ok.add(marked or a)
        kind = classify(" ; ".join(problems), d.notes)
        note = ("; ".join(d.notes) + ": ") if d.notes else ""
        review[kind].append(f"{a} / {l} ({item}): {note}" + "; ".join(problems))

    # The reviewed clips: what each voice was given, word by word.
    index = yaml.safe_load((COURSE / "audio" / "index.yaml").read_text(encoding="utf-8"))
    reviewed = [c for c in index["clips"] if c.get("provenance", {}).get("status") == "reviewed" or c.get("qa", {}).get("status") == "reviewed"]
    all_marked = {nfc(m or a) for (a, m, _l) in drafts}
    clip_ok = clip_bad = clip_unknown = 0
    bad_clips: list[str] = []
    for c in reviewed:
        text = nfc(c.get("synthesis", {}).get("input", ""))
        words = [w for w in re.split("[\\s\u060c\u061f.!?\u061b:,]+", text) if w]
        missing = [w for w in words if w not in all_marked]
        wrong = [w for w in words if w in all_marked and w not in marked_ok]
        if missing:
            clip_unknown += 1
            bad_clips.append(f"`{c['item']}`: {text}: not a word of the sentences as the compiler marks them: {', '.join(missing)}")
        elif wrong:
            clip_bad += 1
            bad_clips.append(f"`{c['item']}`: {text}: the projection writes other marks for {', '.join(wrong)}")
        else:
            clip_ok += 1

    md: list[str] = []
    md.append("# apc: what the course pins that the projections do not give back")
    md.append("")
    md.append("Written by `docs/prototypes/apc-lexical-forms/build.py`; do not edit by hand. The schema is in")
    md.append("[apc.md](apc.md), the entries in [apc.yaml](apc.yaml).")
    md.append("")
    md.append("This is the review list Task B asks for. Nothing in `courses/apc` was changed to make it shorter.")
    md.append("Each line is a word as the course writes it (Arabic / Arabizi), where it first stands, and what does")
    md.append("not come back when its drafted lexical form is projected. A line is a question for a reader of")
    md.append("Lebanese, not a verdict: the course may be right and the convention wrong.")
    md.append("")
    md.append("## In numbers")
    md.append("")
    md.append(f"- **{total}** distinct words in the sentences and stories (Arabic, its marks and its Arabizi together).")
    md.append(f"- **{came_back}** come back exactly in all three: the Arabic spelling, the vowel marks, and the Arabizi among the spellings the correspondences give.")
    md.append(f"- **{total - came_back - len([1 for (d, p, i) in drafts.values() if d.form is None])}** have a lexical form and do not come back in one of the three.")
    md.append(f"- **{len([1 for (d, p, i) in drafts.values() if d.form is None])}** have no lexical form.")
    md.append(f"- **{counts['lexemes']}** sense KCs with **{counts['KC forms']}** listed forms: {counts['KC forms that come back']} come back, {counts['KC forms that do not come back']} do not, {counts['KC forms with no lexical form']} have no form, {counts['KC forms in one script']} are written in one script only.")
    md.append(f"- **{counts['verbs']}** verbs with radicals, a Form and citation forms; {counts['pinned verb forms']} of their forms in the sentences are pinned, since no conjugation rule is written yet.")
    md.append(f"- **{len(reviewed)}** clips a listener marked right: for {clip_ok} the projection writes the very marks the voice was given; for {clip_bad} it writes other marks for a word; {clip_unknown} were given text the sentences no longer hold.")
    md.append("")
    n = 0
    for kind, title in HEADINGS.items():
        lines = review.get(kind, [])
        if not lines:
            continue
        n += 1
        md.append(f"## {n}. {title} ({len(lines)})")
        md.append("")
        md.append(WHY[kind])
        md.append("")
        md.extend(f"- {line}" for line in lines)
        md.append("")
    n += 1
    md.append(f"## {n}. Verbs and participles ({len(verb_lines)})")
    md.append("")
    md.append("A citation form the course does not write and Kline does not list, or a participle the template makes otherwise.")
    md.append("")
    md.extend(verb_lines or ["- none"])
    md.append("")
    n += 1
    md.append(f"## {n}. The reviewed clips whose marks the projection does not write ({len(bad_clips)})")
    md.append("")
    md.append("A reviewed clip depends on the exact text its voice was given (the handoff's Task C). These would be read")
    md.append("from other marks if the projection replaced the course's vocalization as it stands.")
    md.append("")
    md.extend(f"- {line}" for line in bad_clips or ["none"])
    md.append("")
    n += 1
    md.append(f"## {n}. How the course's Arabizi spells what is left free")
    md.append("")
    md.append("Not a list of faults: each row is a correspondence with more than one spelling, and how often the")
    md.append("course's sentences use each (distinct words). The projection writes the commoner one first.")
    md.append("")
    md.append("| What | Spelling | Words |")
    md.append("|---|---|---|")
    table: dict[str, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    for c, k in choices.items():
        if c.startswith("(word list)") or ": " not in c:
            continue
        what, spelling = c.rsplit(": ", 1)
        table[what][spelling] += k
    for what in sorted(table):
        for spelling, k in table[what].most_common():
            md.append(f"| {what} | {spelling} | {k} |")
    md.append("")
    # The three signs a font may not show are written as their escapes, here as in the data.
    text = "".join(f"{chr(92)}u{ord(ch):04x}" if ch in SPECIAL else ch for ch in "\n".join(md))
    (OUT / "apc-review.md").write_text(text + "\n", encoding="utf-8")
    print({**counts, "words": total, "come back": came_back, "clips reviewed": len(reviewed), "clips ok": clip_ok, "clips other marks": clip_bad, "clips unknown": clip_unknown})
    print({k: len(v) for k, v in review.items()})


if __name__ == "__main__":
    main()
