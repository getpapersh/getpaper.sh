"""Bundles the landing page into the one self-contained index.html this repo serves.

Usage (fontTools is the only dependency; uvx runs it without a global install):
  uvx --from fonttools python scripts/bundle-page.py \
    /path/to/paper-landing-concepts/v7-1-viewfinder/index.html > index.html

Inlines the page's _kit stylesheets and scripts and its fonts, each font subset with
pyftsubset to printable ASCII, Latin-1, common punctuation and every other character the
page's HTML, CSS and JS contain (the page renders most of its copy from script).

"Mona" is a Reserved Font Name in Mona Sans's OFL, and a subset is a Modified Version
(OFL-FAQ 2.6), so the subset is renamed "Paper Sans", in its name table and in the page's
CSS. Its copyright, RFN declaration and licence records stay as they are. JetBrains Mono
reserves no name and keeps its own.
"""
import base64, io, pathlib, re, sys
from fontTools import subset
from fontTools.ttLib import TTFont

page = pathlib.Path(sys.argv[1]).resolve()
html = page.read_text()
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: "<style>\n" + (page.parent / m.group(1)).read_text() + "</style>", html)
html = re.sub(r'<script src="([^"]+)"></script>', lambda m: "<script>\n" + (page.parent / m.group(1)).read_text() + "</script>", html)

# Font URLs are relative to the stylesheet that names them, which is always in _kit/.
kit = page.parent.parent / "_kit"
text = re.sub(r'url\("\.\./fonts/[^"]+"\)', "", html)
unicodes = {*range(0x20, 0x7F), *range(0xA0, 0x100), *range(0x2010, 0x2028), *(ord(c) for c in text if ord(c) > 0x7E)}
RENAME = {"Mona Sans": "Paper Sans", "MonaSans": "PaperSans"}
FAMILY_IDS = {1, 3, 4, 6, 16, 17, 21, 22, 25}  # names; never 0 (copyright, RFN) or 13/14 (licence)


def font_url(m):
    source = (kit / m.group(1)).resolve()
    out = io.BytesIO()
    # pyftsubset's default features plus tnum, which the page's tabular-nums needs. Glyph names
    # stay: without them Chrome on macOS anti-aliases small text differently.
    options = subset.Options(name_IDs=["*"], name_languages=["*"], glyph_names=True)
    options.layout_features.append("tnum")
    font = TTFont(source, recalcTimestamp=False)  # a rebuild of the same sources is byte-identical
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    if source.name == "MonaSans.ttf":
        for record in font["name"].names:
            if record.nameID in FAMILY_IDS:
                name = str(record)
                for old, new in RENAME.items():
                    name = name.replace(old, new)
                record.string = name
        assert not any("Mona" in str(r) for r in font["name"].names if r.nameID in FAMILY_IDS)
    font.save(out)
    return 'url("data:font/ttf;base64,' + base64.b64encode(out.getvalue()).decode() + '")'


html = re.sub(r'url\("(\.\./fonts/[^"]+)"\)', font_url, html)
html = html.replace('"Mona Sans"', '"Paper Sans"')
sys.stdout.write(html)
