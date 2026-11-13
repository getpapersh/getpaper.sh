"""Check the deployed Mac pages and the resources their HTML can request."""
from html.parser import HTMLParser
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

checks = 0


def check(condition, detail='Mac page contract'):
    global checks
    assert condition, detail
    checks += 1


site = Path(sys.argv[1])
expected = {'index.html', '_headers', 'install', 'og.png', 'licenses',
            'mac', 'mac/index.html', 'mac/activate', 'mac/activate/index.html',
            'media', 'media/papermac', 'terms', 'terms/index.html', 'privacy', 'privacy/index.html'}
expected.update(['brand', 'brand/papermac', 'brand/paperland',
                 'brand/papermac/papermac-icon.svg', 'brand/paperland/paperland-icon.svg',
                 'brand/papermac/papermac-icon-32.png', 'brand/papermac/papermac-icon-180.png',
                 'mac/og.png', 'paperland', 'paperland/index.html', 'paperland/og.png',
                 'brand/paperland/paperland-icon-32.png', 'brand/paperland/paperland-icon-180.png',
                 '_redirects', 'sitemap.xml'])
expected.update('licenses/' + name for name in
                ['OFL-monasans.txt', 'OFL-jetbrainsmono.txt', 'LOGOS-SOURCE.txt', 'FONTS.txt'])
expected.update('media/papermac/' + name + suffix
                for name in ['strip', 'overview', 'pro-layout'] for suffix in ['.mp4', '.jpg'])
check({str(path.relative_to(site)) for path in site.rglob('*')} == expected)


dmg_url = (Path(__file__).resolve().parents[1] / 'src/mac/dmg-url.txt').read_text().strip()
for target in [*site.rglob('*.html'), site / 'install']:
    text = target.read_text()
    check('vercel-storage' not in text, target)
    check(not re.search(r'https?://[^\s"\'<>]*alpha[^\s"\'<>]*\.dmg', text, re.I), target)
    check('{{DMG_URL}}' not in text, target)
    for link in re.findall(r'https?://[^\s"\'<>]*\.dmg', text):
        check(link == dmg_url, (target, link))
check((site / 'index.html').read_text().count('href="' + dmg_url + '"') == 1)
check((site / 'mac/index.html').read_text().count('href="' + dmg_url + '"') == 4)
check('PAPERMAC_DMG_URL=' + dmg_url + '\n' in (site / 'install').read_text())


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


for route in ['index.html', 'mac/index.html', 'mac/activate/index.html', 'terms/index.html', 'privacy/index.html', 'paperland/index.html']:
    text = (site / route).read_text()
    page = Page(text)
    # Split markers so the test source stays clear in repository-wide privacy scans.
    for marker in ('Seal' + ' Beach', '123' + '37'):
        check(marker not in text, route)
    if route == 'mac/index.html':
        check(page.emails.count(('billing@getpaper.sh', None)) == 1)
    for email, href in page.emails:
        check(href == 'mailto:' + email or (route == 'mac/index.html' and email == 'billing@getpaper.sh' and href is None), (route, email, href))
    check('made by' not in ' '.join(page.texts).lower(), route)
    check('PaperMac Pro 27' not in ' '.join(' '.join(page.texts).split()), route)
    if route not in ['mac/index.html', 'terms/index.html', 'privacy/index.html', 'paperland/index.html']:
        check('Jason Martin' not in text, route)
    check(not re.search(r'(?:PAP|PAPER)-\d+', text), route)
    for tag, attributes in page.tags:
        check(not (tag == 'script' and 'src' in attributes), route)
        resources = [attributes[key] for key in ('src', 'poster') if key in attributes]
        if tag == 'link' and attributes.get('rel') in ('stylesheet', 'icon', 'apple-touch-icon', 'preload', 'prefetch'):
            resources.append(attributes['href'])
        for resource in resources:
            parsed = urlsplit(resource)
            check(parsed.scheme in ('', 'data') and not parsed.netloc, (route, resource))
            if parsed.scheme != 'data':
                target = site / parsed.path.lstrip('/') if parsed.path.startswith('/') else site / Path(route).parent / parsed.path
                check(target.resolve().is_relative_to(site.resolve()), (route, resource))
                check(target.is_file(), (route, resource))
    for resource in re.findall(r'url\([\s\"\']*([^\)\"\']+)', text):
        check(resource.startswith('data:'), (route, resource[:60]))
    check(not any(tag == 'form' for tag, attributes in page.tags), route)
    if route != 'index.html':
        check('outline: 2px solid var(--brand-focus); outline-offset: 2px;' in text, route)

product = (site / 'mac/index.html').read_text()
refund_item = """<div role="listitem"><strong>30-day refund, for any reason.</strong><p>Email billing@getpaper.sh within 30 days of purchase for a full refund. We won't ask why.</p></div>"""
check(re.search(r'<div class="plain" role="list" aria-label="Purchase terms">\s*' + re.escape(refund_item), product), 'Refund must be the first purchase term')
check(product.count('Jason Martin') == 1)
check('<p class="txt">PaperMac is built by Jason Martin, an independent developer. Questions before you buy? Email <a href="mailto:support@getpaper.sh">support@getpaper.sh</a>.</p>' in product)

check('A scrolling window manager for macOS that sets your windows side by side on a Strip running past the edges of the screen.' in product)
check('Free forever' not in product)
check('#activate=' not in product)
check('A PaperMac 27 Pro license covers PaperMac 27 Pro on macOS 27 Golden Gate.' in product and 'PaperMac Pro 27' not in product)
check('No subscription. A PaperMac 27 Pro license never expires. Editions for later macOS versions are separate, optional purchases.' in product)
check('discounted upgrades' not in product)
check('brew tap getpapersh/tap &amp;&amp; brew install --cask papermac' in product)
check(product.count('The 14-day Pro trial starts inside the app, when you choose.') == 3)
check('There is no automatic charge.' in product)
check('free week' not in product and 'starts automatically after setup' not in product)
check('full-height or half-and-half' not in product)
free_column = product.split('id="free"', 1)[1].split('id="pro"', 1)[0]
pro_column = product.split('id="pro"', 1)[1].split('</section>', 1)[0]
check('The core window manager is free to use, with no time limit.' in free_column)
check('up to two Strips per Desktop at independently adjustable heights, and stacks of up to 2 showing windows.' in free_column)
check('data-pic="select"' in free_column and 'data-pic="select"' not in pro_column)
check('Three or more Strips</b> per Desktop, stacked, with adjustable heights' in pro_column)
check('Lanes of different heights' not in pro_column)
check('with up to five activations at a time. Each macOS user account counts as a separate activation.' in product)
check('<strong>Five activations.</strong><p>One license covers one person across all their Macs, with up to five activations at a time. Each macOS user account counts as a separate activation.</p>' in product)
check('<strong>Try Pro.</strong><p>The 14-day Pro trial starts inside the app, when you choose. There is no automatic charge.</p>' in product)
check(not any(phrase in product.lower() for phrase in ['lifetime support', 'lifetime updates', 'every update', 'support for pro 27 ends', 'to be published', 'supported for the life']))
videos = [attributes for tag, attributes in Page(product).tags if tag == 'video']
check(len(videos) == 3)
for video in videos:
    check(all(key in video for key in ('controls', 'controlslist', 'disablepictureinpicture', 'muted', 'playsinline', 'loop', 'poster', 'aria-label')))
    check('autoplay' not in video)
    check(video['controlslist'] == 'nodownload noplaybackrate')
sources = [attributes['src'] for tag, attributes in Page(product).tags if tag == 'source']
check(set(sources) == {'../media/papermac/' + name + '.mp4' for name in ['strip', 'overview', 'pro-layout']})
check('{{CHECKOUT_' not in product and '{{SALES_MODE}}' not in product)
checkout = (Path(__file__).resolve().parents[1] / 'src/mac/checkout-url.txt').read_text().strip()
lifetime = (Path(__file__).resolve().parents[1] / 'src/mac/lifetime-checkout-url.txt').read_text().strip()
check(product.count('<p class="to">Full refund within 30 days, for any reason.</p>') == (1 + (lifetime != 'off') if checkout != 'off' else 0))
buy_notice = '<p class="buy-notice">By buying, you agree to the <a href="/terms">Terms</a>.</p>'
check(product.count(buy_notice) == (2 + 2 * (lifetime != 'off') if checkout != 'off' else 0))
trial_links = [attrs for tag, attrs in Page(product).tags if tag == 'a' and 'trial-cta' in attrs.get('class', '').split()]
check(len(trial_links) == (3 if checkout == 'off' else 2))
check(all(attrs.get('href') == '#install' for attrs in trial_links))
check(not any(tag == 'button' and 'disabled' in attrs for tag, attrs in Page(product).tags))
if checkout == 'off':
    check(lifetime == 'off')
    check('lemonsqueezy' not in product.lower())
    check('class="segno"' not in product and 'class="phone"' not in product)
    check('qr-placeholder' not in product)
    check('<p class="sales-closed" id="header-sales">Buying opens soon.</p>' in product)
    check(product.count('Buying opens soon. Until then, try Pro free for 14 days.') == 2)
    check(not any(tag == 'a' and attrs.get('href', '').startswith('https://') and 'pro' in attrs.get('class', '').split() for tag, attrs in Page(product).tags))
else:
    check('class="segno"' in product)
    check('<p class="sales-closed"' not in product)
    check('Scan to buy PaperMac 27 Pro on your phone' in product)
    buy_links = [attrs['href'] for tag, attrs in Page(product).tags
                 if tag == 'a' and 'pro' in attrs.get('class', '').split() and 'trial-cta' not in attrs.get('class', '').split()]
    check(buy_links == [checkout] * 3)
lifetime_links = [attrs['href'] for tag, attrs in Page(product).tags if tag == 'a' and 'lifetime-cta' in attrs.get('class', '').split()]
founding_until = '<time datetime="2026-12-02T07:59:59Z">Dec 1, 11:59&nbsp;PM&nbsp;PT</time>'
if lifetime == 'off':
    check('Lifetime' not in product and '$79' not in product and '$39.50' not in product and lifetime_links == [])
    check('aria-label="Buy PaperMac 27 Pro"' in product)
else:
    check(lifetime_links == [lifetime] * 2)
    check('aria-label="Buy PaperMac 27 Pro or Lifetime"' in product)
    check(product.count('Covers this and all future versions of PaperMac with a Pro license.') == 3)
    check(product.count('$39.50') == 2)
    check(product.count('<span class="was">Regular $79</span>') == 2)
check('{{LIFETIME_' not in product and 'lifetime:' not in product)
check('{{BUY_LABEL}}' not in product)
for tag, attrs in Page(product).tags:
    if tag == 'button' and 'cmd' in attrs.get('class', '').split():
        check('aria-label' not in attrs)
        check(f'id="{attrs["aria-describedby"]}"' in product)
check('Also in Pro: lock windows together as a group, and set custom heights inside a stack.' in pro_column)
check('Everything in Free, plus:' in pro_column)
check('Also free: app rules, gestures, custom shortcuts, a config file, a CLI, and crash recovery.' in free_column)
download_notice = '<p class="buy-notice download-notice">By downloading, you agree to the <a href="/terms">Terms</a>.</p>'
check(product.count(download_notice) == 2)
check('Coming soon' not in product and 'Stack scrolling and stack height controls.' not in product)
# Checkout URLs carry the founding codes, so buyers never see or type one.
visible = ' '.join(Page(product).texts)
for phrase in ['betabeliever', 'foreverfounder', 'coupon', 'discount code', 'promo', '$10 off']:
    check(phrase not in visible.lower(), phrase)
check('EARLY' not in product)
pro_list = '<span class="was">Regular $39</span>'
check('<h2>PaperMac 27 Pro</h2><p class="price"><b>$19.50</b>' in product)
check(f'<li>One-time purchase for macOS 27. Founding price through {founding_until}, then $39.</li>' in product)
check('<h3>PaperMac 27 Pro</h3><b>$19.50 ' in product)
check('<p class="coverage">PaperMac 27 Pro on macOS 27</p>' in product)
check(f'<p class="to">Founding price through {founding_until}</p>' in product)
check(product.count(founding_until) == 2 + (lifetime != 'off'))
check(product.count('$19.50') == 3 and product.count(pro_list) == 3)
check('<s>' not in product)
check(len({video['aria-label'] for video in videos}) == 3)
check('$29' not in product and not re.search(r'\$19(?!\.50)', product))
check('beta price' not in product)
check('built on private macOS APIs' in product)
for route in ['terms', 'privacy']:
    check(any(tag == 'a' and attrs.get('href') == '/' + route for tag, attrs in Page(product).tags))
    legal_html = (site / route / 'index.html').read_text()
    legal_body = re.search(r'<main\b[^>]*>(.*?)</main>', legal_html, re.S).group(1)
    legal_text = ' '.join(' '.join(Page(legal_body).texts).split())
    check('<p>Effective November 13, 2026</p>' in legal_body)
    check('Effective November 12, 2026' not in legal_body)
    check('Jason Martin' in legal_text)
    check(legal_text.count('Jason Martin') == 1)
    check('href="https://github.com/jsonMartin">Jason Martin</a>' in legal_body)
    identity = re.search(r'<(?:li|p) class="identity">(.*?)</(?:li|p)>', legal_body, re.S)[1]
    check('PaperMac\'s developer' in identity)
    if route == 'terms':
        check(identity in re.findall(r'<li[^>]*>(.*?)</li>', legal_body, re.S)[-1])
        check(legal_text.startswith('PaperMac Terms Effective November 13, 2026 These terms cover'))
        check('PaperMac is beta software.' in legal_text and 'private macOS APIs' in legal_text)
    else:
        check(re.search(r'<p class="identity">.*?</p>\s*<p>Questions:', legal_body, re.S))
    check('[' not in legal_text and ']' not in legal_text)
    check('Coming before sales open' not in legal_html)
check('<h2>30-day refunds, for any reason</h2>' in (site / 'terms/index.html').read_text())
check('<table>' in (site / 'privacy/index.html').read_text())
privacy = (site / 'privacy/index.html').read_text()
check('PaperMac has no accounts, ads or telemetry.' in privacy)
check('It does not collect feature usage or send system profiles.' in privacy)
for stale in ['PostHog', 'usage sharing', 'usage data', 'once a week', 'basic system profile']:
    check(stale not in privacy, ('privacy', stale))
main = (site / 'index.html').read_text()
check('href="/mac/">Mac</a>' not in main and 'href="/mac/">PaperMac</a>' in main)

activation_text = (site / 'mac/activate/index.html').read_text()
check('<title>Activate PaperMac 27</title>' in activation_text)
check('<b>PaperMac 27</b><span>Pro &amp; Lifetime license · macOS 27</span>' in activation_text)
check('Then open PaperMac › Settings › License and paste.' in activation_text)
check('--hi:' not in activation_text and 'var(--hi)' not in activation_text)
check('--brand-focus: #0965D0;' in activation_text and activation_text.count('--brand-focus: #79B6FF;') == 2)
check('--done-bg: var(--brand-accent); --done-ink: var(--brand-onAccent);' in activation_text)
activation = Page(activation_text)
check([attributes['href'] for tag, attributes in activation.tags if tag == 'a'] == ['papermac://license', 'mailto:billing@getpaper.sh'])
meta = {attributes.get('name'): attributes.get('content') for tag, attributes in activation.tags if tag == 'meta'}
check('noindex' in meta['robots'].split(', '))
check(meta['referrer'] == 'no-referrer')
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
    check(rules[route]['referrer-policy'] == 'no-referrer')
    check(rules[route]['cache-control'] == 'no-store')
for route in ['/', '/mac/', '/paperland/', '/terms/', '/privacy/']:
    html = (site / route.lstrip('/') / 'index.html').read_text()
    tags = Page(html).tags
    check(any(tag == 'link' and attrs.get('rel') == 'canonical' and attrs.get('href') == 'https://getpaper.sh' + route for tag, attrs in tags), (route, 'canonical'))
    for key, value in [('og:url', 'https://getpaper.sh' + route)]:
        check(any(tag == 'meta' and attrs.get('property') == key and attrs.get('content') == value for tag, attrs in tags), (route, key))
    for key in ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']:
        check(any(tag == 'meta' and attrs.get('name') == key and attrs.get('content') for tag, attrs in tags), (route, key))
check((site / '_redirects').read_text().splitlines() == [f'{alias} /paperland/ 301' for alias in ['/land', '/land/', '/linux', '/linux/']])
from xml.etree import ElementTree
urls = ElementTree.parse(site / 'sitemap.xml').findall('{*}url/{*}loc')
check([url.text for url in urls] == ['https://getpaper.sh' + route for route in ['/', '/mac/', '/paperland/', '/terms/', '/privacy/']])
check('PaperMac Beta' in main and 'PaperLand Alpha' in main)
check('PaperMac Free' in main and 'Overview (Experimental)' in main)
check('PaperMac Free Overview with synthetic document windows' in main and '/media/papermac/overview.mp4' in main)
terms = (site / 'terms/index.html').read_text()
for page in [main, product, terms]:
    check('closed-source software' in page)
    check("PaperMac's proprietary Terms" in page or 'licensed under these proprietary Terms' in page)
    check('open-core' not in page)
    check('href="https://github.com/jsonMartin/papermac' not in page)
check('two Strips at independently adjustable heights' in free_column)
check('adjustable-height Strips, even with only two' not in pro_column)
check('three or more Strips, deeper stacks, custom stack heights, Window groups (Lock as Group), Limelight, snoozing, window previews, Desktop auto-naming and synced Strips across displays' in main)
check('on("mac", true)' in main and main.count('on("mac", true)') == 2)
check('Overview (Experimental)' in free_column)
check('data-pic="lanes2"' in free_column and 'data-pic="uneven"' not in free_column)
land = (site / 'paperland/index.html').read_text()
check('PaperLand Alpha' in land and 'Omarchy 4+' in land and 'Hyprland 0.56+' in land)
check('Accessibility' not in land)
check('Super' in land and 'paperland start-hidden' in land)
check('No sudo' in land and 'GPL-3.0-or-later' in land)
check('open-core' not in land and 'separate, closed-source products' in land)
mac_meta = {a.get('name'): a.get('content') for tag, a in Page(product).tags if tag == 'meta'}
land_meta = {a.get('name'): a.get('content') for tag, a in Page(land).tags if tag == 'meta'}
check(mac_meta['twitter:description'] != land_meta['twitter:description'])
check('native macOS Spaces' in mac_meta['twitter:description'])
check('Omarchy with Hyprland' in land_meta['twitter:description'])
check('Paperland CLI installation v1' in (site / 'install').read_text())
check('PaperLand installer (unannounced alpha; expect rough edges)' in (site / 'install').read_text())
check('id="changelog"' in product and 'https://dl.getpaper.sh/papermac/appcast-27.xml' in product)
print(f'PASS: {checks} Mac-page assertions; 0 failures; exact site inventory, shared DMG links, local resources, recording controls, Mac links and activation link/header policy')
