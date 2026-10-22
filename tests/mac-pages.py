"""Check the deployed Mac pages and the resources their HTML can request."""
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

site = Path(sys.argv[1])
expected = {'index.html', '_headers', 'install', 'og.png', 'licenses',
            'mac', 'mac/index.html', 'mac/activate', 'mac/activate/index.html',
            'media', 'media/papermac', 'terms', 'terms/index.html', 'privacy', 'privacy/index.html'}
expected.update('licenses/' + name for name in
                ['OFL-monasans.txt', 'OFL-jetbrainsmono.txt', 'LOGOS-SOURCE.txt', 'FONTS.txt'])
expected.update('media/papermac/' + name + suffix
                for name in ['strip', 'overview', 'pro-layout'] for suffix in ['.mp4', '.jpg'])
assert {str(path.relative_to(site)) for path in site.rglob('*')} == expected


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.tags = []
        self.feed(text)

    def handle_starttag(self, tag, attributes):
        self.tags.append((tag, dict(attributes)))


for route in ['index.html', 'mac/index.html', 'mac/activate/index.html', 'terms/index.html', 'privacy/index.html']:
    text = (site / route).read_text()
    page = Page(text)
    assert not re.search(r'(?:PAP|PAPER)-\d+', text), route
    for tag, attributes in page.tags:
        assert not (tag == 'script' and 'src' in attributes), route
        resources = [attributes[key] for key in ('src', 'poster') if key in attributes]
        if tag == 'link' and attributes.get('rel') in ('stylesheet', 'icon', 'preload', 'prefetch'):
            resources.append(attributes['href'])
        for resource in resources:
            parsed = urlsplit(resource)
            assert parsed.scheme in ('', 'data') and not parsed.netloc, (route, resource)
            if parsed.scheme != 'data':
                target = site / parsed.path.lstrip('/') if parsed.path.startswith('/') else site / Path(route).parent / parsed.path
                assert target.resolve().is_relative_to(site.resolve()), (route, resource)
                assert target.is_file(), (route, resource)
    for resource in re.findall(r'url\([\s\"\']*([^\)\"\']+)', text):
        assert resource.startswith('data:'), (route, resource[:60])
    assert not any(tag == 'form' for tag, attributes in page.tags), route

product = (site / 'mac/index.html').read_text()
assert 'A scrolling window manager for macOS that sets your windows side by side on a Strip running past the edges of the screen.' in product
assert 'Free forever' not in product
assert '#activate=' not in product
assert 'Your license covers PaperMac Pro 27 on macOS 27 Golden Gate.' in product
assert 'Your edition never expires.' in product
assert 'optional discounted upgrades' in product
assert 'brew tap getpapersh/tap &amp;&amp; brew install --cask papermac' in product
assert 'up to 5 Macs at once' in product
assert not any(phrase in product.lower() for phrase in ['lifetime support', 'every update', 'support for pro 27 ends', 'to be published', 'supported for the life'])
videos = [attributes for tag, attributes in Page(product).tags if tag == 'video']
assert len(videos) == 3
for video in videos:
    assert all(key in video for key in ('controls', 'muted', 'playsinline', 'loop', 'poster'))
    assert 'autoplay' not in video
sources = [attributes['src'] for tag, attributes in Page(product).tags if tag == 'source']
assert set(sources) == {'../media/papermac/' + name + '.mp4' for name in ['strip', 'overview', 'pro-layout']}
assert 'QR code for the PaperMac Pro checkout' in product
assert '{{CHECKOUT_' not in product
checkout = (Path(__file__).resolve().parents[1] / 'src/mac/checkout-url.txt').read_text().strip()
buy_links = [attrs['href'] for tag, attrs in Page(product).tags if tag == 'a' and 'btn pro' in attrs.get('class', '')]
assert buy_links == [checkout] * 3
assert 'Not included in Free or Pro.' in product
for route in ['terms', 'privacy']:
    assert any(tag == 'a' and attrs.get('href') == '/' + route for tag, attrs in Page(product).tags)
    assert 'Coming before sales open' in (site / route / 'index.html').read_text()
main = (site / 'index.html').read_text()
assert 'href="/mac/">Mac</a>' in main and 'href="/mac/">PaperMac</a>' in main

activation_text = (site / 'mac/activate/index.html').read_text()
assert 'Then open PaperMac › Settings › License and paste.' in activation_text
activation = Page(activation_text)
assert [attributes['href'] for tag, attributes in activation.tags if tag == 'a'] == ['papermac://license']
meta = {attributes.get('name'): attributes.get('content') for tag, attributes in activation.tags if tag == 'meta'}
assert 'noindex' in meta['robots'].split(', ')
assert meta['referrer'] == 'no-referrer'
rules = {}
route = None
for line in (site / '_headers').read_text().splitlines():
    if not line.strip() or line.lstrip().startswith('#'):
        continue
    if not line.startswith(' '):
        route = line.strip()
        rules[route] = {}
    else:
        key, value = line.strip().split(':', 1)
        rules[route][key.lower()] = value.strip()
for route in ['/mac/activate/', '/mac/activate/*']:
    assert rules[route]['referrer-policy'] == 'no-referrer'
    assert rules[route]['cache-control'] == 'no-store'
print('PASS: exact site inventory, local resources, recording controls, Mac links and activation link/header policy')
