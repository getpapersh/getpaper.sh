import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../site/mac/index.html', import.meta.url), 'utf8');
const script = html.match(/<script id="checkout-attribution">([\s\S]*?)<\/script>/)[1];

test('both Buy links get sanitized attribution without changing product or quantity', () => {
  const scenarios = [
    ['?utm_source=reddit&utm_campaign=bf26', 'reddit', 'bf26'],
    ['', 'direct', 'direct'],
    ['?utm_source=%3Cscript%3E&utm_campaign=%20', 'script', 'direct'],
    ['?utm_source=&utm_campaign=' + 'a.B_9-'.repeat(12), 'direct', 'a.B_9-'.repeat(12).slice(0, 64)],
  ];
  const checkoutUrls = [
    'https://checkout.dodopayments.com/buy/pdt_0NsJXyoDXSvbMTClgWLF9?quantity=1',
    'https://checkout.dodopayments.com/buy/pdt_0NsJYAFEuCrx9em14riE8?quantity=1',
  ];
  for (const [search, source, campaign] of scenarios) {
    const links = checkoutUrls.map(href => ({ href }));
    runInNewContext(script, {
      URL, URLSearchParams, location: { search },
      document: { querySelectorAll: () => links },
    });
    for (const [i, link] of links.entries()) {
      const expected = new URL(checkoutUrls[i]);
      expected.searchParams.set('metadata_utm_source', source);
      expected.searchParams.set('metadata_utm_campaign', campaign);
      assert.equal(link.href, expected.href, search);
    }
  }
});
