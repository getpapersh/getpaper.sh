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
            assert html.count('class="btn quiet lifetime-cta"') == (2 if lifetime != 'off' else 0)
            assert 'aria-label="Buy PaperMac 27 Pro or Lifetime"' in html if lifetime != 'off' else 'aria-label="Buy PaperMac 27 Pro"' in html
            if pro != 'off':
                assert html.count('trial-cta" href="#install"') == 2
                assert '<p class="sales-closed"' not in html
                assert html.count('href="' + pro + '"') == 3
            else:
                assert 'href="https://example.invalid/' not in html
                assert 'class="segno"' not in html
print('4 checkout combinations passed, 0 failed (3 valid states; invalid Lifetime-only state refused)')
