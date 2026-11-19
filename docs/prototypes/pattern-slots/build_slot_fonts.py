"""Prototype (2026-11-19, ADRs 0150 and 0151): build pattern-slot colour fonts and a demo page.

For each script, copies a pinned @fontsource font, finds every glyph its slot letter (and the tatweel) shapes
to by shaping sample patterns with HarfBuzz, and adds COLRv0 + CPAL painting only those glyphs in one
palette colour; marks keep the text colour. Writes slots-<script>.woff2 and an index.html with a fade
slider and both themes. See README.md beside this file for inputs, how to run it, and what the real build
(ADR 0151) must add.

Usage: python build_slot_fonts.py <node_modules/@fontsource dir> <out dir>
"""
import io
import os
import sys
import unicodedata as u

import uharfbuzz as hb
from fontTools.colorLib.builder import buildCOLR, buildCPAL
from fontTools.ttLib import TTFont

FS, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
nfc = lambda s: u.normalize("NFC", s)
T, C, TIE = "ـ", "◌", "͜"
FA, KA, DA, SU, SH = "َ", "ِ", "ُ", "ْ", "ّ"
QA, PA, HI, TS, DG, SV = "ָ", "ַ", "ִ", "ֵ", "ּ", "ְ"
S = lambda m="": ("S", m)
L = lambda s: ("L", s)
SCRIPTS = [
    ("arabic", "Arabic", "noto-naskh-arabic/files/noto-naskh-arabic-arabic-400-normal.woff2", "ڡ", "ar", [
        ("mafʿal", [L("م" + FA), S(SU), S(FA), S()]),
        ("fāʿil", [S(FA), L("ا"), S(KA), S()]),
        ("faʿʿala", [S(FA), S(SH + FA), S(FA)]),
        ("iftaʿala", [L("ا" + KA), S(SU), L("ت" + FA), S(FA), S(FA)]),
        ("istafʿala", [L("ا" + KA), L("س" + SU), L("ت" + FA), S(SU), S(FA), S(FA)]),
        ("faʿala, hollow", [S(FA), L("ا"), S(FA)]),
        ("faʿala, defective", [S(FA), S(FA), L("ى")]),
    ]),
    ("hebrew", "Hebrew", "noto-serif-hebrew/files/noto-serif-hebrew-hebrew-400-normal.woff2", "ס", "he", [
        ("qal", [S(QA), S(PA), S()]),
        ("piʿel", [S(HI), S(DG + TS), S()]),
        ("hifʿil", [L("ה" + HI), S(SV), S(HI), L("י"), S()]),
        ("hitpaʿel", [L("ה" + HI), L("ת" + SV), S(PA), S(DG + TS), S()]),
        ("qal, III‑he", [S(QA), S(QA), L("ה")]),
    ]),
    ("syriac", "Syriac (Serto)", "noto-sans-syriac-western/files/noto-sans-syriac-western-syriac-400-normal.woff2", "ܩ", "syr", [
        ("peʿal", [S(), S("ܰ"), S()]),
        ("paʿʿel", [S("ܰ"), S("ܶ"), S()]),
        ("ethpeʿel", [L("ܐܶ"), L("ܬ"), S(), S("ܶ"), S()]),
    ]),
]
LATIN = ("latin", "Latin (Arabizi, SBL)", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", C, "und-Latn", [
    ("mafʿal (Arabizi)", "ma◌◌a◌"),
    ("faʿʿal (Arabizi)", "◌a◌" + TIE + "◌a◌"),
    ("piʿel (SBL)", "◌i◌" + TIE + "◌ē◌"),
    ("hifʿil (SBL)", "hi◌◌î◌"),
])
NONJOIN = set("اأإآدذرزوى" + "ܐܕܗܘܙܨܪܬܖ")


def render(seq, slot):
    joins = not ("֐" <= slot <= "׿")
    out, prev_ch, prev_kind = "", None, None
    for i, (kind, text) in enumerate(seq):
        if joins and i > 0 and "S" in (kind, prev_kind) and prev_ch not in NONJOIN:
            out += T
        out += nfc(text if kind == "L" else slot + text)
        prev_ch, prev_kind = (text[0] if kind == "L" else slot), kind
    return out


def build(key, path, slot, texts):
    f = TTFont(path)
    order = f.getGlyphOrder()
    buf = io.BytesIO()
    g2 = TTFont(path)
    g2.flavor = None
    g2.save(buf)
    hbf = hb.Font(hb.Face(hb.Blob(buf.getvalue())))
    gdef = f["GDEF"].table if "GDEF" in f else None
    # marks by their own character too: not every font's GDEF classes every mark (DejaVu's tie)
    cmap_marks = {g for cp, g in f.getBestCmap().items() if u.category(chr(cp)).startswith("M")}
    glyphs = set()
    for text in texts:
        b = hb.Buffer()
        b.add_str(text)
        b.guess_segment_properties()
        hb.shape(hbf, b)
        for info in b.glyph_infos:
            g, ch = order[info.codepoint], text[info.cluster]
            mark = bool(gdef and gdef.GlyphClassDef and gdef.GlyphClassDef.classDefs.get(g) == 3)
            if ch in (slot, T) and not mark and g not in cmap_marks and g != ".notdef" and f["glyf"][g].numberOfContours != 0:
                glyphs.add(g)
    f["COLR"] = buildCOLR({g: [(g, 0)] for g in glyphs}, glyphMap=f.getReverseGlyphMap())
    f["CPAL"] = buildCPAL([[(0xF0 / 255, 0xF0 / 255, 0xF0 / 255, 1.0)]])  # 6% on white, if palettes are unsupported
    for rec in f["name"].names:
        if rec.nameID in (1, 4, 16):
            rec.string = f"Nabu Slots {key}"
        if rec.nameID == 6:
            rec.string = f"NabuSlots{key}"
    f.flavor = "woff2"
    f.save(f"{OUT}/slots-{key}.woff2")
    print(key, sorted(glyphs))


for key, _, path, slot, _, pats in SCRIPTS:
    build(key, f"{FS}/{path}", slot, [render(seq, slot) for _, seq in pats])
build("latin", LATIN[2], C, [t for _, t in LATIN[5]])

KEYS = [s[0] for s in SCRIPTS] + ["latin"]
faces = "\n".join(f"@font-face {{ font-family: 'Nabu Slots {k}'; src: url('slots-{k}.woff2') format('woff2'); }}" for k in KEYS)


def panel(theme):
    groups = ""
    for key, label, _, slot, lang, pats in SCRIPTS:
        items = "".join(
            f'<li><span class="shape" lang="{lang}" dir="rtl" style="font-family:\'Nabu Slots {key}\';font-palette:--live-{theme}-{key}" role="img" aria-label="{n}">{render(seq, slot)}</span><span class="name">{n}</span></li>'
            for n, seq in pats
        )
        groups += f'<section><h3>{label}</h3><ul>{items}</ul></section>'
    items = "".join(
        f'<li><span class="shape" lang="und-Latn" style="font-family:\'Nabu Slots latin\';font-palette:--live-{theme}-latin" role="img" aria-label="{n}">{t}</span><span class="name">{n}</span></li>'
        for n, t in LATIN[5]
    )
    groups += f'<section><h3>{LATIN[1]}</h3><ul class="latin">{items}</ul></section>'
    return f'<div class="panel {theme}"><h2>{theme.capitalize()} theme</h2>{groups}</div>'


html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pattern Slot Fade</title>
<style>
:root {{
  /* page chrome; the two panels carry Nabu's own light and dark surface and text tokens */
  --bg: #f4f3f0; --ink: #1d1d1b; --muted: #5f5d58; --rule: #d8d6d0; --accent: #2f5d8a;
  --font-body: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif;
  /* layout: one control bar, then the light and dark themes side by side, stacking on phones */
  color-scheme: light;
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{ --bg: #171614; --ink: #edebe5; --muted: #a9a59c; --rule: #3a3833; --accent: #8fb6dd; color-scheme: dark; }}
}}
:root[data-theme="dark"] {{ --bg: #171614; --ink: #edebe5; --muted: #a9a59c; --rule: #3a3833; --accent: #8fb6dd; color-scheme: dark; }}
{faces}
html, body {{ margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font-body); }}
main {{ max-inline-size: 1100px; margin-inline: auto; padding: 24px 16px 40px; display: grid; gap: 20px; }}
h1 {{ font-size: 1.5rem; margin: 0; text-wrap: balance; }}
p.lede {{ margin: 0; color: var(--muted); max-inline-size: 65ch; line-height: 1.5; }}
.controls {{ display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; padding: 12px 16px; border: 1px solid var(--rule); border-radius: 8px; }}
.controls label {{ font-weight: 600; }}
.controls input[type=range] {{ inline-size: min(420px, 100%); accent-color: var(--accent); }}
.controls output {{ font-variant-numeric: tabular-nums; min-inline-size: 4ch; font-weight: 600; }}
.controls button {{ font: inherit; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--rule); background: transparent; color: var(--ink); cursor: pointer; }}
.controls button:focus-visible, .controls input:focus-visible {{ outline: 2px solid var(--accent); outline-offset: 2px; }}
.panels {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; }}
.panel {{ border-radius: 8px; padding: 12px 16px 16px; display: grid; gap: 12px; }}
.panel.light {{ background: #ffffff; color: #1d1d1b; }}
.panel.dark {{ background: #211f1c; color: #edebe5; }}
.panel h2 {{ font-size: 1rem; margin: 0; }}
.panel h3 {{ font-size: 0.8rem; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.7; }}
.panel ul {{ list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 4px 12px; }}
.panel li {{ display: grid; gap: 2px; justify-items: start; }}
.shape {{ font-size: 2.4rem; line-height: 1.6; }}
.name {{ font-size: 0.8rem; opacity: 0.75; }}
.panel ul.latin {{ grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }}
.latin .shape {{ font-size: 1.9rem; }}
</style>
<style id="live"></style>
</head>
<body>
<main>
  <h1>Pattern slot fade</h1>
  <p class="lede">Root-and-pattern shapes as Nabu would show them: the pattern's own letters and vowels at full strength, each root slot a placeholder letter faded towards the background. Drag to set how far the slots fade; 6% is the chosen default.</p>
  <div class="controls">
    <label for="fade">Slot strength</label>
    <input id="fade" type="range" min="0" max="50" step="1" value="6" aria-describedby="fade-value">
    <output id="fade-value" for="fade">6%</output>
    <button id="reset" type="button">Back to 6%</button>
  </div>
  <div class="panels">{panel("light")}{panel("dark")}</div>
</main>
<script>
const KEYS = {KEYS!r};
const THEMES = {{ light: [[255,255,255],[29,29,27]], dark: [[33,31,28],[237,235,229]] }};
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
function apply(p) {{
  let css = '';
  for (const [theme, [bg, ink]] of Object.entries(THEMES)) {{
    const c = hex(bg.map((b, i) => b + (p / 100) * (ink[i] - b)));
    for (const k of KEYS) css += `@font-palette-values --live-${{theme}}-${{k}} {{ font-family: 'Nabu Slots ${{k}}'; override-colors: 0 ${{c}}; }}\\n`;
  }}
  document.getElementById('live').textContent = css;
  document.getElementById('fade-value').textContent = p + '%';
}}
const slider = document.getElementById('fade');
slider.addEventListener('input', () => apply(Number(slider.value)));
document.getElementById('reset').addEventListener('click', () => {{ slider.value = 6; apply(6); }});
apply(6);
</script>
</body>
</html>
"""
open(f"{OUT}/index.html", "w", encoding="utf-8").write(html)
print("wrote", OUT)
