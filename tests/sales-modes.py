"""Exercise checkout combinations without changing the real checkout switches."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as directory:
    temporary = Path(directory)
    shutil.copytree(root / 'src', temporary / 'src')
    page = temporary / 'src/mac/index.html'
    for pro, lifetime in [('off', 'off'), ('https://example.invalid/pro', 'off'),
                          ('https://example.invalid/pro', 'https://example.invalid/lifetime'),
                          ('off', 'https://example.invalid/lifetime')]:
        (page.parent / 'checkout-url.txt').write_text(pro + '\n')
        (page.parent / 'lifetime-checkout-url.txt').write_text(lifetime + '\n')
        result = subprocess.run([sys.executable, str(root / 'scripts/bundle-page.py'), str(page)],
                                capture_output=True, text=True)
        if pro == 'off' and lifetime != 'off':
            assert result.returncode != 0
            assert result.stderr.strip() == 'Lifetime checkout needs Pro checkout on'
            assert not result.stdout
        else:
            assert result.returncode == 0, result.stderr
            html = result.stdout
            assert '{{' not in html
            assert html.count('30-day refund, for any reason.') == 1
            assert 'PaperMac is built by Jason Martin, an independent developer.' in html
            assert 'Questions before you buy? Email <a href="mailto:support@getpaper.sh">support@getpaper.sh</a>.' in html
            assert html.count('then $39<') == 1
            assert html.count('$39.50') == 1 and html.count('then $79.') == 1
            assert html.count('<code>BETABELIEVER</code>') == 1
            assert html.count('<code>FOREVERFOUNDER</code>') == 1
            assert html.count('class="btn quiet lifetime-cta"') == (1 if lifetime != 'off' else 0)
            assert html.count('trial-cta" href="#install">Start free</a>') == 1
            assert html.count('14 days of Pro: your first 7 days start automatically after setup. Extend once for 7 more days when you choose. No card. No automatic charge.') == 1
            assert 'Try Pro free for 14 days' not in html and 'Starts inside the app' not in html
            notice = '<p class="buy-notice">By buying, you agree to the <a href="/terms">Terms</a>.</p>'
            assert html.count(notice) == int(pro != 'off') + int(lifetime != 'off')
            assert html.count('class="sales-closed"') == int(pro == 'off')
            if pro != 'off':
                assert html.count('href="' + pro + '"') == 1
            else:
                assert 'href="https://example.invalid/' not in html
            if lifetime != 'off':
                assert html.count('href="' + lifetime + '"') == 1
            assert 'class="segno"' not in html
    # Checkout URLs are passed through intact, including the auto-applied code.
    for pro_code, lifetime_code in [('BETABELIEVER', 'FOREVERFOUNDER')]:
        pro_url = 'https://example.invalid/pro?checkout[discount_code]=' + pro_code
        lifetime_url = 'https://example.invalid/lifetime?checkout[discount_code]=' + lifetime_code
        (page.parent / 'checkout-url.txt').write_text(pro_url + '\n')
        (page.parent / 'lifetime-checkout-url.txt').write_text(lifetime_url + '\n')
        result = subprocess.run([sys.executable, str(root / 'scripts/bundle-page.py'), str(page)], capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        assert 'href="' + pro_url + '"' in result.stdout
        assert 'href="' + lifetime_url + '"' in result.stdout
print('4 checkout combinations and auto-applied founding codes passed, 0 failed (3 valid states; invalid Lifetime-only state refused)')
