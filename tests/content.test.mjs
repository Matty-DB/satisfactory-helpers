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

test('every research pick exists in that MAM tree', async () => {
  const { RESEARCH_PICKS } = await import('../js/ref-content.js');
  const have = new Set(DATA.research.map((r) => `${r.tree}|${r.n}`));
  const missing = RESEARCH_PICKS.flatMap((s) => s.picks.map(([t, n]) => `${t}|${n}`)).filter((k) => !have.has(k));
  assert.deepEqual(missing, []);
});

test('research cost items are all known items', () => {
  const missing = DATA.research.flatMap((r) => r.cost.map(([id]) => id)).filter((id) => !DATA.items[id]);
  assert.deepEqual(missing, []);
});

test('every build references real items, recipes, alts and generators', async () => {
  const { BUILDS } = await import('../js/ref-content.js');
  const items = new Set(Object.values(DATA.items).map((i) => i.n));
  const recipes = new Set(DATA.recipes.map((r) => r.n));
  const alts = new Set(DATA.recipes.filter((r) => r.alt).map((r) => r.n));
  const bad = [];
  for (const b of BUILDS.flatMap((s) => s.builds)) {
    for (const [n] of b.targets || []) if (!items.has(n)) bad.push(`${b.id}: item ${n}`);
    for (const [i, r] of Object.entries(b.choice || {})) {
      if (!items.has(i)) bad.push(`${b.id}: choice item ${i}`);
      if (!recipes.has(r)) bad.push(`${b.id}: recipe ${r}`);
    }
    for (const a of b.alts || []) if (!alts.has(a)) bad.push(`${b.id}: alt ${a}`);
    if (b.power) {
      const g = DATA.generators.find((x) => x.n === b.power[0]);
      if (!g) bad.push(`${b.id}: generator ${b.power[0]}`);
      else if (!g.fuels.some(([f]) => DATA.items[f]?.n === b.power[1])) bad.push(`${b.id}: fuel ${b.power[1]}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every build solves with nothing missing', async () => {
  const { BUILDS } = await import('../js/ref-content.js');
  const { buildInputs } = await import('../js/builds.js');
  const { makeIndex, solve } = await import('../js/calc.js');
  const index = makeIndex(DATA);
  const bad = [];
  for (const b of BUILDS.flatMap((s) => s.builds)) {
    const { targets, opts } = buildInputs(DATA, b);
    if (!targets.length) continue;
    const res = solve(index, targets, opts);
    if (Object.keys(res.unavailable).length) bad.push(`${b.id}: ${Object.keys(res.unavailable)}`);
    if (res.cycles.length) bad.push(`${b.id}: cycle`);
    for (const t of targets) if (res.nodes.find((n) => n.item === t.item)?.recipe.tier > b.tier && !b.alts) bad.push(`${b.id}: above tier ${b.tier}`);
  }
  assert.deepEqual(bad, []);
});
