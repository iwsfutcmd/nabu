# sitelen seli kiwen juniko

The face for Toki Pona in sitelen pona (`tok-Qaap/sitelen-pona`, ADR 0085). sitelen pona is not on
@fontsource, so the font is kept here.

- **Font:** sitelen seli kiwen juniko, version 2.3, by Rebecca Bettencourt (jan Lepeka), Kreative
  Software: handwritten logographs after those of *Toki Pona: The Language of Good*. The juniko
  version maps the UCSUR code points (U+F1900..U+F19FF) only, so Latin text never turns into
  logographs. Cartouches, long glyphs and combined glyphs are its OpenType features (calt, rlig).
- **Source:** https://github.com/kreativekorp/sitelen-seli-kiwen, commit
  1658329ae5e6a426544dc97b6221e42f43a7f0dd (2026-09-21), `sitelenselikiwenjuniko.ttf`
  (sha256 6646af72536968e791349e0f6a8407b90c4388c31a26ca974a2e6c67f82aab10).
- **Licence:** SIL Open Font License 1.1 (`OFL.txt`, from the same commit). No Reserved Font Name is
  declared, so the subset keeps the font's name.
- **Subset:** the sitelen pona block, the space and the ideographic space, the colon and ZWJ, with every layout feature, as
  WOFF2 (fontTools pyftsubset):

  ```sh
  pyftsubset sitelenselikiwenjuniko.ttf --unicodes="U+0020,U+003A,U+200D,U+3000,U+F1900-F19FF" \
    --layout-features='*' --flavor=woff2 --name-IDs='*' --name-legacy --name-languages='*' \
    --output-file=sitelen-seli-kiwen-juniko.woff2
  ```
