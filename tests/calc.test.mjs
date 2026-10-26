// Expected values are worked out by hand from the in-game recipes, not copied from the solver.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../js/data.js';
import { makeIndex, solve, buildTree, beltFor } from '../js/calc.js';

const index = makeIndex(DATA);
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: expected ${b}, got ${a}`);
const node = (res, item) => res.nodes.find((n) => n.item === item);
const altId = (name) => DATA.recipes.find((r) => r.alt && r.n === name).id;

test('60 Iron Plate/min, standard recipes', () => {
  const res = solve(index, [{ item: 'Desc_IronPlate_C', rate: 60 }]);
  near(node(res, 'Desc_IronPlate_C').machines, 3, 'constructors');
  near(node(res, 'Desc_IronIngot_C').machines, 3, 'smelters');
  near(res.raw.Desc_OreIron_C, 90, 'iron ore');
  near(res.power, 24, 'MW');
});

test('5 Reinforced Iron Plate/min, standard recipes', () => {
  const res = solve(index, [{ item: 'Desc_IronPlateReinforced_C', rate: 5 }]);
  near(node(res, 'Desc_IronPlateReinforced_C').machines, 1, 'assemblers');
  near(node(res, 'Desc_IronPlate_C').rate, 30, 'plates/min');
  near(node(res, 'Desc_IronPlate_C').machines, 1.5, 'plate constructors');
  near(node(res, 'Desc_IronScrew_C').rate, 60, 'screws/min');
  near(node(res, 'Desc_IronScrew_C').machines, 1.5, 'screw constructors');
  near(node(res, 'Desc_IronRod_C').rate, 15, 'rods/min');
  near(node(res, 'Desc_IronRod_C').machines, 1, 'rod constructors');
  near(res.raw.Desc_OreIron_C, 60, 'iron ore');
});

test('Cast Screw alt removes Iron Rod from the chain', () => {
  const cast = altId('Cast Screw');
  const opts = { alts: new Set([cast]), choice: { Desc_IronScrew_C: cast } };
  const res = solve(index, [{ item: 'Desc_IronPlateReinforced_C', rate: 5 }], opts);
  assert.equal(node(res, 'Desc_IronRod_C'), undefined);
  const screws = node(res, 'Desc_IronScrew_C');
  assert.equal(screws.recipe.id, cast);
  near(screws.machines, 1.2, 'cast screw constructors');
  near(screws.inputs[0][1], 15, 'ingots into screws');
  near(res.raw.Desc_OreIron_C, 60, 'iron ore');
});

test('alt recipes are ignored unless unlocked', () => {
  const cast = altId('Cast Screw');
  const res = solve(index, [{ item: 'Desc_IronScrew_C', rate: 40 }], { choice: { Desc_IronScrew_C: cast } });
  assert.notEqual(node(res, 'Desc_IronScrew_C').recipe.id, cast);
});

test('Recycled Plastic + Recycled Rubber loop terminates with a warning', () => {
  const rp = altId('Recycled Plastic'), rr = altId('Recycled Rubber');
  const opts = { alts: new Set([rp, rr]), choice: { Desc_Plastic_C: rp, Desc_Rubber_C: rr } };
  const t0 = performance.now();
  const res = solve(index, [{ item: 'Desc_Plastic_C', rate: 60 }], opts);
  buildTree(index, 'Desc_Plastic_C', 60, opts);
  assert.ok(performance.now() - t0 < 100, 'under 100 ms');
  assert.ok(res.cycles.length > 0, 'cycle reported');
  assert.ok(Object.keys(res.loopInputs).length > 0, 'loop input listed');
});

test('standard Plastic reports Heavy Oil Residue byproduct', () => {
  // Plastic: 3 Crude → 2 Plastic + 1 HOR per 6 s. 20 Plastic/min = 1 refinery → 10 HOR/min.
  const res = solve(index, [{ item: 'Desc_Plastic_C', rate: 20 }]);
  near(node(res, 'Desc_Plastic_C').machines, 1, 'refineries');
  near(res.byproducts.Desc_HeavyOilResidue_C, 10, 'HOR/min');
  near(res.raw.Desc_LiquidOil_C, 30, 'crude/min');
});

test('tier filter hides recipes above the reached tier', () => {
  const res = solve(index, [{ item: 'Desc_SteelIngot_C', rate: 45 }], { maxTier: 2 });
  assert.equal(res.nodes.length, 0);
  assert.ok(res.unavailable.Desc_SteelIngot_C);
});

test('belt tiers', () => {
  assert.deepEqual(beltFor(60, false), { mk: 1, lines: 1 });
  assert.deepEqual(beltFor(61, false), { mk: 2, lines: 1 });
  assert.deepEqual(beltFor(780, false), { mk: 5, lines: 1 });
  assert.deepEqual(beltFor(2400, false), { mk: 6, lines: 2 });
  assert.deepEqual(beltFor(450, true), { mk: 2, lines: 1 });
});

test('Turbofuel without its recipe is unavailable, not an unpackaging loop', () => {
  const res = solve(index, [{ item: 'Desc_LiquidTurboFuel_C', rate: 30 }]);
  assert.equal(res.cycles.length, 0);
  assert.ok(res.unavailable.Desc_LiquidTurboFuel_C);
});

test('split an item between two recipes', () => {
  // 32 Solid Biofuel: 8 Biomass → 4 SB per 4 s, so 64 Biomass/min and 0.533 constructors.
  // Half the Biomass (32) from leaves: 10 → 5 per 5 s (60/min per machine) → 0.533 machines, 64 leaves.
  // Half from wood: 4 → 20 per 4 s (300/min per machine) → 0.1067 machines, 6.4 wood.
  const leaves = DATA.recipes.find((r) => r.n === 'Biomass (Leaves)').id;
  const wood = DATA.recipes.find((r) => r.n === 'Biomass (Wood)').id;
  const res = solve(index, [{ item: 'Desc_Biofuel_C', rate: 32 }], {
    choice: { Desc_GenericBiomass_C: [{ id: leaves, share: 1 }, { id: wood, share: 1 }] },
  });
  const bio = res.nodes.filter((n) => n.item === 'Desc_GenericBiomass_C');
  assert.equal(bio.length, 2);
  near(bio.find((n) => n.recipe.id === leaves).machines, 32 / 60, 'leaf constructors');
  near(bio.find((n) => n.recipe.id === wood).machines, 32 / 300, 'wood constructors');
  near(res.raw.Desc_Leaves_C, 64, 'leaves');
  near(res.raw.Desc_Wood_C, 6.4, 'wood');
  near(node(res, 'Desc_Biofuel_C').machines, 32 / 60, 'biofuel constructors');
  const tree = buildTree(index, 'Desc_Biofuel_C', 32, { choice: { Desc_GenericBiomass_C: [{ id: leaves, share: 1 }, { id: wood, share: 1 }] } });
  assert.ok(tree.children[0].split);
  assert.equal(tree.children[0].children.length, 2);
});
