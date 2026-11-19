"""Prototype (2026-11-19, ADR 0150): one pattern's forms by root class, the letters a root class fixes dark.

Renders Arabic faʿala / yafʿulu and Hebrew qal by root class (sound, geminate, hollow, defective, assimilated,
I-nun) with faint slots, to show that a fixed letter (qāla's ا, ramā's ى, bānâ's ה) needs nothing extra: only
the slot letter is coloured. Writes roots-light.html and roots-dark.html beside the fonts it builds.

Usage: python root_class_forms.py <node_modules/@fontsource dir>
"""
import io
import sys
import unicodedata as u

import uharfbuzz as hb
from fontTools.colorLib.builder import buildCOLR, buildCPAL
from fontTools.ttLib import TTFont

FS = sys.argv[1]
nfc = lambda s: u.normalize("NFC", s)
T = "ـ"
FA, KA, DA, SU, SH = "َ", "ِ", "ُ", "ْ", "ّ"
QA, PA, HI, HO, DG = "ָ", "ַ", "ִ", "ֹ", "ּ"
S = lambda m="": ("S", m)
L = lambda s: ("L", s)
AR = [
    ("faʿala, sound (k‑t‑b: kataba)", [S(FA), S(FA), S(FA)]),
    ("faʿala, geminate (m‑d‑d: madda)", [S(FA), S(SH + FA)]),
    ("faʿala, hollow (q‑w‑l: qāla)", [S(FA), L("ا"), S(FA)]),
    ("faʿala, defective in y (r‑m‑y: ramā)", [S(FA), S(FA), L("ى")]),
    ("faʿala, defective in w (d‑ʿ‑w: daʿā)", [S(FA), S(FA), L("ا")]),
    ("faʿlala, four radicals (t‑r‑j‑m: tarjama)", [S(FA), S(SU), S(FA), S(FA)]),
    ("yafʿulu, sound (yaktubu)", [L("ي" + FA), S(SU), S(DA), S(DA)]),
    ("yafʿilu, assimilated (w‑ʿ‑d: yaʿidu)", [L("ي" + FA), S(KA), S(DA)]),
    ("yafʿulu, hollow in w (yaqūlu)", [L("ي" + FA), S(DA), L("و"), S(DA)]),
    ("yafʿilu, hollow in y (s‑y‑r: yasīru)", [L("ي" + FA), S(KA), L("ي"), S(DA)]),
]
HE = [
    ("qal, sound (qāṭal)", [S(QA), S(PA), S()]),
    ("qal, hollow (qām)", [S(QA), S()]),
    ("qal, III‑he (bānâ)", [S(QA), S(QA), L("ה")]),
    ("qal, geminate (sab)", [S(PA), S()]),
    ("qal imperfect, I‑nun (yippōl)", [L("י" + HI), S(DG + HO), S()]),
]
NONJOIN = set("اأإآدذرزوى")


def render(seq, slot):
    joins = not ("֐" <= slot <= "׿")
    out, prev_ch, prev_kind = "", None, None
    for i, (kind, text) in enumerate(seq):
        if joins and i > 0 and "S" in (kind, prev_kind) and prev_ch not in NONJOIN:
            out += T
        out += nfc(text if kind == "L" else slot + text)
        prev_ch, prev_kind = (text[0] if kind == "L" else slot), kind
    return out


def is_mark(font, g):
    gdef = font["GDEF"].table if "GDEF" in font else None
    return bool(gdef and gdef.GlyphClassDef and gdef.GlyphClassDef.classDefs.get(g) == 3)


SCRIPTS = [
    ("naskh", "noto-naskh-arabic/files/noto-naskh-arabic-arabic-400-normal.woff2", "ڡ", AR, "ar", "Arabic"),
    ("hserif", "noto-serif-hebrew/files/noto-serif-hebrew-hebrew-400-normal.woff2", "ס", HE, "he", "Hebrew"),
]
for key, path, slot, pats, _, _ in SCRIPTS:
    f = TTFont(f"{FS}/{path}")
    order = f.getGlyphOrder()
    buf = io.BytesIO()
    g2 = TTFont(f"{FS}/{path}")
    g2.flavor = None
    g2.save(buf)
    hbf = hb.Font(hb.Face(hb.Blob(buf.getvalue())))
    glyphs = set()
    for _, seq in pats:
        text = render(seq, slot)
        b = hb.Buffer()
        b.add_str(text)
        b.guess_segment_properties()
        hb.shape(hbf, b)
        for info in b.glyph_infos:
            g, ch = order[info.codepoint], text[info.cluster]
            if ch in (slot, T) and not is_mark(f, g) and g != ".notdef" and f["glyf"][g].numberOfContours != 0:
                glyphs.add(g)
    f["COLR"] = buildCOLR({g: [(g, 0)] for g in glyphs}, glyphMap=f.getReverseGlyphMap())
    f["CPAL"] = buildCPAL([[(0.9, 0.9, 0.9, 1.0)]])
    for rec in f["name"].names:
        if rec.nameID in (1, 4, 16):
            rec.string = f"Slots6 {key}"
        if rec.nameID == 6:
            rec.string = f"Slots6{key}"
    f.flavor = "woff2"
    f.save(f"slots6-{key}.woff2")
    print(key, sorted(glyphs))

THEMES = {"light": ((255, 255, 255), (29, 29, 27)), "dark": ((33, 31, 28), (237, 235, 229))}
mix = lambda th, p: "#%02x%02x%02x" % tuple(round(a + p * (b - a)) for a, b in zip(*THEMES[th]))
for theme in THEMES:
    faces = "".join(f"@font-face{{font-family:'Slots6 {k}';src:url(slots6-{k}.woff2)}}" for k, *_ in SCRIPTS)
    pal = "".join(f"@font-palette-values --s-{k}{{font-family:'Slots6 {k}';override-colors:0 {mix(theme, 0.06)}}}" for k, *_ in SCRIPTS)
    rows = ""
    for key, _, slot, pats, lang, label in SCRIPTS:
        rows += f'<tr><th colspan="2" class="sec">{label}</th></tr>'
        rows += "".join(
            f'<tr><th>{n}</th><td style="font-family:\'Slots6 {key}\';font-palette:--s-{key}" lang="{lang}" dir="rtl">{render(seq, slot)}</td></tr>'
            for n, seq in pats
        )
    bg, fg = ("#%02x%02x%02x" % c for c in THEMES[theme])
    css = f"""{faces}{pal}
body{{font-family:sans-serif;margin:16px;background:{bg};color:{fg}}} table{{border-collapse:collapse}}
th,td{{border:1px solid #888;padding:2px 14px;text-align:start}} th{{font-weight:normal;font-size:14px}}
th.sec{{font-weight:bold;padding-block-start:8px}} td{{font-size:46px;line-height:1.5;min-inline-size:260px}}"""
    open(f"roots-{theme}.html", "w", encoding="utf-8").write(f'<!doctype html><meta charset="utf-8"><style>{css}</style><table>{rows}</table>')
