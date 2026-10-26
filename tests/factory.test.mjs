// Geometry checks for the connected floor plan: everything that should touch, touches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../js/data.js';
import { makeIndex, solve } from '../js/calc.js';
import { powerPlan } from '../js/power.js';
import { layoutPlan } from '../js/plan.js';
import { layoutFactory } from '../js/factory.js';
import { BUILDS } from '../js/ref-content.js';
import { buildInputs } from '../js/builds.js';

const index = makeIndex(DATA);
const factoryFor = (build, n) => {
  const { targets, opts, power } = buildInputs(DATA, build, n);
  const p = power ? powerPlan(DATA, power.genId, power.fuelId, power.count) : null;
  return layoutFactory(DATA, layoutPlan(DATA, solve(index, targets, opts), p));
};
const build = (id) => BUILDS.flatMap((s) => s.builds).find((b) => b.id === id);

function checkConnected(F, name) {
  const inLanes = F.lanes.filter((l) => l.dir === 'in');
  const outLanes = F.lanes.filter((l) => l.dir === 'out');
  for (const l of F.links) {
    if (l.kind === 'branch') {
      const lane = inLanes.find((x) => x.y === l.y && x.x1 === F.rowEnd && x.item === l.item);
      assert.ok(lane, `${name}: branch of ${l.item} at y=${l.y} lands on a bus-fed input belt`);
    } else {
      assert.ok(outLanes.find((x) => x.y === l.y && x.x2 === F.rowEnd && x.item === l.item), `${name}: join reaches an output belt`);
    }
    const c = F.channels.find((ch) => ch.x === (l.kind === 'branch' ? l.x1 : l.x2));
    assert.ok(c && l.y >= c.y1 && l.y <= c.y2, `${name}: link meets its bus line within its span`);
    // Hops are exactly the bus lines crossed.
    const lo = Math.min(l.x1, l.x2), hi = Math.max(l.x1, l.x2);
    const crossed = F.channels.filter((ch) => ch.x > lo + 1 && ch.x < hi - 1 && ch.y1 < l.y - 1 && ch.y2 > l.y + 1).length;
    assert.equal(l.hops.length, crossed, `${name}: hops`);
  }
  // Every bus-fed input belt gets at least one branch.
  for (const lane of inLanes.filter((x) => x.x1 === F.rowEnd)) {
    assert.ok(F.links.some((l) => l.kind === 'branch' && l.y === lane.y), `${name}: input belt at y=${lane.y} is fed`);
  }
  // Machines in a row never overlap and sit right of the sources.
  for (const a of F.machines) {
    assert.ok(a.x >= F.x0, `${name}: machine clear of sources`);
    for (const b of F.machines) if (a !== b && a.row === b.row) assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x, `${name}: overlap`);
  }
}

test('iron starter: ingot and rod bus lines feed the right rows', () => {
  const F = factoryFor(build('iron-start'));
  assert.deepEqual(F.channels.map((c) => c.item), ['Desc_IronIngot_C', 'Desc_IronRod_C']);
  const ingot = F.channels[0];
  assert.equal(ingot.branches.length, 2); // plates and rods
  assert.equal(F.channels[1].branches.length, 1); // screws
  assert.equal(F.sources.length, 1); // one miner feed
  assert.equal(F.stores.length, 3); // plates, rods, screws
  checkConnected(F, 'iron');
});

test('semi-auto biofuel: two Biomass bus lines merge into the Solid Biofuel belt', () => {
  const F = factoryFor(build('biofuel-semi'), 8);
  const bio = F.channels.filter((c) => c.item === 'Desc_GenericBiomass_C');
  assert.equal(bio.length, 2);
  const y = bio[0].branches[0].y;
  assert.equal(bio[1].branches[0].y, y);
  assert.ok(F.connectors.some((c) => c.kind === 'merger' && c.y === y && c.x > F.rowEnd), 'merger where the two lines meet');
  assert.equal(F.machines.filter((m) => m.kind === 'gen').length, 8);
  checkConnected(F, 'biofuel');
});

test('every build lays out fully connected', () => {
  for (const b of BUILDS.flatMap((s) => s.builds)) checkConnected(factoryFor(b), b.id);
});

test('calculator chains of all sizes stay connected', () => {
  for (const [item, rate] of [['Desc_Motor_C', 5], ['Desc_ModularFrameHeavy_C', 2], ['Desc_Computer_C', 2], ['Desc_IronPlate_C', 400]]) {
    checkConnected(layoutFactory(DATA, layoutPlan(DATA, solve(index, [{ item, rate }]))), item);
  }
});
