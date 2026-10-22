import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../mac/activate/index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function activate(search, clipboardWorks = true, fallbackWorks = true) {
  const events = [], listeners = {};
  const element = () => ({
    textContent: '',
    classList: { add(name) { events.push(name); }, toggle() {}, remove() {} },
    focus() {},
    querySelector() { return this; },
    addEventListener(name, handler) { listeners[name] = handler; },
  });
  const nodes = Object.fromEntries(['activate', 'live', 'act-title', 'act-key', 'act-copy'].map(id => [id, element()]));
  const location = { search, pathname: '/mac/activate/' };
  runInNewContext(script, {
    location, URLSearchParams,
    history: { replaceState(state, title, path) { events.push(['scrub', path]); location.search = ''; } },
    localStorage: { getItem() { events.push('theme'); return null; } },
    matchMedia: () => ({ matches: false }),
    navigator: { clipboard: { async writeText(text) { if (!clipboardWorks) throw Error('denied'); events.push(['copy', text]); } } },
    document: {
      documentElement: { dataset: {} },
      getElementById(id) { return nodes[id]; },
      createElement() { return { style: {}, select() {}, remove() {} }; },
      body: { append() {} },
      execCommand() { return fallbackWorks; },
    },
    addEventListener(name, handler) { listeners[name] = handler; },
    setTimeout() {}, clearTimeout() {},
  });
  listeners.DOMContentLoaded();
  return { events, nodes, listeners, location };
}

test('the key leaves the query before page work and copies from memory', async () => {
  const key = '38b1460a-5104-4067-a91d-77b872934d51';
  const page = activate('?key=' + key + '&receipt=synthetic');
  assert.deepEqual(page.events[0], ['scrub', '/mac/activate/']);
  assert.equal(page.location.search, '');
  assert.equal(page.nodes['act-key'].textContent, key);
  await page.listeners.click();
  assert.deepEqual(page.events.at(-1), ['copy', key]);
  assert.match(page.nodes.live.textContent, /Settings › License/);
});

test('untrusted key markup remains text', () => {
  const key = '<img src="https://example.invalid/leak">';
  assert.equal(activate('?key=' + encodeURIComponent(key)).nodes['act-key'].textContent, key);
});

test('missing and empty keys show recovery instructions', () => {
  for (const query of ['', '?key=', '?key=%20%20']) {
    const page = activate(query);
    assert.ok(page.events.includes('bad'));
    assert.equal(page.listeners.click, undefined);
  }
});

test('copy denial tells the buyer to select and copy the key', async () => {
  const page = activate('?key=synthetic-license-key', false, false);
  await page.listeners.click();
  assert.equal(page.nodes['act-copy'].textContent, 'Select and copy');
  assert.equal(page.nodes.live.textContent, 'Copy failed: select the key and copy it.');
});
