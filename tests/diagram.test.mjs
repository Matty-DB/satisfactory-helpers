import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../js/data.js';
import { makeIndex, solve } from '../js/calc.js';
import { graphOf, layoutFlow, layoutFloor } from '../js/diagram.js';

const index = makeIndex(DATA);
const rip = solve(index, [{ item: 'Desc_IronPlateReinforced_C', rate: 5 }]);

test('levels run from raw ore to the target', () => {
  const { nodes } = graphOf(rip);
  const lv = (id) => nodes.get(id).level;
  assert.equal(lv('Desc_OreIron_C'), 0);
  assert.equal(lv('Desc_IronIngot_C'), 1);
  assert.equal(lv('Desc_IronPlate_C'), 2);
  assert.equal(lv('Desc_IronRod_C'), 2);
  assert.equal(lv('Desc_IronScrew_C'), 3);
  assert.equal(lv('Desc_IronPlateReinforced_C'), 4);
});

test('flow edges always point downward and boxes do not overlap', () => {
  const L = layoutFlow(rip);
  for (const e of L.edges) assert.ok(e.ty > e.sy, `${e.from}->${e.to}`);
  for (const a of L.boxes) for (const b of L.boxes) {
    if (a === b || a.y !== b.y) continue;
    assert.ok(Math.abs(a.x - b.x) >= 190, 'boxes overlap');
  }
  assert.equal(L.edges.length, 6); // ore→ingot, ingot→plate, ingot→rod, rod→screw, plate→rip, screw→rip
});

test('floor plan: one row per step, rows ordered raw-first, big steps split', () => {
  const { rows } = layoutFloor(rip);
  const per = Object.fromEntries(rows.map((r) => [r.step.item, r.machines]));
  assert.deepEqual(per, {
    Desc_IronIngot_C: 2, Desc_IronPlate_C: 2, Desc_IronRod_C: 1, Desc_IronScrew_C: 2, Desc_IronPlateReinforced_C: 1,
  });
  const levels = rows.map((r) => r.step.item);
  assert.ok(levels.indexOf('Desc_IronRod_C') < levels.indexOf('Desc_IronScrew_C'), 'rods before screws');
  assert.equal(rows[0].step.item, 'Desc_IronIngot_C');
  assert.equal(rows.at(-1).step.item, 'Desc_IronPlateReinforced_C');
  // 2 Constructors: 2×(8+1)+1 = 19 m wide → 3 foundations; depth 2+10+2 = 14 m → 2.
  const plate = rows.find((r) => r.step.item === 'Desc_IronPlate_C');
  assert.equal(plate.fx, 3);
  assert.equal(plate.fy, 2);
  const big = layoutFloor(solve(index, [{ item: 'Desc_IronPlate_C', rate: 400 }])).rows;
  const plates = big.filter((r) => r.step.item === 'Desc_IronPlate_C');
  assert.deepEqual(plates.map((r) => r.machines), [8, 8, 4]); // 20 constructors, max 8 per row
});

test('loops render as separate input nodes', () => {
  const rp = DATA.recipes.find((r) => r.alt && r.n === 'Recycled Plastic').id;
  const rr = DATA.recipes.find((r) => r.alt && r.n === 'Recycled Rubber').id;
  const res = solve(index, [{ item: 'Desc_Plastic_C', rate: 60 }], { alts: new Set([rp, rr]), choice: { Desc_Plastic_C: rp, Desc_Rubber_C: rr } });
  const L = layoutFlow(res);
  assert.ok(L.edges.some((e) => e.loop));
  for (const e of L.edges) assert.ok(e.ty > e.sy);
});
