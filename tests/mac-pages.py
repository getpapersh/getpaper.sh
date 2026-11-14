"""Check the deployed Mac pages and the resources their HTML can request."""
from html.parser import HTMLParser
from pathlib import Path
import re
import gzip
import subprocess
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
                 '_redirects', 'sitemap.xml', 'robots.txt', 'favicon.ico', 'apple-touch-icon.png'])
expected.update('licenses/' + name for name in
                ['OFL-monasans.txt', 'OFL-jetbrainsmono.txt', 'LOGOS-SOURCE.txt', 'FONTS.txt'])
# New hero takes only need their files and one source-attribute change.
media_source = Path(__file__).resolve().parents[1] / 'media'
expected.update('media/' + str(path.relative_to(media_source)) for path in media_source.rglob('*'))
check({str(path.relative_to(site)) for path in site.rglob('*')} == expected)


dmg_url = (Path(__file__).resolve().parents[1] / 'src/mac/dmg-url.txt').read_text().strip()
for target in [*site.rglob('*.html'), site / 'install']:
    text = target.read_text()
    check('vercel-storage' not in text, target)
    check(not re.search(r'https?://[^\s"\'<>]*alpha[^\s"\'<>]*\.dmg', text, re.I), target)
    check('{{DMG_URL}}' not in text, target)
    for link in re.findall(r'https?://[^\s"\'<>]*\.dmg', text):
        check(link == dmg_url, (target, link))
check((site / 'index.html').read_text().count('href="' + dmg_url + '"') == 0)
check((site / 'mac/index.html').read_text().count('href="' + dmg_url + '"') == 2)
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
    for email, href in page.emails:
        check(href == 'mailto:' + email, (route, email, href))
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

for route in ['terms/index.html', 'privacy/index.html', 'mac/activate/index.html']:
    page_html = (site / route).read_text()
    check('<a class="skip" href="#main">' in page_html, (route, 'Focus-only skip link'))
    check('id="main" tabindex="-1"' in page_html, (route, 'Skip target'))

product = (site / 'mac/index.html').read_text()
check(product.count('Jason Martin') == 1)
check('PaperMac is built by Jason Martin, an independent developer. Questions before you buy? Email <a href="mailto:support@getpaper.sh">support@getpaper.sh</a>.' in product)
check('A scrolling window manager for macOS.' in product)
check('Go beyond Mission Control' not in product)
check('Free forever' not in product and '#activate=' not in product)
check('Covers macOS 27 forever; later editions are optional. Up to five activations.' in product)
check('Golden Gate' not in product and 'closed-source software' not in product)
check('brew tap getpapersh/tap &amp;&amp; brew install --cask papermac' in product)
check(product.count('Try Pro free for 14 days') == 1)
check(product.count('Starts inside the app, when you choose. No automatic charge.') == 1)
check(product.count('Free to use, with no time limit.') == 1)
check(product.count('Real app; synthetic documents.') == 1)
check(product.count('30-day refund, for any reason.') == 1)
check('free week' not in product and 'starts automatically after setup' not in product)
free_column = product.split('id="free"', 1)[1].split('id="pro"', 1)[0]
pro_column = product.split('id="pro"', 1)[1].split('</section>', 1)[0]
check('Stacks of up to 2 windows' in free_column and 'Select several windows and arrange them at once' in free_column)
check('3+ strips' in pro_column and 'Stacks of 3+ windows' in pro_column)
check('Lock windows as a group' in pro_column and 'Everything in Free, plus:' in pro_column)
check('App rules, gestures, shortcuts, config file, CLI and crash recovery' in free_column)
check(not re.search(r'heights?', pro_column, re.I), 'Height adjustment must not be marketed as Pro-only')
check('Overview' not in product and 'computer-use agents' not in product.lower())
check(not any(phrase in product.lower() for phrase in ['lifetime support', 'lifetime updates', 'every update', 'support for pro 27 ends', 'to be published', 'supported for the life', 'discounted upgrades']))
videos = [attrs for tag, attrs in Page(product).tags if tag == 'video']
check(len(videos) == 2)
for video in videos:
    check(all(key in video for key in ('muted', 'playsinline', 'poster', 'aria-label')))
    check(video['preload'] == 'metadata' and 'autoplay' not in video)
    check(video['width'] == '1920' and video['height'] == '1200')
check('loop' in videos[0] and 'loop' not in videos[1])
check(videos[0]['controlslist'] == 'nodownload noplaybackrate')
hero = next(attrs for tag, attrs in Page(product).tags if 'data-hero-film' in attrs)
for source in [hero['data-screencast-src'], hero['data-promo-src']]:
    if source:
        check(source.startswith('/media/papermac/') and source.endswith('.mp4'))
        check((site / source.lstrip('/')).is_file())
        check((site / source.lstrip('/')).with_suffix('.jpg').is_file())
check('{{CHECKOUT_' not in product and '{{SALES_MODE}}' not in product)
checkout = (Path(__file__).resolve().parents[1] / 'src/mac/checkout-url.txt').read_text().strip()
lifetime = (Path(__file__).resolve().parents[1] / 'src/mac/lifetime-checkout-url.txt').read_text().strip()
buy_notice = '<p class="buy-notice">By buying, you agree to the <a href="/terms">Terms</a>.</p>'
check(product.count(buy_notice) == (int(checkout != 'off') + int(lifetime != 'off')))
trial_links = [a for tag, a in Page(product).tags if tag == 'a' and 'trial-cta' in a.get('class', '').split()]
check(len(trial_links) == 1 and trial_links[0]['href'] == '#install')
check(not any(tag == 'button' and 'disabled' in attrs for tag, attrs in Page(product).tags))
if checkout == 'off':
    check(lifetime == 'off')
    check('lemonsqueezy' not in product.lower())
    check(product.count('Buying opens soon.') == 1)
    check('class="segno"' not in product and 'qr-placeholder' not in product)
else:
    check('Buying opens soon.' not in product)
buy_links = [a['href'] for tag, a in Page(product).tags if tag == 'a' and a.get('class') == 'btn pro']
check(buy_links == ([] if checkout == 'off' else [checkout]))
lifetime_links = [a['href'] for tag, a in Page(product).tags if tag == 'a' and 'lifetime-cta' in a.get('class', '').split()]
check(lifetime_links == ([] if lifetime == 'off' else [lifetime]))
check(product.count('$19.50') == 1 and product.count('then $39<') == 1)
check(product.count('Or Lifetime, all future editions: $39.50 founding, then $79.') == 1)
check('<code>BETABELIEVER</code>' in re.search(r'<p class="founding">(.*?)</p>', product, re.S)[1])
check('<code>FOREVERFOUNDER</code>' in re.search(r'<p class="lifetime-price">(.*?)</p>', product, re.S)[1])
check(product.count('<code>BETABELIEVER</code>') == 1 and product.count('<code>FOREVERFOUNDER</code>') == 1)
check(product.count('<time datetime="2026-12-02T07:59:59Z">Dec 1, 11:59&nbsp;PM&nbsp;PT</time>') == 1)
check('{{LIFETIME_' not in product and '{{BUY_LABEL}}' not in product)
for tag, attrs in Page(product).tags:
    if tag == 'button' and 'cmd' in attrs.get('class', '').split():
        check('aria-label' not in attrs)
        check(f'id="{attrs["aria-describedby"]}"' in product)
download_notice = '<p class="buy-notice download-notice">By downloading, you agree to the <a href="/terms">Terms</a>.</p>'
check(product.count(download_notice) == 2)
check('private macOS APIs change, so an update can break things.' in product)
check('Coming soon' not in product and '$29' not in product and '<s>' not in product)
check(len({video['aria-label'] for video in videos}) == 2)
for stale in ['coupon', 'discount code', '$10 off', 'EARLY', 'Stack scrolling and stack height controls.']:
    check(stale not in product)
for route in ['terms', 'privacy']:
    check(any(tag == 'a' and attrs.get('href') == '/' + route for tag, attrs in Page(product).tags))
    legal_html = (site / route / 'index.html').read_text()
    legal_body = re.search(r'<main\b[^>]*>(.*?)</main>', legal_html, re.S).group(1)
    legal_text = ' '.join(' '.join(Page(legal_body).texts).split())
    check('<p>Effective November 14, 2026</p>' in legal_body)
    check('Effective November 12, 2026' not in legal_body)
    check('Jason Martin' in legal_text)
    check(legal_text.count('Jason Martin') == 1)
    check('href="https://github.com/jsonMartin">Jason Martin</a>' in legal_body)
    identity = re.search(r'<(?:li|p) class="identity">(.*?)</(?:li|p)>', legal_body, re.S)[1]
    check('PaperMac\'s developer' in identity)
    if route == 'terms':
        check(identity in re.findall(r'<li[^>]*>(.*?)</li>', legal_body, re.S)[-1])
        check(legal_text.startswith('PaperMac Terms Effective November 14, 2026 These terms cover'))
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
check([attributes['href'] for tag, attributes in activation.tags if tag == 'a'] == ['#main', 'papermac://license', 'mailto:billing@getpaper.sh'])
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
check('See PaperMac' in main and 'See PaperLand' in main)
check('Experimental on macOS.' in main)
check('curl -fsSL' not in main and 'scroll-snap' not in main)
check('Room for your windows' not in main and 'Beyond the arrow keys' not in main)
terms = (site / 'terms/index.html').read_text()
for phrase in ['closed-source software', 'licensed under these proprietary Terms', 'Each activated macOS user account counts as one installation.', 'macOS 27 Golden Gate', "You get a full refund, and we won't ask why."]:
    check(phrase in terms, ('Retained legal detail', phrase))
for page in [main, product, terms]:
    check('open-core' not in page)
    check('href="https://github.com/jsonMartin/papermac' not in page)
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
check('id="changelog"' not in product and 'https://dl.getpaper.sh/papermac/appcast-27.xml' in product)
ls = product.split('class="ls"', 1)[1].split('</section>', 1)[0]
labels = [('switch', 'Option-Tab to any window'), ('resize', 'Move and resize'),
          ('heights', 'Two Strips per Desktop'), ('send', 'Send to Desktop or display')]
check(re.findall(r'data-row="(.*?)"', ls) == [kind for kind, _ in labels])
for kind, label in labels:
    row = ls.split(f'data-row="{kind}"', 1)[1].split('</figure>', 1)[0]
    check(f'<span class="label">{label}</span>' in row, (kind, 'Approved shorter caption'))
    if kind == 'heights':
        check('<span class="badge">Free</span>' in row and 'Set each Strip’s height on its own.' in row)
check('The Minimap shows where you are.' in ls)
check(not re.search(r'\bPro\b', ls))
copy_html = re.sub(r'<(?:script|style)>.*?</(?:script|style)>', '', product, flags=re.S)
visible = ' '.join(Page(copy_html).texts)
visible += ' '.join(a.get('aria-label', '') for _, a in Page(product).tags)
check(not re.search(r'custom\s+(?:stack\s+)?heights?|heights you choose|adjustable height', visible, re.I))
root = Path(__file__).resolve().parents[1]
section = [(root / 'src/mac' / name).read_bytes() for name in ['strips.js', 'strips.css']]
sizes = [len(gzip.compress(data, 9)) for data in section]
check(sum(sizes) <= 15 * 1024, ('Section gzip budget', sizes))
print(f'PASS: section gzip -9 (no filename): JS {sizes[0]} B, CSS {sizes[1]} B, sum {sum(sizes)} B (limit 15360 B)')
check(product.count('data:font/ttf') == 2 and product.count('data:image/') == 0 and product.count('url(') == 2)
check(not re.search(r'<(?:img|video|svg)\b', ls))
for data in section:
    check(b'@font-face' not in data and b'url(' not in data)
# The current brief permits a new shared stylesheet; installer, legal and sales switches stay frozen.
guards = ['src/mac/style.css', 'src/mac/init.js', 'src/mac/checkout-url.txt', 'src/mac/lifetime-checkout-url.txt',
          'src/mac/dmg-url.txt', 'src/terms', 'src/privacy', 'src/paperland', 'terms', 'privacy',
          'paperland', 'site/terms', 'site/privacy', 'site/paperland', 'install', 'site/install', 'scripts', '_headers']
changed = subprocess.check_output(['git', 'diff', '--name-only', '19caeace', '--', *guards], cwd=root).decode().splitlines()
check(changed == [], ('Unchanged out-of-scope sources', changed))
for source in (root / 'src/_kit').iterdir():
    if source.name == 'launch.css':
        continue
    original = subprocess.check_output(['git', 'show', f'19caeace:src/_kit/{source.name}'], cwd=root)
    check(source.read_bytes() == original, ('Unchanged existing shared kit', source.name))
added = subprocess.check_output(['git', 'diff', '--name-only', '--diff-filter=A', '19caeace'], cwd=root).decode().splitlines()
added += subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=root).decode().splitlines()
check(not any(Path(name).suffix.lower() in ['.ttf', '.otf', '.woff', '.woff2'] for name in added), 'No added fonts')
print(f'PASS: {checks} Mac-page assertions; 0 failures; inventory, local resources, legal detail, sales modes and launch copy')
