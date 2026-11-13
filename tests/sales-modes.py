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
            assert '<div class="plain" role="list" aria-label="Purchase terms">\n      <div role="listitem"><strong>30-day refund, for any reason.</strong>' in html
            assert 'Email billing@getpaper.sh within 30 days of purchase for a full refund. We won\'t ask why.' in html
            assert html.count('<p class="to">Full refund within 30 days, for any reason.</p>') == (1 + (lifetime != 'off') if pro != 'off' else 0)
            assert 'PaperMac is built by Jason Martin, an independent developer.' in html
            assert 'Questions before you buy? Email <a href="mailto:support@getpaper.sh">support@getpaper.sh</a>.' in html

            assert '<s>' not in html
            assert html.count('<span class="was">Regular $39</span>') == 3
            assert html.count('<span class="was">Regular $79</span>') == (2 if lifetime != 'off' else 0)
            assert html.count('class="btn quiet lifetime-cta"') == (2 if lifetime != 'off' else 0)
            assert 'aria-label="Buy PaperMac 27 Pro or Lifetime"' in html if lifetime != 'off' else 'aria-label="Buy PaperMac 27 Pro"' in html
            if pro != 'off':
                assert 'QR code for the PaperMac 27 Pro checkout' in html
                assert html.count('trial-cta" href="#install"') == 2
                assert '<p class="sales-closed"' not in html
                assert html.count('href="' + pro + '"') == 3
            else:
                assert 'href="https://example.invalid/' not in html
                assert 'class="segno"' not in html
print('4 checkout combinations passed, 0 failed (3 valid states; invalid Lifetime-only state refused)')
