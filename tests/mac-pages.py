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
expected.update(['brand', 'brand/papermac', 'brand/paperland',
                 'brand/papermac/papermac-icon.svg', 'brand/paperland/paperland-icon.svg',
                 'brand/papermac/papermac-icon-32.png', 'brand/papermac/papermac-icon-180.png',
                 'mac/og.png'])
expected.update('licenses/' + name for name in
                ['OFL-monasans.txt', 'OFL-jetbrainsmono.txt', 'LOGOS-SOURCE.txt', 'FONTS.txt'])
expected.update('media/papermac/' + name + suffix
                for name in ['strip', 'overview', 'pro-layout'] for suffix in ['.mp4', '.jpg'])
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
assert (site / 'mac/index.html').read_text().count('href="' + dmg_url + '"') == 4
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
    assert 'PaperMac Pro 27' not in ' '.join(' '.join(page.texts).split()), route
    if route not in ['terms/index.html', 'privacy/index.html']:
        assert 'Jason Martin' not in text, route
    assert not re.search(r'(?:PAP|PAPER)-\d+', text), route
    for tag, attributes in page.tags:
        assert not (tag == 'script' and 'src' in attributes), route
        resources = [attributes[key] for key in ('src', 'poster') if key in attributes]
        if tag == 'link' and attributes.get('rel') in ('stylesheet', 'icon', 'apple-touch-icon', 'preload', 'prefetch'):
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
    if route != 'index.html':
        assert 'outline: 3px solid var(--focus, currentColor);' in text, route

product = (site / 'mac/index.html').read_text()
assert 'A scrolling window manager for macOS that sets your windows side by side on a Strip running past the edges of the screen.' in product
assert 'Free forever' not in product
assert '#activate=' not in product
assert 'A PaperMac 27 Pro license covers PaperMac 27 Pro on macOS 27 Golden Gate.' in product and 'PaperMac Pro 27' not in product
assert 'No subscription. A PaperMac 27 Pro license never expires. Editions for later macOS versions are separate, optional purchases.' in product
assert 'discounted upgrades' not in product
assert 'brew tap getpapersh/tap &amp;&amp; brew install --cask papermac' in product
assert product.count('The 14-day Pro trial starts inside the app, when you choose.') == 3
assert 'There is no automatic charge.' in product
assert 'free week' not in product and 'starts automatically after setup' not in product
assert 'half and half' not in product
free_column = product.split('id="free"', 1)[1].split('id="pro"', 1)[0]
pro_column = product.split('id="pro"', 1)[1].split('</section>', 1)[0]
assert 'The core window manager is free to use, with no time limit.' in free_column
assert 'up to two adjustable-height Strips per Desktop and stacks of up to two windows.' in free_column
assert 'data-pic="select"' in free_column and 'data-pic="select"' not in pro_column
assert 'Three or more Strips</b> per Desktop, stacked, with adjustable heights' in pro_column
assert 'Lanes of different heights' not in pro_column
assert 'with up to five activations at a time. Each macOS user account counts as a separate activation.' in product
assert '<strong>Five activations.</strong><p>One license covers one person across all their Macs, with up to five activations at a time. Each macOS user account counts as a separate activation.</p>' in product
assert '<strong>Try Pro.</strong><p>The 14-day Pro trial starts inside the app, when you choose. There is no automatic charge.</p>' in product
assert not any(phrase in product.lower() for phrase in ['lifetime support', 'lifetime updates', 'every update', 'support for pro 27 ends', 'to be published', 'supported for the life'])
videos = [attributes for tag, attributes in Page(product).tags if tag == 'video']
assert len(videos) == 3
for video in videos:
    assert all(key in video for key in ('controls', 'controlslist', 'disablepictureinpicture', 'muted', 'playsinline', 'loop', 'poster', 'aria-label'))
    assert 'autoplay' not in video
    assert video['controlslist'] == 'nodownload noplaybackrate'
sources = [attributes['src'] for tag, attributes in Page(product).tags if tag == 'source']
assert set(sources) == {'../media/papermac/' + name + '.mp4' for name in ['strip', 'overview', 'pro-layout']}
assert '{{CHECKOUT_' not in product and '{{SALES_MODE}}' not in product
checkout = (Path(__file__).resolve().parents[1] / 'src/mac/checkout-url.txt').read_text().strip()
lifetime = (Path(__file__).resolve().parents[1] / 'src/mac/lifetime-checkout-url.txt').read_text().strip()
buy_notice = '<p class="buy-notice">By buying, you agree to the <a href="/terms">Terms</a>.</p>'
assert product.count(buy_notice) == (2 + 2 * (lifetime != 'off') if checkout != 'off' else 0)
trial_links = [attrs for tag, attrs in Page(product).tags if tag == 'a' and 'trial-cta' in attrs.get('class', '').split()]
assert len(trial_links) == (3 if checkout == 'off' else 2)
assert all(attrs.get('href') == '#install' for attrs in trial_links)
assert not any(tag == 'button' and 'disabled' in attrs for tag, attrs in Page(product).tags)
if checkout == 'off':
    assert lifetime == 'off'
    assert 'lemonsqueezy' not in product.lower()
    assert 'class="segno"' not in product and 'class="phone"' not in product
    assert 'qr-placeholder' not in product
    assert '<p class="sales-closed" id="header-sales">Buying opens soon.</p>' in product
    assert product.count('Buying opens soon. Until then, try Pro free for 14 days.') == 2
    assert not any(tag == 'a' and attrs.get('href', '').startswith('https://') and 'pro' in attrs.get('class', '').split() for tag, attrs in Page(product).tags)
else:
    assert 'class="segno"' in product
    assert '<p class="sales-closed"' not in product
    assert 'Scan to buy PaperMac 27 Pro on your phone' in product
    buy_links = [attrs['href'] for tag, attrs in Page(product).tags
                 if tag == 'a' and 'pro' in attrs.get('class', '').split() and 'trial-cta' not in attrs.get('class', '').split()]
    assert buy_links == [checkout] * 3
lifetime_links = [attrs['href'] for tag, attrs in Page(product).tags if tag == 'a' and 'lifetime-cta' in attrs.get('class', '').split()]
founding_until = '<time datetime="2026-12-02T07:59:59Z">Dec 1, 11:59&nbsp;PM&nbsp;PT</time>'
if lifetime == 'off':
    assert 'Lifetime' not in product and '$79' not in product and '$39.50' not in product and lifetime_links == []
    assert 'aria-label="Buy PaperMac 27 Pro"' in product
else:
    assert lifetime_links == [lifetime] * 2
    assert 'aria-label="Buy PaperMac 27 Pro or Lifetime"' in product
    assert product.count('Covers this and all future versions of PaperMac with a Pro license.') == 3
    assert product.count('$39.50') == 2
    assert product.count('<span class="was">Regular $79</span>') == 2
assert '{{LIFETIME_' not in product and 'lifetime:' not in product
assert '{{BUY_LABEL}}' not in product
for tag, attrs in Page(product).tags:
    if tag == 'button' and 'cmd' in attrs.get('class', '').split():
        assert 'aria-label' not in attrs
        assert f'id="{attrs["aria-describedby"]}"' in product
assert 'Also in Pro: lock windows together as a group.' in pro_column
assert 'Everything in Free, plus:' in pro_column
assert 'Also free: app rules, gestures, custom shortcuts, a config file, a CLI, and crash recovery.' in free_column
download_notice = '<p class="buy-notice download-notice">By downloading, you agree to the <a href="/terms">Terms</a>.</p>'
assert product.count(download_notice) == 2
assert 'Coming soon' not in product and 'Stack scrolling and stack height controls.' not in product
# Checkout URLs carry the founding codes, so buyers never see or type one.
visible = ' '.join(Page(product).texts)
for phrase in ['betabeliever', 'foreverfounder', 'coupon', 'discount code', 'promo', '$10 off']:
    assert phrase not in visible.lower(), phrase
assert 'EARLY' not in product
pro_list = '<span class="was">Regular $39</span>'
assert '<h2>PaperMac 27 Pro</h2><p class="price"><b>$19.50</b>' in product
assert f'<li>One-time purchase for macOS 27. Founding price through {founding_until}, then $39.</li>' in product
assert '<h3>PaperMac 27 Pro</h3><b>$19.50 ' in product
assert '<p class="coverage">PaperMac 27 Pro on macOS 27</p>' in product
assert f'<p class="to">Founding price through {founding_until}</p>' in product
assert product.count(founding_until) == 2 + (lifetime != 'off')
assert product.count('$19.50') == 3 and product.count(pro_list) == 3
assert '<s>' not in product
assert len({video['aria-label'] for video in videos}) == 3
assert '$29' not in product and not re.search(r'\$19(?!\.50)', product)
assert 'beta price' not in product
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
        assert legal_text.startswith('PaperMac Terms Effective November 9, 2026 These terms cover')
        assert 'PaperMac is beta software.' in legal_text and 'private macOS APIs' in legal_text
    else:
        assert re.search(r'<p class="identity">.*?</p>\s*<p>Questions:', legal_body, re.S)
    assert '[' not in legal_text and ']' not in legal_text
    assert 'Coming before sales open' not in legal_html
assert '<h2>30-day refunds, for any reason</h2>' in (site / 'terms/index.html').read_text()
assert '<table>' in (site / 'privacy/index.html').read_text()
assert 'only while it helps us improve PaperMac' in (site / 'privacy/index.html').read_text()
main = (site / 'index.html').read_text()
assert 'href="/mac/">Mac</a>' in main and 'href="/mac/">PaperMac</a>' in main

activation_text = (site / 'mac/activate/index.html').read_text()
assert 'Then open PaperMac › Settings › License and paste.' in activation_text
assert '--hi:' not in activation_text and 'var(--hi)' not in activation_text
assert '--focus: #0965D0;' in activation_text and activation_text.count('--focus: #79B6FF;') == 2
assert '--done-bg: #2E7A4D;' in activation_text and activation_text.count('--done-bg: #5FCB8E;') == 2
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
