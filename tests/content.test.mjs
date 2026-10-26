import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../js/data.js';
import { BEST_ALTS, SPACE_ELEVATOR } from '../js/ref-content.js';

test('every curated alt exists as an alternate recipe', () => {
  const alts = new Set(DATA.recipes.filter((r) => r.alt).map((r) => r.n));
  const missing = BEST_ALTS.flatMap((g) => g.picks.map(([n]) => n)).filter((n) => !alts.has(n));
  assert.deepEqual(missing, []);
});

test('every Space Elevator part exists as an item', () => {
  const names = new Set(Object.values(DATA.items).map((i) => i.n));
  const missing = SPACE_ELEVATOR.flatMap((p) => p.cost.map(([n]) => n)).filter((n) => !names.has(n));
  assert.deepEqual(missing, []);
});
