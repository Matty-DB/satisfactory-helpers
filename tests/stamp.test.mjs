import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stamped } from '../tools/stamp.mjs';

test('index.html cache-busting hashes are current (run `npm run stamp`)', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(html, stamped(html));
});
