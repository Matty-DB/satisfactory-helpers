// Expected values worked out by hand from in-game generator stats.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../js/data.js';
import { powerPlan, generatorsFor } from '../js/power.js';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: expected ${b}, got ${a}`);

test('8 coal generators', () => {
  // 75 MW each, Coal 300 MJ → 15/min; water 45 m³/min each.
  const p = powerPlan(DATA, 'Desc_GeneratorCoal_C', 'Desc_Coal_C', 8);
  near(p.fuelPerGen, 15, 'coal per gen');
  near(p.waterPerGen, 45, 'water per gen');
  near(p.fuelTotal, 120, 'coal total');
  near(p.waterTotal, 360, 'water total');
  assert.equal(p.waterExtractors, 3);
  near(p.gross, 600, 'gross MW');
  near(p.net, 540, 'net MW after 3×20 MW extractors');
  assert.deepEqual(p.miners.map((m) => m.count), [2, 1, 1]); // Mk.1 60, Mk.2 120, Mk.3 240 per normal node
});

test('fuel generator on Fuel', () => {
  // 250 MW, Fuel 750 MJ → 20 m³/min, no water.
  const p = powerPlan(DATA, 'Desc_GeneratorFuel_C', 'Desc_LiquidFuel_C', 1);
  near(p.fuelPerGen, 20, 'fuel per gen');
  assert.equal(p.waterExtractors, 0);
  assert.deepEqual(p.miners, []);
});

test('biomass burner on Solid Biofuel', () => {
  // 30 MW, Solid Biofuel 450 MJ → 4/min.
  near(powerPlan(DATA, 'Desc_GeneratorBiomass_Automated_C', 'Desc_Biofuel_C', 1).fuelPerGen, 4, 'biofuel per burner');
});

test('nuclear plant on uranium rods', () => {
  // 2500 MW, 750 000 MJ → 0.2 rods/min; water 2500 × 1.6 × 60 / 1000 = 240 m³/min.
  const p = powerPlan(DATA, 'Desc_GeneratorNuclear_C', 'Desc_NuclearFuelRod_C', 1);
  near(p.fuelPerGen, 0.2, 'rods per plant');
  near(p.waterPerGen, 240, 'water per plant');
  assert.equal(p.waterExtractors, 2);
});

test('generators needed for a net target', () => {
  // 1000 MW net of coal: 14 gens = 1050 gross, 630 water → 6 extractors (120 MW) → 930. 15 gens: 1125, 675 → 6 → 1005.
  assert.equal(generatorsFor(DATA, 'Desc_GeneratorCoal_C', 'Desc_Coal_C', 1000), 15);
});
