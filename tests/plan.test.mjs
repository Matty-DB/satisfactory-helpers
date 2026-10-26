// Part counts worked out by hand: a row of N machines needs N−1 splitters per input belt
// and N−1 mergers per output belt; a belt that goes to K places needs K−1 splitters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../js/data.js';
import { makeIndex, solve } from '../js/calc.js';
import { powerPlan } from '../js/power.js';
import { layoutPlan, partsList } from '../js/plan.js';

const index = makeIndex(DATA);
const row = (plan, item) => plan.rows.find((r) => r.item === item && r.kind === 'step');

test('iron starter: splitters, mergers, storage and miners', () => {
  // 20 plate + 15 rod + 60 screw: smelters 2, plate 1, rod 2 (30 rods), screw 2 (1.5).
  const res = solve(index, [
    { item: 'Desc_IronPlate_C', rate: 20 }, { item: 'Desc_IronRod_C', rate: 15 }, { item: 'Desc_IronScrew_C', rate: 60 },
  ]);
  const plan = layoutPlan(DATA, res);
  assert.equal(row(plan, 'Desc_IronIngot_C').count, 2);
  assert.equal(row(plan, 'Desc_IronRod_C').count, 2);
  // Ingots go to plates and rods; rods go to screws and storage.
  assert.deepEqual(row(plan, 'Desc_IronIngot_C').outputs[0].to.map((t) => t.kind).sort(), ['row', 'row']);
  assert.deepEqual(row(plan, 'Desc_IronRod_C').outputs[0].to.map((t) => t.kind).sort(), ['row', 'storage']);
  assert.equal(row(plan, 'Desc_IronRod_C').outputs[0].to.find((t) => t.kind === 'storage').rate, 15);
  // splitters: smelter in 1 + ingot exit 1 + rod in 1 + rod exit 1 + screw in 1 = 5
  // mergers: smelter 1 + rod 1 + screw 1 = 3; containers: plate, rod, screw = 3; 1 Mk.1 miner for 60 ore
  assert.equal(plan.parts.splitters, 5);
  assert.equal(plan.parts.mergers, 3);
  assert.equal(plan.parts.containers, 3);
  assert.equal(plan.parts.miners, 1);
});

test('coal plant: generator manifold, water junctions, extractors', () => {
  const p = powerPlan(DATA, 'Desc_GeneratorCoal_C', 'Desc_Coal_C', 8);
  const plan = layoutPlan(DATA, solve(index, []), p);
  const gen = plan.rows.find((r) => r.kind === 'gen');
  assert.equal(gen.count, 8);
  // coal: 7 splitters along 8 generators; 120 coal from 2 Mk.1 miners → 1 merger
  assert.equal(plan.parts.splitters, 7);
  assert.equal(plan.parts.mergers, 1);
  assert.equal(plan.parts.miners, 2);
  // water: 7 junctions along the generators + 2 joining 3 extractors
  assert.equal(plan.parts.waterExtractors, 3);
  assert.equal(plan.parts.junctions, 9);
});

test('biomass build: fuel row feeds the burners, leaves come from a container', () => {
  const leaves = DATA.recipes.find((r) => r.n === 'Biomass (Leaves)').id;
  const res = solve(index, [{ item: 'Desc_GenericBiomass_C', rate: 40 }], { choice: { Desc_GenericBiomass_C: leaves } });
  const plan = layoutPlan(DATA, res, powerPlan(DATA, 'Desc_GeneratorBiomass_Automated_C', 'Desc_GenericBiomass_C', 4));
  const bio = row(plan, 'Desc_GenericBiomass_C');
  assert.deepEqual(bio.outputs[0].to.map((t) => t.kind), ['gen']); // all 40/min burned, none to storage
  const gen = plan.rows.find((r) => r.kind === 'gen');
  assert.equal(gen.inputs[0].from.kind, 'row');
  assert.equal(plan.sources[0].kind, 'hand');
  assert.equal(plan.parts.splitters, 3); // 4 burners
  assert.ok(partsList(plan).some((s) => s.includes('Conveyor Splitter')));
});

test('byproducts go to a sink lane', () => {
  const plan = layoutPlan(DATA, solve(index, [{ item: 'Desc_Plastic_C', rate: 20 }]));
  const r = row(plan, 'Desc_Plastic_C');
  assert.equal(r.outputs.find((l) => l.item === 'Desc_HeavyOilResidue_C').to[0].kind, 'sink');
  assert.equal(plan.parts.oilExtractors, 1);
});

test('more than 8 machines split into several rows', () => {
  const plan = layoutPlan(DATA, solve(index, [{ item: 'Desc_IronPlate_C', rate: 400 }]));
  assert.deepEqual(plan.rows.filter((r) => r.item === 'Desc_IronPlate_C').map((r) => r.count), [8, 8, 4]);
});
