package org.nabu.app;

import android.content.Context;
import android.icu.util.ULocale;
import android.os.LocaleList;
import android.util.AttributeSet;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;
import android.view.inputmethod.InputMethodSubtype;
import com.getcapacitor.CapacitorWebView;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Capacitor's web view, telling the keyboard app which languages the text field in focus is
 * typed in (ADR 0143): EditorInfo#hintLocales, as a native text field's setImeHintLocales does.
 * Gboard switches to the first of them, as it does in Google Translate, so the first the learner's
 * keyboard has is put in front (KeyboardChoice). Neither Chrome nor the system WebView passes a
 * field's lang on, so the page names its languages through the KeyboardLanguage plugin when a
 * field takes focus.
 *
 * Used in place of CapacitorWebView by res/layout/capacitor_bridge_layout_main.xml.
 */
public class NabuWebView extends CapacitorWebView {

    /** The languages the page asked for last, as comma-separated BCP 47 tags ("" for none). */
    private String hinted = "";

    /** The languages the keyboard was last handed, with the editor it has now. */
    private String given = "";

    public NabuWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo outAttrs) {
        InputConnection connection = super.onCreateInputConnection(outAttrs);
        if (!hinted.isEmpty()) {
            List<String> tags = KeyboardChoice.order(Arrays.asList(hinted.split(",")), enabledLanguages(), NabuWebView::likelyScript);
            if (!tags.isEmpty()) outAttrs.hintLocales = LocaleList.forLanguageTags(String.join(",", tags));
        }
        given = hinted;
        return connection;
    }

    /**
     * Asks for these languages (BCP 47, best first) for the field in focus and every field after
     * it, until the page asks for others. The keyboard reads them when an editor starts, so one
     * already open is restarted, unless it was handed these already: a field keeps its
     * keyboard from card to card, and nothing restarts while the learner types. Call on the UI
     * thread.
     */
    public void hintLanguages(String tags) {
        if (tags.equals(hinted)) return;
        hinted = tags;
        if (tags.isEmpty() || tags.equals(given) || !hasFocus()) return;
        InputMethodManager imm = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) imm.restartInput(this);
    }

    /** The current keyboard's enabled keyboard languages, as BCP 47 tags; none if it does not list them. */
    @SuppressWarnings("deprecation")
    private List<String> enabledLanguages() {
        List<String> out = new ArrayList<>();
        InputMethodManager imm = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm == null) return out;
        for (InputMethodSubtype subtype : imm.getEnabledInputMethodSubtypeList(null, true)) {
            if (!"keyboard".equals(subtype.getMode())) continue;
            String tag = subtype.getLanguageTag();
            if (tag.isEmpty()) tag = subtype.getLocale().replace('_', '-');
            if (!tag.isEmpty()) out.add(tag);
        }
        return out;
    }

    /** A tag's likely script (CLDR's, through ICU), "" when unknown. */
    private static String likelyScript(String tag) {
        return ULocale.addLikelySubtags(ULocale.forLanguageTag(tag)).getScript();
    }
}
