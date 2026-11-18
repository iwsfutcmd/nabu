package org.nabu.app;

import static org.junit.Assert.assertEquals;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import org.junit.Test;

/** Which language a field hands the keyboard first (ADR 0143): the first hint the keyboard has. */
public class KeyboardChoiceTest {

    /** Likely scripts, as ICU gives them on the device, for the tags these tests use. */
    private static final Map<String, String> SCRIPTS = Map.ofEntries(
        Map.entry("chg", "Arab"),
        Map.entry("fa", "Arab"),
        Map.entry("fa-IR", "Arab"),
        Map.entry("ar", "Arab"),
        Map.entry("en", "Latn"),
        Map.entry("en-US", "Latn"),
        Map.entry("es-ES", "Latn"),
        Map.entry("tok", "Latn"),
        Map.entry("yue-Latn-jyutping", "Latn"),
        Map.entry("yue-HK", "Hant"),
        Map.entry("zh-Hant-HK", "Hant"),
        Map.entry("zh-HK", "Hant"),
        Map.entry("zh-CN", "Hans")
    );

    private static final Function<String, String> SCRIPT = (tag) -> SCRIPTS.getOrDefault(tag, "");

    private static List<String> order(List<String> hinted, String... enabled) {
        return KeyboardChoice.order(hinted, Arrays.asList(enabled), SCRIPT);
    }

    @Test
    public void chaghatayFallsBackToPersian() {
        List<String> chg = Arrays.asList("chg", "fa", "und-Arab");
        assertEquals(Arrays.asList("fa-IR", "chg", "fa"), order(chg, "en-US", "fa-IR"));
        // No Persian: any Arabic-script keyboard.
        assertEquals(Arrays.asList("ar", "chg", "fa"), order(chg, "en-US", "ar"));
    }

    @Test
    public void aLatinOrthographyTakesTheAlphabetFirst() {
        List<String> tok = Arrays.asList("tok", "und-Latn", "en");
        assertEquals(Arrays.asList("zz", "tok", "en"), order(tok, "en-US", "zz", "fa"));
        // No Alphabet: the first Latin keyboard the learner has.
        assertEquals(Arrays.asList("es-ES", "tok", "zz", "en"), order(tok, "fa", "es-ES", "en-US"));
    }

    @Test
    public void aLanguageMatchesOnlyInItsScript() {
        // Jyutping is Latin: never the Hong Kong Chinese keyboard.
        List<String> jyutping = Arrays.asList("yue-Latn-jyutping", "und-Latn", "en");
        assertEquals(Arrays.asList("en-US", "yue-Latn-jyutping", "zz", "en"), order(jyutping, "zh-HK", "en-US"));
        // Traditional Chinese is never the Simplified keyboard.
        List<String> cantonese = Arrays.asList("yue-HK", "zh-Hant-HK", "und-Hant");
        assertEquals(Arrays.asList("zh-HK", "yue-HK", "zh-Hant-HK"), order(cantonese, "zh-CN", "zh-HK"));
        assertEquals(Arrays.asList("yue-HK", "zh-Hant-HK"), order(cantonese, "zh-CN", "en-US"));
    }

    @Test
    public void aKeyboardThatListsNoLanguagesGetsTheHintsAsTheyAre() {
        assertEquals(Arrays.asList("chg", "fa"), order(Arrays.asList("chg", "fa", "und-Arab")));
        assertEquals(Arrays.asList("tok", "zz", "en"), order(Arrays.asList("tok", "und-Latn", "en")));
    }
}
