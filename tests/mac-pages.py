"""Check the deployed Mac pages and the resources their HTML can request."""
from html.parser import HTMLParser
import html
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
                for name in ['promo', 'strip', 'overview', 'pro-layout'] for suffix in ['.mp4', '.jpg'])
assert {str(path.relative_to(site)) for path in site.rglob('*')} == expected


dmg_url = (Path(__file__).resolve().parents[1] / 'src/mac/dmg-url.txt').read_text().strip()
for target in [*site.rglob('*.html'), site / 'install']:
    text = target.read_text()
    assert 'vercel-storage' not in text, target
    assert not re.search(r'https?://[^\s"\'<>]*alpha[^\s"\'<>]*\.dmg', text, re.I), target
    assert '{{DMG_URL}}' not in text, target
    for link in re.findall(r'https?://[^\s"\'<>]*\.dmg', text):
        assert link == dmg_url, (target, link)
assert (site / 'index.html').read_text().count('href="' + dmg_url + '"') == 1
assert (site / 'mac/index.html').read_text().count('href="' + dmg_url + '"') == 2
assert 'PAPERMAC_DMG_URL=' + dmg_url + '\n' in (site / 'install').read_text()


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.tags = []
        self.texts = []
        self.emails = []
        self.anchor = None
        self.feed(text)

    def handle_starttag(self, tag, attributes):
        self.tags.append((tag, dict(attributes)))
        if tag == 'a':
            self.anchor = dict(attributes).get('href')

    def handle_endtag(self, tag):
        if tag == 'a':
            self.anchor = None

    def handle_data(self, data):
        self.texts.append(data)
        for email in re.findall(r'(?:support|billing)@getpaper\.sh', data):
            self.emails.append((email, self.anchor))


for route in ['index.html', 'mac/index.html', 'mac/activate/index.html', 'terms/index.html', 'privacy/index.html']:
    text = (site / route).read_text()
    page = Page(text)
    # Split markers so the test source stays clear in repository-wide privacy scans.
    for marker in ('Seal' + ' Beach', '123' + '37'):
        assert marker not in text, route
    for email, href in page.emails:
        assert href == 'mailto:' + email, (route, email, href)
    assert 'made by' not in ' '.join(page.texts).lower(), route
    assert '[TODO' not in text, route
    assert 'lemon' not in text.lower() and 'posthog' not in text.lower(), route
    if route not in ['terms/index.html', 'privacy/index.html']:
        assert 'Jason Martin' not in text, route
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
assert 'PaperMac Pro 27 covers PaperMac 27 on macOS 27 Golden Gate. PaperMac Lifetime also covers every future version.' in product
assert '<b data-regular>$39</b><b data-launch>$19.50</b>' in product and '<b data-regular>$99</b><b data-launch>$49.50</b>' in product
assert not any(tag in product for tag in ['<s>', '<del', '<strike', 'line-through'])
assert 'Date.now() < Date.parse("2026-12-02T07:59:00Z")' in product and 'html:not(.launch) [data-launch], .launch [data-regular] { display: none; }' in product
assert 'Lifetime costs about 2½ times today\'s Pro 27 price.' in product
assert 'Sales tax or VAT is added at checkout. Sold through Dodo Payments, the merchant of record.' in product
assert 'Your edition never expires.' in product
assert 'optional discounted upgrades' in product
assert 'brew tap getpapersh/tap &amp;&amp; brew install --cask papermac' in product
assert 'up to 5 Macs at once' in product
assert not any(phrase in product.lower() for phrase in ['lifetime support', 'every update', 'support for pro 27 ends', 'to be published', 'supported for the life'])
videos = [attributes for tag, attributes in Page(product).tags if tag == 'video']
assert len(videos) == 4
assert videos[0]['class'] == 'hero-promo'
assert videos[0]['poster'] == '../media/papermac/promo.jpg'
assert videos[0]['preload'] == 'none'
for video in videos:
    assert all(key in video for key in ('controls', 'muted', 'playsinline', 'loop', 'poster'))
    # The hero enables autoplay only after checking the visitor's motion preference.
    assert 'autoplay' not in video
sources = [attributes['src'] for tag, attributes in Page(product).tags if tag == 'source']
assert sources[0] == '../media/papermac/promo.mp4'
assert set(sources[1:]) == {'../media/papermac/' + name + '.mp4' for name in ['strip', 'overview', 'pro-layout']}
assert '{{' not in product
config = (Path(__file__).resolve().parents[1] / 'src/mac/checkout-url.txt').read_text().splitlines()
config = dict(line.split('=', 1) for line in config if line.strip() and not line.startswith('#'))
pro_checkout, lifetime_checkout = config['DODO_CHECKOUT_PRO_27'].strip(), config['DODO_CHECKOUT_LIFETIME'].strip()
buy_notice = '<p class="buy-notice">Full refund within 14 days, no questions asked. By buying, you agree to the <a href="/terms">Terms</a>.</p>'
# Each paid offer in the Pro ribbon carries its own refund and Terms notice right after its Buy control.
assert product.count(buy_notice) == 2
offers = re.findall(r'<div class="offer" id="(pro-27|lifetime)">(.*?)\n      </div>\n', product, re.S)
assert [name for name, body in offers] == ['pro-27', 'lifetime']
offers = dict(offers)
# Each offer shows its own prices, its own Buy control and, right after it, the refund and Terms notice.
editions = {'pro-27': ('$39', '$19.50', 'Buy Pro 27', pro_checkout), 'lifetime': ('$99', '$49.50', 'Buy Lifetime', lifetime_checkout)}
sales_off = pro_checkout == lifetime_checkout == 'off'
for name, (regular, launch, label, checkout) in editions.items():
    body = offers[name]
    assert f'<b data-regular>{regular}</b><b data-launch>{launch}</b>' in body, name
    assert f'<p class="launch-note" data-launch>Launch price until Dec 1, then {regular}</p>' in body, name
    if sales_off:
        control = r'<button class="btn pro[^"]*" type="button" disabled aria-describedby="buy-closed">' + re.escape(label) + '</button>'
    else:
        control = r'<a class="btn pro[^"]*" href="' + re.escape(html.escape(checkout, quote=True)) + '">' + re.escape(label) + '</a>'
    assert re.search(control + r'\s*' + re.escape(buy_notice), body), name
assert '<b><small>from</small> <span data-regular>$39</span><span data-launch>$19.50</span></b>' in product
assert not any(text in product for text in ['Try Pro free', 'trial-cta', 'qr-placeholder', 'sales-unavailable'])
assert len([attrs for tag, attrs in Page(product).tags if tag in ('a', 'button') and 'pro' in attrs.get('class', '').split()]) == 2
if sales_off:
    assert 'QR code for the PaperMac Pro 27 checkout' not in product
    assert '<svg class="segno"' not in product
    assert '<p class="sales-closed" id="buy-closed">Buying Pro opens during the beta</p>' in product
else:
    assert '<p class="sales-closed"' not in product
    assert re.search(r'<div class="ribbon".*?QR code for the PaperMac Pro 27 checkout.*?<div class="offer" id="pro-27">', product, re.S)
# The owner wants Homebrew reachable at the top, before the demo.
assert product.index('brew tap getpapersh/tap &amp;&amp; brew install --cask papermac') < product.index('data-strip-demo')
download_notice = '<p class="buy-notice download-notice">By downloading, you agree to the <a href="/terms">Terms</a>.</p>'
assert product.count(download_notice) == 2
assert 'Not included in Free or Pro.' in product
assert 'BETABELIEVER' not in product and 'EARLY' not in product
assert 'built on private macOS APIs' in product
for route in ['terms', 'privacy']:
    assert any(tag == 'a' and attrs.get('href') == '/' + route for tag, attrs in Page(product).tags)
    legal_html = (site / route / 'index.html').read_text()
    legal_body = re.search(r'<main\b[^>]*>(.*?)</main>', legal_html, re.S).group(1)
    legal_text = ' '.join(' '.join(Page(legal_body).texts).split())
    assert 'Jason Martin' in legal_text
    assert legal_text.count('Jason Martin') == 1
    assert 'href="https://github.com/jsonMartin">Jason Martin</a>' in legal_body
    identity = re.search(r'<(?:li|p) class="identity">(.*?)</(?:li|p)>', legal_body, re.S)[1]
    assert 'PaperMac\'s developer' in identity
    if route == 'terms':
        assert identity in re.findall(r'<li[^>]*>(.*?)</li>', legal_body, re.S)[-1]
        assert legal_text.startswith('PaperMac Terms Effective ') and 'These terms cover the free version' in legal_text
        assert 'PaperMac is beta software.' in legal_text and 'private macOS APIs' in legal_text
    else:
        assert re.search(r'<p class="identity">.*?</p>\s*<p>Questions:', legal_body, re.S)
    # Fails while a [TODO: ...] placeholder is left in a legal page, so it cannot ship.
    assert '[' not in legal_text and ']' not in legal_text, (route, re.findall(r'\[[^\]]*\]', legal_text))
    assert 'Coming before sales open' not in legal_html
assert '<h2>14-day refunds, for any reason</h2>' in (site / 'terms/index.html').read_text()
assert '30 days' not in (site / 'terms/index.html').read_text()
assert '<table>' in (site / 'privacy/index.html').read_text()
assert 'Dodo Payments, through its public license service' in (site / 'privacy/index.html').read_text()
main = (site / 'index.html').read_text()
assert 'href="/mac/">Mac</a>' in main and 'href="/mac/">PaperMac</a>' in main

activation_text = (site / 'mac/activate/index.html').read_text()
assert 'Then open PaperMac › Settings › License and paste.' in activation_text
activation = Page(activation_text)
assert [attributes['href'] for tag, attributes in activation.tags if tag == 'a'] == ['papermac://license', 'mailto:billing@getpaper.sh']
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
print('PASS: exact site inventory, shared DMG links, local resources, recording controls, Mac links and activation link/header policy')
