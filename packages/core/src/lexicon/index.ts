/** Rules in a lexicon (docs/rules-design.md): how an orthography spells a lexical form (stage 1) and realisation (stage 2). */
export { compileSpeller, spell, spelledAs, spellingKey, type Spelled, type SpelledAlternative, type Speller } from "./spell.ts";
export { compileLanguage, mergeable, mergeFor, mergeOrder, paradigm, realise, realiseToken, type CompiledLanguage, type Realisation, type RealiseError, type RealiseOptions, type Realised, type Step, type WrittenLexeme } from "./realise.ts";
