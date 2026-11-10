"""Verify approved asset bytes, served brand contracts, palette contrast and page bundles."""
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
site = Path(sys.argv[1]).resolve()
checks = 0


def check(condition, detail):
    global checks
    assert condition, detail
    checks += 1


for line in (root / 'src/brand/SHA256SUMS').read_text().splitlines():
    digest, name = line.split()
    check(hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name)
    product = Path(name).parts[2]
    served = site / 'brand' / product / Path(name).name
    if served.is_file():
        check(hashlib.sha256(served.read_bytes()).hexdigest() == digest, served)
check(not list((root / 'src/brand').rglob('*.b64')), 'Base64 transport must not ship')
check(not (root / 'src/brand/_staging').exists(), 'Staging must not ship')
for product in ['papermac', 'paperland']:
    for suffix in ['icon.svg']:
        name = f'{product}-{suffix}'
        check((site / 'brand' / product / name).read_bytes() ==
              (root / 'src/brand' / product / 'masters' / name).read_bytes(), name)
check((site / 'brand/papermac/papermac-icon-180.png').read_bytes() ==
      (root / 'src/brand/papermac/exports/papermac-icon-180.png').read_bytes(), 'Apple-touch source')

routes = {'index.html': 'v7-1-viewfinder', 'mac/index.html': 'mac',
          'mac/activate/index.html': 'mac-activate', 'privacy/index.html': 'privacy',
          'terms/index.html': 'terms'}
for route, source in routes.items():
    page = (site / route).read_text()
    check(not re.search(r'Paperland|Paper Land|Papermac|Paper Mac', page), (route, 'Product spelling'))
    check('sizes="32x32" href="/brand/papermac/papermac-icon-32.png"' in page, (route, '32px favicon'))
    check('sizes="180x180" href="/brand/papermac/papermac-icon-180.png"' in page, (route, 'Apple-touch'))
    og = 'og.png' if source == 'v7-1-viewfinder' else 'mac/og.png'
    check(f'property="og:image" content="https://getpaper.sh/{og}"' in page, (route, 'OG image'))
    check(struct.unpack('>II', (site / og).read_bytes()[16:24]) == (1200, 630), og)
    # Old decorative logo WebPs are forbidden; real app screenshots have descriptive alt text.
    for tag in re.findall(r'<(?:img|link)\b[^>]+>', page):
        if 'data:image/webp' in tag:
            check('alt=""' not in tag and '<link' not in tag, (route, 'Old standalone P logo'))
    check(not re.search(r'<svg\b[^>]*class="[^"]*(?:brand|logo)', page), (route, 'Inline brand SVG'))
    styles = '\n'.join(re.findall(r'<style>(.*?)</style>', page, re.S))
    check(not re.search(r'#(?:e2470f|b53a0a|ff7a45|ff8a5c|c2410c|d5430e|ffb020)\b', styles, re.I), (route, 'Retired orange UI state'))
    check(not re.search(r'(?<![-\w])color:\s*var\(--(?:brand-accent|hi|k-accent)\)', styles), (route, 'Accent text must use accentText'))
    check('outline: 2px solid var(--brand-focus); outline-offset: 2px;' in styles, (route, 'Focus ring'))
    built = subprocess.check_output(['uvx', '--with', 'segno', '--from', 'fonttools', 'python',
                                     str(root / 'scripts/bundle-page.py'), str(root / 'src' / source / 'index.html')])
    check(built == (site / route).read_bytes() == (root / route).read_bytes(), (route, 'Fresh page bundle'))
check('/brand/papermac/papermac-icon.svg' in (site / 'index.html').read_text() and
      '/brand/paperland/paperland-icon.svg' in (site / 'index.html').read_text(), 'Both family marks')


def luminance(color):
    rgb = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in rgb]
    return sum(x * weight for x, weight in zip(linear, [.2126, .7152, .0722]))


def contrast(a, b):
    light, dark = sorted([luminance(a), luminance(b)], reverse=True)
    return (light + .05) / (dark + .05)


palette = json.loads((root / 'src/brand/papermac/palette-paper-blue.json').read_text())
check(palette == json.loads((root / 'src/brand/paperland/palette-paper-blue.json').read_text()), 'Identical product palettes')
css = (root / 'src/_kit/brand.css').read_text()
ratios = []
for theme in ['light', 'dark']:
    tokens = {key: value['$value'] for key, value in palette[theme].items()}
    for key, value in tokens.items():
        check(f'--brand-{key}: {value};' in css, (theme, key, 'Approved token'))
    pairs = [(text, bg, 4.5) for text in ['ink', 'ink2', 'ink3', 'accentText', 'success', 'warning', 'error']
             for bg in ['paper', 'surface', 'raised']]
    pairs += [('onAccent', 'accent', 4.5)]
    # Hairline border tokens are decorative. Essential control boundaries use ink3 or accent.
    pairs += [(edge, bg, 3) for edge in ['ink3', 'focus', 'accent'] for bg in ['paper', 'surface', 'raised']]
    for fg, bg, minimum in pairs:
        ratio = contrast(tokens[fg], tokens[bg])
        check(ratio >= minimum, (theme, fg, bg, ratio, minimum))
        ratios.append(f'{theme} {fg}/{bg} {ratio:.2f}:1')
print('\n'.join(ratios))
print(f'PASS: {checks} brand assertions; {len(ratios)} contrast pairs; five deterministic page bundles')
