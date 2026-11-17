package org.nabu.app;

import android.webkit.WebView;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.json.JSONException;

/**
 * The page's side of asking the keyboard for a field's language (ADR 0143): apps/web/src/native.ts
 * calls hint({languages}) as each text field takes focus, with the languages its orthography is
 * typed in, best first, and NabuWebView hands them to the keyboard app.
 */
@CapacitorPlugin(name = "KeyboardLanguage")
public class KeyboardLanguagePlugin extends Plugin {

    /** A well-formed BCP 47 tag, as far as LocaleList needs: subtags of letters and digits. */
    private static final Pattern TAG = Pattern.compile("[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*");

    @PluginMethod
    public void hint(PluginCall call) {
        JSArray languages = call.getArray("languages");
        List<String> tags = new ArrayList<>();
        try {
            if (languages != null) {
                for (Object tag : languages.toList()) {
                    if (tag instanceof String && TAG.matcher((String) tag).matches()) tags.add((String) tag);
                }
            }
        } catch (JSONException e) {
            call.reject("languages must be a list of BCP 47 tags");
            return;
        }
        String joined = String.join(",", tags);
        getActivity().runOnUiThread(() -> {
            WebView view = getBridge().getWebView();
            if (view instanceof NabuWebView) ((NabuWebView) view).hintLanguages(joined);
            call.resolve();
        });
    }
}
