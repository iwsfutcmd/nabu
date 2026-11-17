package org.nabu.app;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;

/**
 * Which language a text field hands the keyboard app first (ADR 0143). The page names the field's
 * languages best first (@nabu/i18n keyboardLanguages: chg, fa, und-Arab for Chaghatay); Gboard acts
 * on the first hint alone, so the first one the learner's keyboard has is put in front, as the
 * keyboard's own tag. Chaghatay thus falls back to Persian, and a Latin orthography to Gboard's
 * Alphabet. Pure Java, so that it is tested off the device.
 */
final class KeyboardChoice {

    /** Android's tag for a keyboard of no language: LatinIME's, and Gboard's, Alphabet. */
    static final String NO_LANGUAGE = "zz";

    private KeyboardChoice() {}

    /**
     * The hints as the keyboard gets them. {@code hinted}: the page's BCP 47 tags, best first, where
     * und-X is any keyboard of the script X. {@code enabled}: the current keyboard's enabled languages
     * (none if it does not say). {@code scriptOf}: a tag's likely script, "" when unknown. The first
     * hint the keyboard has comes first, as the enabled tag that has it; the rest follow in their
     * order, und-Latn as {@link #NO_LANGUAGE} and every other und- tag left out, since no keyboard
     * is tagged with them.
     */
    static List<String> order(List<String> hinted, List<String> enabled, Function<String, String> scriptOf) {
        List<String> out = new ArrayList<>();
        for (String hint : hinted) {
            String chosen = pick(hint, enabled, scriptOf);
            if (chosen != null) {
                out.add(chosen);
                break;
            }
        }
        for (String hint : hinted) {
            Locale h = Locale.forLanguageTag(hint);
            String tag = !h.getLanguage().isEmpty() ? hint : "Latn".equals(h.getScript()) ? NO_LANGUAGE : null;
            if (tag != null && !out.contains(tag)) out.add(tag);
        }
        return out;
    }

    /**
     * The enabled tag that has the hinted language, or null. A language matches with its script (zh-Hant
     * is never zh-CN's Simplified keyboard); und-X takes any keyboard of the script X, the Alphabet
     * first for Latin.
     */
    static String pick(String hint, List<String> enabled, Function<String, String> scriptOf) {
        Locale h = Locale.forLanguageTag(hint);
        if (h.getLanguage().isEmpty()) {
            String script = h.getScript();
            if (script.isEmpty()) return null;
            if (script.equals("Latn")) {
                for (String tag : enabled) if (NO_LANGUAGE.equals(Locale.forLanguageTag(tag).getLanguage())) return tag;
            }
            for (String tag : enabled) {
                if (!NO_LANGUAGE.equals(Locale.forLanguageTag(tag).getLanguage()) && script.equals(scriptOf.apply(tag))) return tag;
            }
            return null;
        }
        String hintScript = scriptOf.apply(hint);
        for (String tag : enabled) {
            if (!h.getLanguage().equals(Locale.forLanguageTag(tag).getLanguage())) continue;
            String script = scriptOf.apply(tag);
            if (hintScript.isEmpty() || script.isEmpty() || hintScript.equals(script)) return tag;
        }
        return null;
    }
}
