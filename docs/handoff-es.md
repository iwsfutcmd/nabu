# Handoff: the Cuban Spanish course (es), continued

Start a new session on branch `ccr-8a2dbe35-qvdvi2` of `iwsfutcmd/nabu` and paste this file as the first
message, or ask: "Read docs/handoff-es.md and carry on." Delete this file once the work it lists is done.

## What Ben asked for

A Spanish course for a friend who is a native heritage speaker ("kitchen Spanish") from a Cuban family:

- an **assessment at the beginning** (placement), and
- **enough depth** that after testing out of the first ten units there is plenty left;
- **Cuban Spanish**, with the Cuban-specific aspects built in, and **audio in a Cuban voice**.

Decisions Ben made (do not re-ask):

- **Voice:** OmniVoice cloning a real Cuban speaker (not hosted TTS). Clips are CC-BY-NC-4.0.
- **Depth:** 30 units, A1 to B2.
- **Advanced units:** built around **Cuban family and culture**.
- **Placement:** typed answers; a missing accent is a note, but an accent that makes another word is wrong.

## What is done (all pushed)

| Commit theme | Where |
|---|---|
| Spanish profile; `marks.distinguishes` (an accent that spells another word of the course is WRONG_WORD); 24 conformance vectors | `profiles/es-Latn.standard.yaml`, `packages/core/src/match/grade.ts`, ADR 0076 |
| Adaptive placement: a block per unit, gallop 1, 2, 4, 8… then bisect, then node steps; `placement: {production: typed}`; unit, player and e2e tests | `packages/core/src/lesson/adaptive.ts`, `learner/placement.ts`, ADR 0077 |
| `nabu audio cast --recording` (a real speaker as the reference) | `pipeline/src/nabu/audio/{cli,course}.py` |
| The course brief and syllabus (30 units, the family, conventions) | `courses/es/README.md` |
| **Units 1–26 on the path**: 913 sentences, 640 KCs, 147 lessons, 26 stories, 8 scenarios; builds with 0 errors, 0 warnings | `courses/es/units/`, `courses/es/course.yaml` |
| The Cuban voice cast (CC0 newsreader, Radio La Voz de la Victoria, Matanzas) and the first 96 clips | `courses/es/audio/` |
| UI messages (en and five draft catalogs), bundles, simulation and e2e entries, CLAUDE.md notes | |
| Reviewer notes per unit | `courses/REVIEW.md` § es |

`pnpm lint`, `pnpm typecheck`, `pnpm test`, both conformance harnesses, the es simulation (85.7% / 88.7%),
and the e2e placement and es lesson tests passed at the time of the last full run (before units 11–26).

## What is left, in order

1. **Draft units 27–30** with two background agents, as earlier rounds did (each agent writes two units).
   Recreate the brief and the helper scripts below in your scratchpad, and give each agent the brief plus
   the round-3 notes. Its work course file lists u01…u26 (as in `course.yaml`) then its own units.
   - **u27 `u27-marti.yaml` (José Martí)** and **u28 `u28-si-pudiera.yaml` (Si pudiera)**: u27 reads
     *Versos sencillos* (1891, public domain; "Yo soy un hombre sincero", "Cultivo una rosa blanca") in its
     story with Abuela, and the vocabulary of the verses; u28 teaches *si* clauses with the imperfect
     subjunctive and the conditional (dreams: going back, bringing Marisol to Miami, a paladar). Scenario
     after u28: talking with Yunior about the future. `form:subj-past` already exists (u19, for quisiera),
     `form:subj` (u21), `form:cond` (u19).
   - **u29 `u29-quien-soy.yaml` (¿Quién soy?)** and **u30 `u30-el-brindis.yaml` (El brindis)**: u29 is
     identity and Spanglish, reported speech (*dijo que…*), and anglicisms with their Spanish (*llamar para
     atrás* → *devolver la llamada*, *aplicar* → *solicitar*, *la carpeta* → *la alfombra*, *el rufo* →
     *el techo*); u30 is Abuela's 80th birthday (she is 79 in u05) with Daniel's toast: connectors (*sin
     embargo, aunque, por lo tanto, a pesar de que*) and formal speech. Scenario after u30: giving the toast.
   - Units 21–26 introduced `sense:lo-que` (multi-word), `sense:quien`/`sense:cual` (relatives, no accent),
     `sense:se.impersonal`, `sense:mal.harm`, `sense:que.than`, `sense:como.like`, `sense:tener-que`.
2. **Merge**: `python3 es_merge.py --write` (keeps each KC's earliest definition, drops later ones from
   `kcs` and `introduces`), then set `course.yaml`'s `units:` to all thirty and build:
   `cd pipeline && uv run nabu build ../courses/es --check` must say 0 errors, 0 warnings. Where the merge
   kept a thinner gloss than a later unit had, fold the details into the kept one.
3. **Family facts** the stories added (u13, u24, u25): put them in the family table of `courses/es/README.md`
   (Marisol stayed in Cuba at 13 in 1980; Papi came as a balsero in 1994 at about 14; Abuela's father built
   her bohío; Daniel's great-grandfather cut cane in Matanzas; Pepe's '57 car stayed with a cousin).
4. **A course test** in `pipeline/tests/test_courses.py` (`TOOLS` already has `"es": []`): thirty units,
   every unit a story, the form KCs `pres-1s pret-3s impf imp-tu part cond fut subj subj-past` all used,
   `placement == {production: typed}` in the manifest, target `es-Latn-CU`.
5. **Audio**: `cd pipeline && uv run nabu audio generate ../courses/es --check` resumes where it stopped
   (96 of about 2,000 clips). On this CPU it takes about 20 s a clip (cloning puts the 7.5 s reference in
   every sequence), so the whole course is about 11 hours; run it detached
   (`nohup … > log 2>&1 &`), and commit clips as they come. A GPU does it in minutes. Then
   `uv run nabu audio report ../courses/es`. Held-back clips are mostly slang Whisper does not know
   (*¿Qué bolá?* heard as *¿Por qué volar?*); a listener decides them in the audio check
   (`#/es/es-Latn.standard/audio`, then `nabu audio verdicts`).
6. **Docs**: `courses/README.md` row (update the counts), `courses/REVIEW.md` (add u27–u30 notes from the
   agents' reports), ADR 0076's consequences if anything changed.
7. **Checks, then push**: `pnpm bundles`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm conformance`,
   `pnpm check:catalogs`, `cd packages/core && npx vitest run test/simulation.test.ts -t "es "`, and
   `cd apps/web && npx playwright test tests/e2e/lesson.spec.ts tests/e2e/progress.spec.ts --trace off`.
   Commit with the repo's conventions (conventional commits, the attribution lines) and push to
   `ccr-8a2dbe35-qvdvi2`. Do not open a PR unless Ben asks.

## Setting up a fresh container

```sh
pnpm i
apt-get install -y libicu-dev pkg-config espeak-ng ffmpeg
cd pipeline && uv sync --all-groups          # includes speech (Whisper) and omnivoice
# The OmniVoice base model, pinned in course.yaml, downloads on first use (k2-fsa/OmniVoice@c5fdb5cc…).
```

Notes from this session:

- Agents' private work files are `courses/es/.work-<unit>.yaml`; never commit them.
- The audio generator rewrites `courses/es/audio/index.yaml` every 16 clips; commit index and clips
  together, never one without the other.
- An Agent launch can fail with "the auto mode classifier gave no verdict": that is a transient
  permission-check timeout, not content filtering. Retry once, one agent at a time.

## The drafting brief (give it to each agent)

````markdown
# Brief: drafting units of the Cuban Spanish (es) course in Nabu

You are drafting course units for **Nabu**, an open-source language-learning app (repo at
/home/user/nabu). The course is Cuban Spanish for **heritage speakers**: people raised in
Cuban-American families who understand a lot and speak "kitchen Spanish" but never studied it.
The person this is for is a man from a Cuban family in the US. Thirty units, A1 to B2.

## Read first

1. `/home/user/nabu/courses/es/README.md`: the course brief, the recurring family, the conventions,
   the syllabus table (find your units' rows), the scenario table, and "Writing a unit".
2. `/home/user/nabu/courses/es/units/u01-que-bola.yaml`: the model unit. Copy its style exactly
   (flow-style KCs and nodes, block-style sentences, story, scenario).
3. In `/home/user/nabu/CLAUDE.md`, the "Phase 2 notes", "Persons notes" and "Morphology notes".
4. The KCs already defined: `python3 <scratchpad>/es_kcs.py`
   (add `--grep <text>` to search). Never define an id that already exists.

## Rules

- **Language.** Natural Cuban Spanish as a Cuban family in Miami (and in Havana) speaks it; the
  canonical form (the `text`, and the first alternative of `reverse`) is the Cuban one. Accept
  pan-Hispanic alternatives in `reverse` (guagua: `(guagua|autobús|bus)`), optional subject
  pronouns (`[Yo] tengo…`), and non-inverted Cuban questions alongside inverted ones
  (`(Qué tú quieres|Qué quieres [tú])`). Correct accents everywhere: they are graded.
- **Heritage focus.** Real family situations, the culture (food, music, sayings, history), and
  KC `notes` that point out what a heritage speaker needs: Cuban vs. other varieties, how a word
  is said vs. written (*para* is often *pa'*), accent pairs, false friends and anglicisms.
- **KCs.** Follow the README conventions: `sense:<lemma>` with accents, verbs by infinitive,
  verb forms as `form:` on the token (only form KCs already defined or that your units define, see
  below), names as KCs, contractions `al`/`del` as their own words, a multi-word expression as one
  KC whose tokens all name it (sparingly). Gloss every KC in English; short.
- **i+1 is 2 here**: in path order, each sentence may use at most two KCs that no earlier sentence
  (in any unit) used. Order sentences within a node so they build up. Every KC a node introduces
  must be used by some sentence; a sentence may only use KCs introduced by its node or an earlier
  one.
- **Size per unit:** 5–6 lesson nodes plus the story node last; 30–36 sentences (about 5–7 per
  lesson); 18–30 new KCs. Sentences get longer and richer from unit 11 on, but keep them to what
  a learner can type (mostly under 12 words).
- **Every sentence:** `reverse` (Spanish accept set) and `translations.en` (English accept set).
  English "you" may be tú, usted or ustedes: accept all that fit unless `register: formal` or
  `persons` narrows it. Use `persons: {speaker: m}` on first-person sentences with gendered words
  (the learner is a man), and `addressee` where Spanish marks the listener's gender or number.
  `register: colloquial` for slang, `formal` for usted.
- **Accept sets** never produce the same string twice after normalization (punctuation and case
  dropped): no punctuation-only variants; the displayed form is the first alternative of the
  first line, not a line repeated by a later pattern.
- **Story:** one per unit on its `es.uNN.story` node, 10–16 lines with the family as characters
  (`characters:` ids and names), two or three `choose` questions, one or two `ask: arrange`
  lines, one or two `ask: complete` lines (gap = the KC of exactly one word token in the line;
  two distractors that are taught KCs). Story lines use only KCs taught up to and including your
  unit. `translations.en` on a story line is a single string.
- **Scenario:** add one if the README's scenario table lists one after your unit (`after:` one of
  your lesson nodes).
- **YAML:** quote flow values that contain `?`, `: `, `#`, `[`, `]`, `{`, `}`; quote any accept set
  starting with `[`; use `|-` for multi-line accept sets. Check with
  `python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" <file>` before building.
  Write `'no'`, `'y'`, `'Y'`, `'No'` quoted (YAML 1.1 booleans). No invisible characters.

## Building

Other agents are writing other units at the same time, so never edit `courses/es/course.yaml`,
`README.md` or any unit that is not yours. Instead make a private course file **directly in
`courses/es/`** (image paths resolve from there), named `.work-<your first unit>.yaml`, a copy of
`course.yaml` whose `units:` lists the units you were told are done, then yours, in order. Build:

    cd /home/user/nabu/pipeline && uv run nabu build ../courses/es/.work-uNN.yaml --check

Iterate until it reports **0 errors and 0 warnings**. Delete your `.work-*.yaml` when you finish.
Do not run git commands (the orchestrator commits), `pnpm bundles`, or anything that writes
outside `courses/es/units/` (and your work file).

## Report

When done, reply with: the files you wrote; per unit, the counts (lessons, sentences, KCs,
story lines); the form KCs you defined; any common word you had to define that another unit's
theme might also define (e.g. `sense:casa`); and a short list of points a native Cuban reviewer
should check first (things you were unsure of: a word, a usage, an accept set).

## Shared ids (round 1: units 2–10 are drafted at the same time)

Units drafted at the same time cannot see each other's KCs, so these common words have fixed ids.
If you need one and it is not yet defined by a unit you can see (`es_kcs.py`), define it **in your
own unit with exactly this id, gloss and forms** (and introduce it in one of your nodes). The
orchestrator keeps the earliest unit's definition and drops the others, so nothing else changes.

| id | gloss (en) | forms |
|---|---|---|
| `sense:el` | the | [el] (tokens el, la, los, las) |
| `sense:un` | a; an; some | [un] (un, una, unos, unas) |
| `sense:en` | in; on; at | [en] |
| `sense:con` | with | [con] |
| `sense:a` | to; at | [a] |
| `sense:para` | for; to, in order to | [para] (note: often said pa') |
| `sense:que` | that; which; who | [que] |
| `sense:qué` | what; how (¡qué…!) | [qué] |
| `sense:dónde` | where | [dónde] |
| `sense:pero` | but | [pero] |
| `sense:hoy` | today | [hoy] |
| `sense:aquí` | here | [aquí] |
| `sense:mucho` | a lot; much; many | [mucho] (mucho, mucha, muchos, muchas) |
| `sense:poco` | little; a little, a bit (un poco) | [poco] |
| `sense:grande` | big; large | [grande] |
| `sense:bueno` | good | [bueno] |
| `sense:por-favor` | please | [por favor] (two tokens, both `por-favor`) |
| `sense:hay` | there is; there are | [hay] |
| `sense:tener` | to have; tener … años: to be … years old | [tener] |
| `sense:ir` | to go | [ir] |
| `sense:querer` | to want; to love | [querer] |
| `sense:gustar` | to like (me gusta: I like) | [gustar] |
| `sense:hacer` | to do; to make | [hacer] |
| `sense:comer` | to eat | [comer] |
| `sense:hablar` | to speak; to talk | [hablar] |
| `sense:café` | coffee | [café] |
| `sense:casa` | house; home | [casa] |
| `sense:nosotros` | we | [nosotros] (nosotras for women) |
| `sense:ellos` | they | [ellos] (ellas for women) |
| `sense:ustedes` | you (plural) | [ustedes] |
| `sense:su` | his; her; its; their; your (usted, ustedes) | [su] (su, sus) |
| `sense:tu` | your (tú) | [tu] (tu, tus) |
| `sense:este` | this | [este] (este, esta, estos, estas) |
| `sense:mami` | mom; mommy (what Cubans call their mother at any age) | [mami] |
| `sense:papi` | dad; daddy (Cuban, at any age) | [papi] |
| `sense:abuelo` | grandfather; grandpa | [abuelo] |
| `sense:hermano` | brother (hermana: sister) | [hermano] |
| `sense:tío` | uncle (tía: aunt) | [tío] |
| `sense:primo` | cousin | [primo] |
| `sense:lili` | Lili (a name) | [Lili] |
| `sense:pepe` | Pepe (a name) | [Pepe] |
| `sense:marisol` | Marisol (a name) | [Marisol] |
| `sense:yunior` | Yunior (a name) | [Yunior] |
| `sense:ofelia` | Ofelia (a name) | [Ofelia] |
| `sense:habana` | Havana (La Habana) | [Habana] (with sense:el for La) |
| `form:pres-1p` | present tense: we (nosotros) | — |
| `form:pres-3p` | present tense: they, you all (ellos, ustedes) | — |

Form KCs defined by a given unit (others may not use them before that unit): `form:pres-1p` and
`form:pres-3p` in u02 (shared above, so any unit may define them); `form:ger` in u07;
`form:pret-1s`, `form:pret-2s`, `form:pret-3s`, `form:pret-1p`, `form:pret-3p` in u09.

## Shared form ids (rounds 2 and 3)

Units drafted at the same time cannot see each other's KCs. The tenses and moods below are
taught by the unit named, but any later unit drafted at the same time may need them. If you need
one and no unit you can see defines it yet, define it **in your own unit with exactly this id and
gloss** and introduce it in one of your nodes; the orchestrator keeps the earliest definition.

| id | gloss (en) | taught in |
|---|---|---|
| `form:impf` | imperfect: was …ing, used to (hablaba, comía, era, iba) | u12 |
| `form:imp-tu` | command, tú (¡habla!, ¡come!, ¡ven!) | u14 |
| `form:imp-ud` | command, usted or ustedes (¡hable!, ¡coman!) | u14 |
| `form:imp-neg` | negative command (¡no hables!, ¡no coma!) | u14 |
| `form:part` | past participle (hablado, comido, hecho; he hablado) | u17 |
| `form:cond` | conditional: would (hablaría, podría) | u19 |
| `form:fut` | future: will (hablará, será) | u20 |
| `form:subj` | present subjunctive (que hable, que coma) | u21 |
| `form:subj-past` | imperfect subjunctive (si hablara, si tuviera) | u27 / u28 |

A form KC must not be used before the unit that teaches it unless your own unit defines it and
practises it on purpose (e.g. u18 at the doctor's uses usted commands from u14).
````

### Round 3 notes (also give these; they override the brief's round-1 "Shared ids" section)

````markdown
This is **round 3** of drafting: units u01–u20 are done and on the course path (`courses/es/course.yaml`
lists them). Use `es_kcs.py --upto 20` to see every KC they define; build on them freely: everything from
greetings to the trip (u01–u10), then accents, the imperfect, preterite vs imperfect, commands,
spelling, music, the present perfect, health, the conditional and the future (u11–u20), with
their form KCs (`form:impf`, `form:imp-tu`, `form:imp-ud`, `form:imp-neg`, `form:part`,
`form:cond`, `form:fut`). In this round the "Shared ids" table of the brief no longer applies (those words exist
now); instead follow the "Shared form ids" table appended at the end of the brief. Units u21–u30 are
being drafted at the same time by other agents: u21 Abuela's advice (present subjunctive), u22 a
video call to Havana (subjunctive of feeling and doubt), u23 refranes and por/para, u24 the
family's history of exile (past perfect), u25 Havana (relative clauses), u26 the countryside (the
passive), u27 José Martí, u28 si clauses (imperfect subjunctive), u29 identity and Spanglish
(reported speech), u30 the toast (connectors, formal speech). Stay within your themes; if you need a common word no unit up to u20 defines, define it in
your unit (the orchestrator drops later duplicates, keeping the earliest).

These are the last units of the course (B1–B2), where a heritage speaker does most of their work: sentences are longer and
richer than in the first units (mostly 7–14 words), the stories longer (14–18 lines), and the KC notes
should point out what a heritage speaker gets wrong (written accents, spelling, register,
anglicisms) and what is Cuban. Your work course file lists u01…u20 (in order, as in course.yaml)
followed by your units.
````

## Helper scripts (save in your scratchpad)

`es_kcs.py`: lists the KCs the units define (`--upto NN`, `--grep text`).

```python
"""List the KCs the es course's units define, in path order: `python3 es_kcs.py [--upto NN] [--grep text]`.
Prints `uNN  id  gloss  [forms]`. Form KCs and names included."""
import glob, os, re, sys
import yaml
root = "/home/user/nabu/courses/es/units"
upto = 99
pat = None
args = sys.argv[1:]
if "--upto" in args: upto = int(args[args.index("--upto") + 1])
if "--grep" in args: pat = args[args.index("--grep") + 1].lower()
for path in sorted(glob.glob(os.path.join(root, "u*.yaml"))):
    n = int(re.match(r"u(\d+)", os.path.basename(path)).group(1))
    if n > upto: continue
    unit = yaml.safe_load(open(path, encoding="utf-8"))
    for kc in unit.get("kcs", []):
        gloss = (kc.get("gloss") or {}).get("en", "")
        forms = ", ".join((kc.get("forms") or {}).get("es-Latn/standard", []))
        line = f"u{n:02d}  {kc['id']}  {gloss}" + (f"  [{forms}]" if forms else "")
        if pat is None or pat in line.lower(): print(line)
```

`es_merge.py`: after a round, drops KCs a later unit defines again (dry run without `--write`).

```python
"""Drop KCs a later es unit defines again: the earliest unit's definition wins (round-parallel drafting).
Textual edits keep each file's layout. Usage: python3 es_merge.py [--write]"""
import glob, os, re, sys
import yaml
root = "/home/user/nabu/courses/es/units"
write = "--write" in sys.argv
paths = sorted(glob.glob(os.path.join(root, "u*.yaml")))
first = {}
changes = 0
for path in paths:
    text = open(path, encoding="utf-8").read()
    unit = yaml.safe_load(text)
    dup = []
    for kc in unit.get("kcs", []):
        kid = kc["id"]
        if kid in first:
            prev_path, prev = first[kid]
            g1, g2 = (prev.get("gloss") or {}).get("en"), (kc.get("gloss") or {}).get("en")
            f1, f2 = prev.get("forms"), kc.get("forms")
            flag = "" if (g1 == g2 and f1 == f2) else f"   (differs: {g1!r} {f1} vs {g2!r} {f2})"
            print(f"{os.path.basename(path)}: drop {kid}, defined in {os.path.basename(prev_path)}{flag}")
            dup.append(kid)
        else:
            first[kid] = (path, kc)
    if not dup:
        continue
    lines = text.split("\n")
    out = []
    for line in lines:
        m = re.match(r"^- \{id: '?([^',]+)'?,", line)
        if m and m.group(1) in dup and "gloss" in line:
            changes += 1
            continue
        if line.startswith("- {id: es.") and "introduces:" in line:
            for kid in dup:
                line2 = re.sub(r"'%s'(, )?" % re.escape(kid), "", line)
                line2 = line2.replace(", ]", "]")
                if line2 != line:
                    changes += 1
                line = line2
            if "introduces: []" in line:
                print(f"  ! {os.path.basename(path)}: a node is left with nothing to introduce: {line[:80]}")
        out.append(line)
    new = "\n".join(out)
    yaml.safe_load(new)
    if write:
        open(path, "w", encoding="utf-8").write(new)
print(f"{changes} edits" + ("" if write else " (dry run; --write to apply)"))
```
