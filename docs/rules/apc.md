# Rules in a lexicon: Levantine Arabic (apc) in the merge model (2026-11-28)

apc is the first course language converted to the merge model of [ADR 0158](../adr/0158-morphology-is-merging-lexemes.md),
as [ADR 0159](../adr/0159-learning-merged-lexemes.md) step 2 asks. Its tokens no longer choose a verb's, an adjective's
or a noun's values: they list the lexemes that bring them. Every lexeme here is REVIEW; the forms are Kline (2022), as the
realisation rules they replace had them (p. 95-104, 122-142, 157-166).

## The owner's rulings (2026-11-28)

1. The he-past is a zero lexeme (`perf-3ms`) that brings the perfect and he, beside -et, -o, -t.
2. The subjunctive is a zero (`sub`) beside the indicative's b- (`ind`); the person prefix requires a mood.
3. The I-prefix is one lexeme with two allomorphs: (a)- in the subjunctive, nothing after b- (`impf-1sg`).
4. Adjectives, participles and nouns that choose gender share one set of agreement endings: `fs` -e, `pl` -in, `ms` ∅.

And, from arb (the owner, 2026-11-26/27): a null lexeme stands where the language has a gap; the past's endings and the
present's prefixes bring their aspect themselves; the command is the null beside the present's prefix.

## The lexemes (lexicons/apc/lexemes.yaml)

- **The past**: one ending a person, each bringing Aspect=Perf with its person, gender and number, and choosing the
  past stem (`perf-1sg` -t, `perf-1pl` -na, `perf-2ms` -t, `perf-2fs` -te, `perf-2pl` -to, `perf-3ms` ∅, `perf-3fs`
  -et, `perf-3pl` -o). The endings that begin with a consonant choose the short stem (`perfect-short`, `perfect-ay`).
- **The present**: a person prefix bringing Aspect=Imp and choosing the present stem (`impf-1sg` a-/∅, `impf-1pl`
  n-, `impf-2` t-, `impf-3` y-, `impf-3fs` t-), its mood before it (`ind` b-, `sub` ∅), and where the prefix brings
  no number, an ending (`fs.verb` -i, `pl.verb` -o, `ms.verb` ∅).
- **The command**: `imp` ∅ (Mood=Imp, Person=2), on the command stem, with the same endings.
- **The participle**: `ptcp` ∅ (Aspect=Part), `pass` ∅ (Voice=Pass) after it, then the agreement endings.
- **Agreement**: `fs` -e (its ي doubled on a nisba: -iyye; nothing on an invariable adjective), `pl` -in (-iyyin; nothing
  on an invariable), `ms` ∅. They merge onto an adjective or a noun, or onto a verb only as its participle (`on.or`:
  a host with conditions of its own).
- **A noun's number**: `sg` ∅, `pl.noun` ∅ (its plural is its own form, wlad, or a stored one).
- **What each merges onto** says the order (ADR 0158 §2): b- needs a person, so it stands outside the prefix; -i
  and -o need the second or third person; the pronoun suffixes (`obj-*`, `poss-*`, `la-*`) and w- merge onto a
  complete word, so they stand outside the endings. The clitics state their side (`on.at`: b-, 3a-, la-, hal-, w-
  before; the pronoun suffixes after).
- **What never inflects** states that a word on it requires nothing (`requires: []`: badd, fi, fi.can, lek, lezem,
  3mol-ma3rouf, 3am, ra7.fut). Verbs and auxiliaries require a number (language.yaml `requires`); nouns, adjectives
  and pronouns require nothing yet, since some tokens stand as their lemma.

language.yaml keeps its stems (the command's take `feats: {Mood: Imp}`, so the endings shared with the present choose
them only in the command) and its rewrites, which run over the merged word. It has no `realisation` rules.

## The tokens

A token lists the lexemes it writes; one merged into its base has no `surface` (its letters are inside the base's,
as the rules spell them), and a base that writes the whole token has none either:

```yaml
{surface: بيشربوا, lexemes: [{lexeme: ind}, {lexeme: impf-3}, {lexeme: shereb, base: true}, {lexeme: pl.verb}]}
```

The compiler folds such a token into the shape every other step reads (`_fold_merged` in compiler/build.py): its
base's values are what those lexemes bring (`realises`, read from the lexicon), so bundles are as they were; the
token check realises the lexemes themselves (`Site.merged`). A paradigm's cell is realised through the lexemes
that bring it (core `mergeFor`); a cell no lexeme inflects (none writes a letter, chooses the stem or stands in a
zero beside forms it writes elsewhere) is listed only as the citation, so a noun's plural is never its singular.

## The conversion and its proof

The converter asked core's `mergeFor` which lexemes bring each value set apc's tokens chose (595 sets, all found),
rewrote 4,034 tokens, and was checked three ways:

- every one of the course's 8,162 tokens, folded as the compiler folds it, equals the token it was;
- the compiler's token check gives every token the same verdict (8,073 given by the rules, 89 by a stored form; the
  phrase 3mol ma3rouf now reports its word's form rather than the whole phrase's, still given);
- the apc bundle is byte-identical (same hash), and so is every other course's.

conformance/realise.json's 92 apc vectors list the lexemes the same way, every pinned form unchanged; only the
endings' rule steps are gone (merging a lexeme is no rule; the rewrites remain).

## Still choosing values

- The demonstratives and pronouns (hayde, ento: 68 tokens) and the phrase interjections (kell-sene, 3a-albak,
  shu-bak: 22) still choose values on their base: whether those are their own lexemes' values or a lexeme's is
  not settled.
- The dual's tokens (yom + -en: 18) choose `Number: Sing` on the base beside `dual`, which writes its own letters.
- el- states no side: the course writes it before a noun and after a preposition (3al). The rules explorer places it
  where the course writes it more often.
